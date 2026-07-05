package controller

import (
	"encoding/csv"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
)

// ─────────────────────────────────────────────────────────────
// 企业控制台 (per-tenant) · 所有接口按当前管理员所属企业过滤
// 路由: /api/enterprise/*  (middleware: AdminAuth)
// 鉴权进一步限制: 当前用户必须是某企业的管理员 (users.enterprise_admin_of > 0)
// ─────────────────────────────────────────────────────────────

// requireConsoleEnterprise 取当前管理员所属企业 ID，若不是企业管理员则直接返回 false。
// 返回 (entId, ok)。
func requireConsoleEnterprise(c *gin.Context) (uint, bool) {
	uid := c.GetInt("id")
	if uid <= 0 {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "未登录"})
		return 0, false
	}
	var u model.User
	if err := model.DB.Select("id, enterprise_admin_of").Where("id = ?", uid).First(&u).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "用户不存在"})
		return 0, false
	}
	if u.EnterpriseAdminOf <= 0 {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "您不是任何企业的管理员，请联系平台管理员开通企业并设为管理员"})
		return 0, false
	}
	return uint(u.EnterpriseAdminOf), true
}

// enterpriseMemberIds 返回当前企业的所有成员 user_id 列表（用于过滤 tokens/logs）
func enterpriseMemberIds(entId uint) ([]int, error) {
	ids := make([]int, 0)
	err := model.DB.Table("enterprise_members").
		Where("enterprise_id = ? AND deleted_at IS NULL", entId).
		Pluck("user_id", &ids).Error
	return ids, err
}

// recordAudit 写企业审计日志，自动绑定 enterprise_id
func recordAudit(c *gin.Context, eventType, resource, resourceId, result, detail string) {
	actorId := c.GetInt("id")
	actorName := c.GetString("username")
	actorEmail := ""
	var u model.User
	if err := model.DB.Select("email, enterprise_admin_of").Where("id = ?", actorId).First(&u).Error; err == nil {
		actorEmail = u.Email
	}
	entId := uint(u.EnterpriseAdminOf)
	model.InsertAuditLog(&model.EnterpriseAuditLog{
		EnterpriseId: entId,
		ActorId:      actorId,
		ActorName:    actorName,
		ActorEmail:   actorEmail,
		EventType:    eventType,
		Resource:     resource,
		ResourceId:   resourceId,
		Result:       result,
		Ip:           c.ClientIP(),
		Detail:       detail,
	})
}

// monthlyBudgetForEnterprise 从 enterprise_limits 读取本企业月度预算（quota 单位）
// 返回 (max_quota, used_quota)
func monthlyBudgetForEnterprise(entId uint) (int64, int64) {
	var l model.EnterpriseLimit
	err := model.DB.Where(
		"enterprise_id = ? AND scope_type = ? AND scope_id = 0 AND period = ?",
		entId, model.LimitScopeEnterprise, model.LimitPeriodMonthly,
	).First(&l).Error
	if err != nil {
		return 0, 0
	}
	model.MaybeResetPeriod(&l)
	return l.MaxQuota, l.UsedQuota
}

// quotaToYuan: 500000 quota = 1 USD ≈ 6.78 元（与前端保持一致仅用 USD）
const quotaPerUSD = 500000.0

// monthStartUnix 本月 1 号 0 点 Unix
func monthStartUnix() int64 {
	now := time.Now()
	return time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location()).Unix()
}

// ─── Overview ──────────────────────────────────────────────────────────

// EnterpriseGetOverview GET /api/enterprise/overview
func EnterpriseGetOverview(c *gin.Context) {
	entId, ok := requireConsoleEnterprise(c)
	if !ok {
		return
	}

	// 企业元数据
	ent, err := model.GetEnterpriseById(entId)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "企业不存在"})
		return
	}

	// 本企业成员数 / token 数
	var memberCount int64
	model.DB.Model(&model.EnterpriseMember{}).
		Where("enterprise_id = ? AND deleted_at IS NULL", entId).
		Count(&memberCount)

	memberIds, _ := enterpriseMemberIds(entId)
	var tokenCount int64
	if len(memberIds) > 0 {
		model.DB.Model(&model.Token{}).Where("user_id IN ?", memberIds).Count(&tokenCount)
	}

	// 本月用量（按本企业成员聚合 quota_data）
	monthStart := monthStartUnix()
	var monthlyQuota int64
	if len(memberIds) > 0 {
		model.DB.Model(&model.QuotaData{}).
			Where("user_id IN ? AND created_at >= ?", memberIds, monthStart).
			Select("COALESCE(SUM(quota), 0)").Scan(&monthlyQuota)
	}

	// 本月按 group 分布（成员的 user.group + 消费聚合）
	type GroupStat struct {
		Group       string `json:"group"`
		MemberCount int64  `json:"member_count"`
		UsedQuota   int64  `json:"used_quota"`
	}
	var groupStats []GroupStat
	if len(memberIds) > 0 {
		gc := model.GetGroupCol()
		model.DB.Raw(`
			SELECT u.`+gc+`, COUNT(DISTINCT u.id) AS member_count, COALESCE(SUM(qd.quota), 0) AS used_quota
			FROM users u
			LEFT JOIN quota_data qd ON qd.user_id = u.id AND qd.created_at >= ?
			WHERE u.id IN ? AND u.deleted_at IS NULL
			GROUP BY u.`+gc+`
			ORDER BY used_quota DESC
		`, monthStart, memberIds).Scan(&groupStats)
	}

	// 月度预算（从 enterprise_limits 取）
	maxBudget, usedBudget := monthlyBudgetForEnterprise(entId)

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"workspace_name":  ent.Name,
			"member_count":    memberCount,
			"token_count":     tokenCount,
			"monthly_quota":   monthlyQuota,
			"monthly_budget":  float64(maxBudget) / quotaPerUSD, // USD
			"monthly_used":    float64(usedBudget) / quotaPerUSD,
			"group_stats":     groupStats,
			"enterprise_id":   entId,
		},
	})
}

// ─── Team Members ────────────────────────────────────────────────────

// EnterpriseListMembers GET /api/enterprise/members
func EnterpriseListMembers(c *gin.Context) {
	entId, ok := requireConsoleEnterprise(c)
	if !ok {
		return
	}
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))
	search := c.Query("search")
	if page <= 0 {
		page = 1
	}
	if pageSize <= 0 || pageSize > 100 {
		pageSize = 20
	}

	memberIds, _ := enterpriseMemberIds(entId)
	if len(memberIds) == 0 {
		c.JSON(http.StatusOK, gin.H{"success": true, "data": []any{}, "total": 0})
		return
	}

	var users []model.User
	var total int64
	q := model.DB.Model(&model.User{}).Where("id IN ?", memberIds)
	if search != "" {
		q = q.Where("username LIKE ? OR email LIKE ? OR display_name LIKE ?",
			"%"+search+"%", "%"+search+"%", "%"+search+"%")
	}
	q.Count(&total)
	offset := (page - 1) * pageSize
	err := q.Select("id, username, email, display_name, role, status, "+model.GetGroupCol()+", used_quota, created_at, last_login_at").
		Order("created_at DESC").Offset(offset).Limit(pageSize).Find(&users).Error
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": users, "total": total})
}

// EnterpriseUpdateMemberRole PUT /api/enterprise/members/:id
func EnterpriseUpdateMemberRole(c *gin.Context) {
	entId, ok := requireConsoleEnterprise(c)
	if !ok {
		return
	}
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "invalid id"})
		return
	}
	// 校验目标用户属于本企业
	var em model.EnterpriseMember
	if err := model.DB.Where("user_id = ? AND enterprise_id = ? AND deleted_at IS NULL", id, entId).
		First(&em).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "目标用户不属于本企业"})
		return
	}
	var body struct {
		Role   int    `json:"role"`
		Group  string `json:"group"`
		Status int    `json:"status"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	updates := map[string]interface{}{}
	if body.Role > 0 {
		updates["role"] = body.Role
	}
	if body.Group != "" {
		updates["group"] = body.Group
	}
	if body.Status > 0 {
		updates["status"] = body.Status
	}
	if len(updates) == 0 {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "nothing to update"})
		return
	}
	if err := model.DB.Model(&model.User{}).Where("id = ?", id).Updates(updates).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	recordAudit(c, "member.role_changed", "member", strconv.Itoa(id), model.AuditResultSuccess,
		fmt.Sprintf("updates: %v", updates))
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "updated"})
}

// EnterpriseDisableMember DELETE /api/enterprise/members/:id
func EnterpriseDisableMember(c *gin.Context) {
	entId, ok := requireConsoleEnterprise(c)
	if !ok {
		return
	}
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "invalid id"})
		return
	}
	var em model.EnterpriseMember
	if err := model.DB.Where("user_id = ? AND enterprise_id = ? AND deleted_at IS NULL", id, entId).
		First(&em).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "目标用户不属于本企业"})
		return
	}
	if err := model.DB.Model(&model.User{}).Where("id = ?", id).Update("status", 2).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	recordAudit(c, "member.disabled", "member", strconv.Itoa(id), model.AuditResultSuccess, "")
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "disabled"})
}

// ─── Tokens (API Keys) ───────────────────────────────────────────────

type enterpriseTokenResponse struct {
	model.Token
	CreatorName string `json:"creator_name"`
}

// EnterpriseListKeys GET /api/enterprise/keys
func EnterpriseListKeys(c *gin.Context) {
	entId, ok := requireConsoleEnterprise(c)
	if !ok {
		return
	}
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))
	if page <= 0 {
		page = 1
	}
	if pageSize <= 0 || pageSize > 100 {
		pageSize = 20
	}

	memberIds, _ := enterpriseMemberIds(entId)
	if len(memberIds) == 0 {
		c.JSON(http.StatusOK, gin.H{"success": true, "data": []any{}, "total": 0})
		return
	}

	var tokens []model.Token
	var total int64
	q := model.DB.Model(&model.Token{}).Where("user_id IN ?", memberIds)
	q.Count(&total)
	offset := (page - 1) * pageSize
	if err := q.Order("id DESC").Offset(offset).Limit(pageSize).Find(&tokens).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}

	userIds := make([]int, 0, len(tokens))
	for _, t := range tokens {
		userIds = append(userIds, t.UserId)
	}
	var users []model.User
	model.DB.Select("id, username").Where("id IN ?", userIds).Find(&users)
	userMap := map[int]string{}
	for _, u := range users {
		userMap[u.Id] = u.Username
	}

	result := make([]enterpriseTokenResponse, 0, len(tokens))
	for _, t := range tokens {
		masked := t
		masked.Key = model.MaskTokenKey(t.Key)
		result = append(result, enterpriseTokenResponse{Token: masked, CreatorName: userMap[t.UserId]})
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": result, "total": total})
}

// EnterpriseCreateKey POST /api/enterprise/keys
func EnterpriseCreateKey(c *gin.Context) {
	entId, ok := requireConsoleEnterprise(c)
	if !ok {
		return
	}
	var body struct {
		UserId         int      `json:"user_id"`
		Name           string   `json:"name"`
		RemainQuota    int      `json:"remain_quota"`
		UnlimitedQuota bool     `json:"unlimited_quota"`
		ExpiredTime    int64    `json:"expired_time"`
		ModelLimits    []string `json:"model_limits"`
		AllowIps       string   `json:"allow_ips"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	if body.Name == "" {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "name required"})
		return
	}
	userId := body.UserId
	if userId == 0 {
		userId = c.GetInt("id")
	}
	// 校验 userId 属于本企业
	var em model.EnterpriseMember
	if err := model.DB.Where("user_id = ? AND enterprise_id = ? AND deleted_at IS NULL", userId, entId).
		First(&em).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "目标用户不属于本企业"})
		return
	}

	key := "sk-" + common.GetRandomString(48)
	modelLimitsEnabled := len(body.ModelLimits) > 0
	modelLimitsStr := strings.Join(body.ModelLimits, ",")
	allowIps := body.AllowIps
	expiredTime := int64(-1)
	if body.ExpiredTime > 0 {
		expiredTime = body.ExpiredTime
	}
	token := &model.Token{
		UserId:             userId,
		Name:               body.Name,
		Key:                key,
		Status:             1,
		CreatedTime:        common.GetTimestamp(),
		AccessedTime:       0,
		ExpiredTime:        expiredTime,
		RemainQuota:        body.RemainQuota,
		UnlimitedQuota:     body.UnlimitedQuota,
		ModelLimitsEnabled: modelLimitsEnabled,
		ModelLimits:        modelLimitsStr,
		AllowIps:           &allowIps,
	}
	if err := model.DB.Create(token).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	recordAudit(c, "api_key.created", "token", strconv.Itoa(token.Id), model.AuditResultSuccess, body.Name)
	c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"id": token.Id, "key": key, "name": body.Name}})
}

// tokenBelongsToEnterprise 校验 token 是否属于本企业（通过 owner user_id）
func tokenBelongsToEnterprise(tokenId int, entId uint) bool {
	var t model.Token
	if err := model.DB.Select("user_id").Where("id = ?", tokenId).First(&t).Error; err != nil {
		return false
	}
	var em model.EnterpriseMember
	return model.DB.Where("user_id = ? AND enterprise_id = ? AND deleted_at IS NULL", t.UserId, entId).
		First(&em).Error == nil
}

// EnterpriseUpdateKey PUT /api/enterprise/keys/:id
func EnterpriseUpdateKey(c *gin.Context) {
	entId, ok := requireConsoleEnterprise(c)
	if !ok {
		return
	}
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "invalid id"})
		return
	}
	if !tokenBelongsToEnterprise(id, entId) {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "key 不属于本企业"})
		return
	}
	var body struct {
		Name           string   `json:"name"`
		RemainQuota    int      `json:"remain_quota"`
		UnlimitedQuota bool     `json:"unlimited_quota"`
		ExpiredTime    int64    `json:"expired_time"`
		ModelLimits    []string `json:"model_limits"`
		AllowIps       string   `json:"allow_ips"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	modelLimitsEnabled := len(body.ModelLimits) > 0
	modelLimitsStr := strings.Join(body.ModelLimits, ",")
	allowIps := body.AllowIps
	expiredTime := int64(-1)
	if body.ExpiredTime > 0 {
		expiredTime = body.ExpiredTime
	}
	updates := map[string]interface{}{
		"name":                 body.Name,
		"remain_quota":         body.RemainQuota,
		"unlimited_quota":      body.UnlimitedQuota,
		"expired_time":         expiredTime,
		"model_limits_enabled": modelLimitsEnabled,
		"model_limits":         modelLimitsStr,
		"allow_ips":            allowIps,
	}
	if err := model.DB.Model(&model.Token{}).Where("id = ?", id).Updates(updates).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	recordAudit(c, "api_key.updated", "token", strconv.Itoa(id), model.AuditResultSuccess, body.Name)
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "updated"})
}

// EnterpriseDeleteKey DELETE /api/enterprise/keys/:id
func EnterpriseDeleteKey(c *gin.Context) {
	entId, ok := requireConsoleEnterprise(c)
	if !ok {
		return
	}
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "invalid id"})
		return
	}
	if !tokenBelongsToEnterprise(id, entId) {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "key 不属于本企业"})
		return
	}
	if err := model.DB.Delete(&model.Token{}, id).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	recordAudit(c, "api_key.deleted", "token", strconv.Itoa(id), model.AuditResultSuccess, "")
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "deleted"})
}

// EnterpriseToggleKeyStatus PATCH /api/enterprise/keys/:id/status
func EnterpriseToggleKeyStatus(c *gin.Context) {
	entId, ok := requireConsoleEnterprise(c)
	if !ok {
		return
	}
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "invalid id"})
		return
	}
	if !tokenBelongsToEnterprise(id, entId) {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "key 不属于本企业"})
		return
	}
	var body struct {
		Status int `json:"status"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || (body.Status != 1 && body.Status != 2) {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "status must be 1 or 2"})
		return
	}
	if err := model.DB.Model(&model.Token{}).Where("id = ?", id).Update("status", body.Status).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	action := "api_key.enabled"
	if body.Status == 2 {
		action = "api_key.disabled"
	}
	recordAudit(c, action, "token", strconv.Itoa(id), model.AuditResultSuccess, "")
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "updated"})
}

// ─── Audit Logs ──────────────────────────────────────────────────────

// EnterpriseGetAuditLogs GET /api/enterprise/audit-logs
func EnterpriseGetAuditLogs(c *gin.Context) {
	entId, ok := requireConsoleEnterprise(c)
	if !ok {
		return
	}
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))
	eventType := c.Query("event_type")
	result := c.Query("result")
	if page <= 0 {
		page = 1
	}
	if pageSize <= 0 || pageSize > 100 {
		pageSize = 20
	}
	list, total, err := model.GetAuditLogs(entId, eventType, result, page, pageSize)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": list, "total": total})
}

// ─── Settings (workspace_name + monthly_budget) ──────────────────────

// EnterpriseGetSettings GET /api/enterprise/settings
func EnterpriseGetSettings(c *gin.Context) {
	entId, ok := requireConsoleEnterprise(c)
	if !ok {
		return
	}
	ent, err := model.GetEnterpriseById(entId)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "企业不存在"})
		return
	}
	maxBudget, _ := monthlyBudgetForEnterprise(entId)
	budgetAlerts := []int{50, 75, 90, 100}
	if v, ok := common.OptionMap["WorkspaceBudgetAlerts"]; ok && v != "" {
		parts := strings.Split(v, ",")
		budgetAlerts = make([]int, 0, len(parts))
		for _, p := range parts {
			n, err := strconv.Atoi(strings.TrimSpace(p))
			if err == nil {
				budgetAlerts = append(budgetAlerts, n)
			}
		}
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"workspace_name":          ent.Name,
			"monthly_budget":          float64(maxBudget) / quotaPerUSD,
			"budget_alert_thresholds": budgetAlerts,
		},
	})
}

// EnterpriseUpdateSettings PUT /api/enterprise/settings
func EnterpriseUpdateSettings(c *gin.Context) {
	entId, ok := requireConsoleEnterprise(c)
	if !ok {
		return
	}
	var body struct {
		WorkspaceName         string  `json:"workspace_name"`
		MonthlyBudget         float64 `json:"monthly_budget"`
		BudgetAlertThresholds []int   `json:"budget_alert_thresholds"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}

	// 1) 更新企业名（写 enterprises 表）
	if body.WorkspaceName != "" {
		if err := model.DB.Model(&model.Enterprise{}).Where("id = ?", entId).
			Update("name", body.WorkspaceName).Error; err != nil {
			c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
			return
		}
	}

	// 2) 更新月度预算（upsert enterprise_limits）
	maxQuota := int64(body.MonthlyBudget * quotaPerUSD)
	var l model.EnterpriseLimit
	err := model.DB.Where(
		"enterprise_id = ? AND scope_type = ? AND scope_id = 0 AND period = ?",
		entId, model.LimitScopeEnterprise, model.LimitPeriodMonthly,
	).First(&l).Error
	if err == nil {
		l.MaxQuota = maxQuota
		model.UpdateEnterpriseLimit(&l)
	} else if maxQuota > 0 {
		_ = model.CreateEnterpriseLimit(&model.EnterpriseLimit{
			EnterpriseId: entId,
			ScopeType:    model.LimitScopeEnterprise,
			ScopeId:      0,
			Period:       model.LimitPeriodMonthly,
			MaxQuota:     maxQuota,
			EnforceHard:  false, // 软告警；不阻断业务
		})
	}

	// 3) 告警阈值（暂时全局，未来按企业拆分）
	if len(body.BudgetAlertThresholds) > 0 {
		parts := make([]string, len(body.BudgetAlertThresholds))
		for i, v := range body.BudgetAlertThresholds {
			parts[i] = strconv.Itoa(v)
		}
		_ = model.UpdateOption("WorkspaceBudgetAlerts", strings.Join(parts, ","))
	}

	recordAudit(c, "workspace.settings_updated", "workspace", strconv.Itoa(int(entId)), model.AuditResultSuccess, "")
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "saved"})
}

// ─── P1.3 成员费用排行榜 ─────────────────────────────────────────────

// EnterpriseTopSpenders GET /api/enterprise/insights/top-spenders?limit=10
// 返回本月消费 top N 用户
func EnterpriseTopSpenders(c *gin.Context) {
	entId, ok := requireConsoleEnterprise(c)
	if !ok {
		return
	}
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "10"))
	if limit <= 0 || limit > 100 {
		limit = 10
	}
	memberIds, _ := enterpriseMemberIds(entId)
	if len(memberIds) == 0 {
		c.JSON(http.StatusOK, gin.H{"success": true, "data": []any{}})
		return
	}
	monthStart := monthStartUnix()

	type Row struct {
		UserId      int    `json:"user_id"`
		Username    string `json:"username"`
		Email       string `json:"email"`
		DisplayName string `json:"display_name"`
		UsedQuota   int64  `json:"used_quota"`
		ReqCount    int64  `json:"req_count"`
	}
	var rows []Row
	err := model.DB.Raw(`
		SELECT u.id AS user_id, u.username, u.email, u.display_name,
		       COALESCE(SUM(qd.quota), 0) AS used_quota,
		       COALESCE(SUM(qd.count), 0) AS req_count
		FROM users u
		LEFT JOIN quota_data qd ON qd.user_id = u.id AND qd.created_at >= ?
		WHERE u.id IN ?
		GROUP BY u.id, u.username, u.email, u.display_name
		ORDER BY used_quota DESC
		LIMIT ?
	`, monthStart, memberIds, limit).Scan(&rows).Error
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": rows})
}

// ─── P1.4 模型成本分布 ──────────────────────────────────────────────

// EnterpriseModelBreakdown GET /api/enterprise/insights/model-breakdown
// 返回本月本企业成员按 model_name 聚合的消费分布
func EnterpriseModelBreakdown(c *gin.Context) {
	entId, ok := requireConsoleEnterprise(c)
	if !ok {
		return
	}
	memberIds, _ := enterpriseMemberIds(entId)
	if len(memberIds) == 0 {
		c.JSON(http.StatusOK, gin.H{"success": true, "data": []any{}})
		return
	}
	monthStart := monthStartUnix()

	type Row struct {
		ModelName  string `json:"model_name"`
		UsedQuota  int64  `json:"used_quota"`
		ReqCount   int64  `json:"req_count"`
	}
	var rows []Row
	err := model.DB.Raw(`
		SELECT model_name,
		       COALESCE(SUM(quota), 0) AS used_quota,
		       COALESCE(SUM(count), 0) AS req_count
		FROM quota_data
		WHERE user_id IN ? AND created_at >= ? AND model_name != ''
		GROUP BY model_name
		ORDER BY used_quota DESC
	`, memberIds, monthStart).Scan(&rows).Error
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": rows})
}

// ─── P1.5 导出 CSV ──────────────────────────────────────────────────

// EnterpriseExportMembers GET /api/enterprise/export/members.csv
// 导出本月成员消费明细
func EnterpriseExportMembers(c *gin.Context) {
	entId, ok := requireConsoleEnterprise(c)
	if !ok {
		return
	}
	memberIds, _ := enterpriseMemberIds(entId)
	monthStart := monthStartUnix()

	type Row struct {
		UserId      int
		Username    string
		Email       string
		DisplayName string
		Group       string
		UsedQuota   int64
		ReqCount    int64
	}
	var rows []Row
	if len(memberIds) > 0 {
		gc := model.GetGroupCol()
		model.DB.Raw(`
			SELECT u.id AS user_id, u.username, u.email, u.display_name, u.`+gc+` AS "group",
			       COALESCE(SUM(qd.quota), 0) AS used_quota,
			       COALESCE(SUM(qd.count), 0) AS req_count
			FROM users u
			LEFT JOIN quota_data qd ON qd.user_id = u.id AND qd.created_at >= ?
			WHERE u.id IN ?
			GROUP BY u.id, u.username, u.email, u.display_name, u.`+gc+`
			ORDER BY used_quota DESC
		`, monthStart, memberIds).Scan(&rows)
	}

	filename := fmt.Sprintf("members_%s.csv", time.Now().Format("2006-01"))
	c.Header("Content-Type", "text/csv; charset=utf-8")
	c.Header("Content-Disposition", `attachment; filename="`+filename+`"`)
	// UTF-8 BOM 让 Excel 不乱码
	c.Writer.WriteString("\xEF\xBB\xBF")
	w := csv.NewWriter(c.Writer)
	_ = w.Write([]string{"用户ID", "用户名", "邮箱", "显示名", "分组", "本月消费 (USD)", "本月调用次数"})
	for _, r := range rows {
		_ = w.Write([]string{
			strconv.Itoa(r.UserId),
			r.Username,
			r.Email,
			r.DisplayName,
			r.Group,
			fmt.Sprintf("%.4f", float64(r.UsedQuota)/quotaPerUSD),
			strconv.FormatInt(r.ReqCount, 10),
		})
	}
	w.Flush()
}

// EnterpriseExportAuditLogs GET /api/enterprise/export/audit-logs.csv
func EnterpriseExportAuditLogs(c *gin.Context) {
	entId, ok := requireConsoleEnterprise(c)
	if !ok {
		return
	}
	// 拉最多 1 万条
	logs, _, err := model.GetAuditLogs(entId, "", "", 1, 10000)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	filename := fmt.Sprintf("audit_logs_%s.csv", time.Now().Format("2006-01-02"))
	c.Header("Content-Type", "text/csv; charset=utf-8")
	c.Header("Content-Disposition", `attachment; filename="`+filename+`"`)
	c.Writer.WriteString("\xEF\xBB\xBF")
	w := csv.NewWriter(c.Writer)
	_ = w.Write([]string{"时间", "操作人", "邮箱", "事件类型", "资源", "资源ID", "结果", "IP", "详情"})
	for _, l := range logs {
		ts := time.Unix(l.CreatedAt, 0).Format("2006-01-02 15:04:05")
		_ = w.Write([]string{
			ts, l.ActorName, l.ActorEmail, l.EventType, l.Resource, l.ResourceId, l.Result, l.Ip, l.Detail,
		})
	}
	w.Flush()
}

// EnterpriseExportMonthlyBilling GET /api/enterprise/export/billing.csv
// 月度账单：按 user × model 聚合
func EnterpriseExportMonthlyBilling(c *gin.Context) {
	entId, ok := requireConsoleEnterprise(c)
	if !ok {
		return
	}
	memberIds, _ := enterpriseMemberIds(entId)
	monthStart := monthStartUnix()

	type Row struct {
		Username  string
		Email     string
		ModelName string
		UsedQuota int64
		ReqCount  int64
	}
	var rows []Row
	if len(memberIds) > 0 {
		model.DB.Raw(`
			SELECT u.username, u.email, qd.model_name,
			       COALESCE(SUM(qd.quota), 0) AS used_quota,
			       COALESCE(SUM(qd.count), 0) AS req_count
			FROM users u
			JOIN quota_data qd ON qd.user_id = u.id AND qd.created_at >= ?
			WHERE u.id IN ?
			GROUP BY u.username, u.email, qd.model_name
			ORDER BY u.username, used_quota DESC
		`, monthStart, memberIds).Scan(&rows)
	}

	filename := fmt.Sprintf("billing_%s.csv", time.Now().Format("2006-01"))
	c.Header("Content-Type", "text/csv; charset=utf-8")
	c.Header("Content-Disposition", `attachment; filename="`+filename+`"`)
	c.Writer.WriteString("\xEF\xBB\xBF")
	w := csv.NewWriter(c.Writer)
	_ = w.Write([]string{"用户", "邮箱", "模型", "消费 (USD)", "调用次数"})
	for _, r := range rows {
		_ = w.Write([]string{
			r.Username, r.Email, r.ModelName,
			fmt.Sprintf("%.4f", float64(r.UsedQuota)/quotaPerUSD),
			strconv.FormatInt(r.ReqCount, 10),
		})
	}
	w.Flush()
}

// ─── P2.2 工作组看板 ──────────────────────────────────────────────────

// EnterpriseWorkgroupStats GET /api/enterprise/workgroups/stats
// 返回本企业所有工作组的本月消费 + 限额进度（批量查询，无 N+1）
func EnterpriseWorkgroupStats(c *gin.Context) {
	entId, ok := requireConsoleEnterprise(c)
	if !ok {
		return
	}

	wgs, err := model.ListWorkGroupsByEnterprise(entId)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	if len(wgs) == 0 {
		c.JSON(http.StatusOK, gin.H{"success": true, "data": []any{}})
		return
	}

	wgIds := make([]uint, len(wgs))
	for i, wg := range wgs {
		wgIds[i] = wg.Id
	}
	monthStart := monthStartUnix()

	// Batch 1: member count per workgroup
	type wgCount struct {
		WorkGroupId uint
		Cnt         int64
	}
	var memberCounts []wgCount
	model.DB.Table("work_group_members").
		Select("work_group_id, COUNT(*) AS cnt").
		Where("work_group_id IN ? AND deleted_at IS NULL", wgIds).
		Group("work_group_id").
		Scan(&memberCounts)
	memberCountMap := map[uint]int64{}
	for _, r := range memberCounts {
		memberCountMap[r.WorkGroupId] = r.Cnt
	}

	// Batch 2: user_id → workgroup mapping + used_quota per workgroup
	type wgUserRow struct {
		WorkGroupId uint
		UserId      int
	}
	var wgUsers []wgUserRow
	model.DB.Table("work_group_members").
		Select("work_group_id, user_id").
		Where("work_group_id IN ? AND deleted_at IS NULL", wgIds).
		Scan(&wgUsers)

	// Build workgroup→userIds index
	wgUserMap := map[uint][]int{}
	allUserIds := make([]int, 0, len(wgUsers))
	for _, r := range wgUsers {
		wgUserMap[r.WorkGroupId] = append(wgUserMap[r.WorkGroupId], r.UserId)
		allUserIds = append(allUserIds, r.UserId)
	}

	// Batch 3: used quota per user this month
	type userQuota struct {
		UserId    int
		UsedQuota int64
	}
	var userQuotas []userQuota
	if len(allUserIds) > 0 {
		model.DB.Model(&model.QuotaData{}).
			Select("user_id, COALESCE(SUM(quota), 0) AS used_quota").
			Where("user_id IN ? AND created_at >= ?", allUserIds, monthStart).
			Group("user_id").
			Scan(&userQuotas)
	}
	userQuotaMap := map[int]int64{}
	for _, r := range userQuotas {
		userQuotaMap[r.UserId] = r.UsedQuota
	}

	// Batch 4: monthly limits per workgroup
	var limits []model.EnterpriseLimit
	model.DB.Where(
		"enterprise_id = ? AND scope_type = ? AND scope_id IN ? AND period = ?",
		entId, model.LimitScopeWorkGroup, wgIds, model.LimitPeriodMonthly,
	).Find(&limits)
	limitMap := map[uint]int64{}
	for i := range limits {
		model.MaybeResetPeriod(&limits[i])
		limitMap[limits[i].ScopeId] = limits[i].MaxQuota
	}

	type WorkgroupStat struct {
		Id          uint    `json:"id"`
		Name        string  `json:"name"`
		MemberCount int64   `json:"member_count"`
		UsedQuota   int64   `json:"used_quota"`
		UsedUSD     float64 `json:"used_usd"`
		MaxQuota    int64   `json:"max_quota"`
		MaxUSD      float64 `json:"max_usd"`
		Pct         int     `json:"pct"`
	}

	result := make([]WorkgroupStat, 0, len(wgs))
	for _, wg := range wgs {
		var used int64
		for _, uid := range wgUserMap[wg.Id] {
			used += userQuotaMap[uid]
		}
		maxQuota := limitMap[wg.Id]
		pct := 0
		if maxQuota > 0 {
			pct = int(float64(used) / float64(maxQuota) * 100)
			if pct > 100 {
				pct = 100
			}
		}
		result = append(result, WorkgroupStat{
			Id:          wg.Id,
			Name:        wg.Name,
			MemberCount: memberCountMap[wg.Id],
			UsedQuota:   used,
			UsedUSD:     float64(used) / quotaPerUSD,
			MaxQuota:    maxQuota,
			MaxUSD:      float64(maxQuota) / quotaPerUSD,
			Pct:         pct,
		})
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "data": result})
}

// ─── P2.2 工作组管理 CRUD ──────────────────────────────────────────────

// enterpriseOwnsWorkgroup validates that a workgroup belongs to the current enterprise
func enterpriseOwnsWorkgroup(wgId uint, entId uint) bool {
	var wg model.WorkGroup
	if err := model.DB.Select("enterprise_id").Where("id = ?", wgId).First(&wg).Error; err != nil {
		return false
	}
	return wg.EnterpriseId == entId
}

// EnterpriseListWorkgroups GET /api/enterprise/workgroups
func EnterpriseListWorkgroups(c *gin.Context) {
	entId, ok := requireConsoleEnterprise(c)
	if !ok {
		return
	}
	wgs, err := model.ListWorkGroupsByEnterprise(entId)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": wgs})
}

// EnterpriseCreateWorkgroup POST /api/enterprise/workgroups
func EnterpriseCreateWorkgroup(c *gin.Context) {
	entId, ok := requireConsoleEnterprise(c)
	if !ok {
		return
	}
	var body struct {
		Name        string `json:"name"`
		Description string `json:"description"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || body.Name == "" {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "name required"})
		return
	}
	wg := &model.WorkGroup{EnterpriseId: entId, Name: body.Name, Description: body.Description}
	if err := model.CreateWorkGroup(wg); err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	recordAudit(c, "workgroup.created", "workgroup", strconv.Itoa(int(wg.Id)), model.AuditResultSuccess, body.Name)
	c.JSON(http.StatusOK, gin.H{"success": true, "data": wg})
}

// EnterpriseUpdateWorkgroup PUT /api/enterprise/workgroups/:wg_id
func EnterpriseUpdateWorkgroup(c *gin.Context) {
	entId, ok := requireConsoleEnterprise(c)
	if !ok {
		return
	}
	wgId, err := strconv.ParseUint(c.Param("wg_id"), 10, 64)
	if err != nil || wgId == 0 {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "invalid wg_id"})
		return
	}
	if !enterpriseOwnsWorkgroup(uint(wgId), entId) {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "工作组不属于本企业"})
		return
	}
	var body struct {
		Name        string `json:"name"`
		Description string `json:"description"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	updates := map[string]interface{}{}
	if body.Name != "" {
		updates["name"] = body.Name
	}
	if body.Description != "" {
		updates["description"] = body.Description
	}
	if len(updates) == 0 {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "nothing to update"})
		return
	}
	if err := model.DB.Model(&model.WorkGroup{}).Where("id = ?", wgId).Updates(updates).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	recordAudit(c, "workgroup.updated", "workgroup", strconv.FormatUint(wgId, 10), model.AuditResultSuccess, body.Name)
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "updated"})
}

// EnterpriseDeleteWorkgroup DELETE /api/enterprise/workgroups/:wg_id
func EnterpriseDeleteWorkgroup(c *gin.Context) {
	entId, ok := requireConsoleEnterprise(c)
	if !ok {
		return
	}
	wgId, err := strconv.ParseUint(c.Param("wg_id"), 10, 64)
	if err != nil || wgId == 0 {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "invalid wg_id"})
		return
	}
	if !enterpriseOwnsWorkgroup(uint(wgId), entId) {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "工作组不属于本企业"})
		return
	}
	if err := model.DeleteWorkGroup(uint(wgId)); err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	recordAudit(c, "workgroup.deleted", "workgroup", strconv.FormatUint(wgId, 10), model.AuditResultSuccess, "")
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "deleted"})
}

// EnterpriseListWorkgroupMembers GET /api/enterprise/workgroups/:wg_id/members
func EnterpriseListWorkgroupMembers(c *gin.Context) {
	entId, ok := requireConsoleEnterprise(c)
	if !ok {
		return
	}
	wgId, err := strconv.ParseUint(c.Param("wg_id"), 10, 64)
	if err != nil || wgId == 0 || !enterpriseOwnsWorkgroup(uint(wgId), entId) {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "invalid workgroup"})
		return
	}
	users, err := model.ListWorkGroupMembers(uint(wgId))
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": users})
}

// EnterpriseAssignWorkgroupMember POST /api/enterprise/workgroups/:wg_id/members
func EnterpriseAssignWorkgroupMember(c *gin.Context) {
	entId, ok := requireConsoleEnterprise(c)
	if !ok {
		return
	}
	wgId, err := strconv.ParseUint(c.Param("wg_id"), 10, 64)
	if err != nil || wgId == 0 || !enterpriseOwnsWorkgroup(uint(wgId), entId) {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "invalid workgroup"})
		return
	}
	var body struct {
		UserId int `json:"user_id"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || body.UserId <= 0 {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "user_id required"})
		return
	}
	// Verify user belongs to this enterprise
	var em model.EnterpriseMember
	if err := model.DB.Where("user_id = ? AND enterprise_id = ? AND deleted_at IS NULL", body.UserId, entId).
		First(&em).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "用户不属于本企业"})
		return
	}
	if err := model.AddWorkGroupMember(uint(wgId), body.UserId); err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	recordAudit(c, "workgroup.member_added", "workgroup", strconv.FormatUint(wgId, 10), model.AuditResultSuccess,
		strconv.Itoa(body.UserId))
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "assigned"})
}

// EnterpriseRemoveWorkgroupMember DELETE /api/enterprise/workgroups/:wg_id/members/:user_id
func EnterpriseRemoveWorkgroupMember(c *gin.Context) {
	entId, ok := requireConsoleEnterprise(c)
	if !ok {
		return
	}
	wgId, err := strconv.ParseUint(c.Param("wg_id"), 10, 64)
	if err != nil || wgId == 0 || !enterpriseOwnsWorkgroup(uint(wgId), entId) {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "invalid workgroup"})
		return
	}
	userId, err := strconv.Atoi(c.Param("user_id"))
	if err != nil || userId <= 0 {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "invalid user_id"})
		return
	}
	if err := model.RemoveWorkGroupMember(uint(wgId), userId); err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	recordAudit(c, "workgroup.member_removed", "workgroup", strconv.FormatUint(wgId, 10), model.AuditResultSuccess,
		strconv.Itoa(userId))
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "removed"})
}

// EnterpriseSetWorkgroupLimit PUT /api/enterprise/workgroups/:wg_id/limit
// 设置工作组月度限额（quota 单位）；budget_usd=0 表示删除限额
func EnterpriseSetWorkgroupLimit(c *gin.Context) {
	entId, ok := requireConsoleEnterprise(c)
	if !ok {
		return
	}
	wgId, err := strconv.ParseUint(c.Param("wg_id"), 10, 64)
	if err != nil || wgId == 0 || !enterpriseOwnsWorkgroup(uint(wgId), entId) {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "invalid workgroup"})
		return
	}
	var body struct {
		BudgetUSD   float64 `json:"budget_usd"`
		EnforceHard bool    `json:"enforce_hard"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	maxQuota := int64(body.BudgetUSD * quotaPerUSD)

	var lim model.EnterpriseLimit
	dbErr := model.DB.Where(
		"enterprise_id = ? AND scope_type = ? AND scope_id = ? AND period = ?",
		entId, model.LimitScopeWorkGroup, uint(wgId), model.LimitPeriodMonthly,
	).First(&lim).Error

	if dbErr == nil {
		lim.MaxQuota = maxQuota
		lim.EnforceHard = body.EnforceHard
		if err := model.UpdateEnterpriseLimit(&lim); err != nil {
			c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
			return
		}
	} else if maxQuota > 0 {
		if err := model.CreateEnterpriseLimit(&model.EnterpriseLimit{
			EnterpriseId: entId,
			ScopeType:    model.LimitScopeWorkGroup,
			ScopeId:      uint(wgId),
			Period:       model.LimitPeriodMonthly,
			MaxQuota:     maxQuota,
			EnforceHard:  body.EnforceHard,
		}); err != nil {
			c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
			return
		}
	}
	recordAudit(c, "workgroup.limit_set", "workgroup", strconv.FormatUint(wgId, 10), model.AuditResultSuccess,
		fmt.Sprintf("budget=%.2f enforce_hard=%v", body.BudgetUSD, body.EnforceHard))
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "saved"})
}

// EnterpriseSetMemberLimit PUT /api/enterprise/members/:id/limit
// 设置个人成员月度限额；budget_usd=0 表示删除限额
func EnterpriseSetMemberLimit(c *gin.Context) {
	entId, ok := requireConsoleEnterprise(c)
	if !ok {
		return
	}
	userId, err := strconv.Atoi(c.Param("id"))
	if err != nil || userId <= 0 {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "invalid id"})
		return
	}
	var em model.EnterpriseMember
	if err := model.DB.Where("user_id = ? AND enterprise_id = ? AND deleted_at IS NULL", userId, entId).
		First(&em).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "用户不属于本企业"})
		return
	}
	var body struct {
		BudgetUSD   float64 `json:"budget_usd"`
		EnforceHard bool    `json:"enforce_hard"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	maxQuota := int64(body.BudgetUSD * quotaPerUSD)

	var lim model.EnterpriseLimit
	dbErr := model.DB.Where(
		"enterprise_id = ? AND scope_type = ? AND scope_id = ? AND period = ?",
		entId, model.LimitScopeMember, uint(userId), model.LimitPeriodMonthly,
	).First(&lim).Error

	if dbErr == nil {
		lim.MaxQuota = maxQuota
		lim.EnforceHard = body.EnforceHard
		if err := model.UpdateEnterpriseLimit(&lim); err != nil {
			c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
			return
		}
	} else if maxQuota > 0 {
		if err := model.CreateEnterpriseLimit(&model.EnterpriseLimit{
			EnterpriseId: entId,
			ScopeType:    model.LimitScopeMember,
			ScopeId:      uint(userId),
			Period:       model.LimitPeriodMonthly,
			MaxQuota:     maxQuota,
			EnforceHard:  body.EnforceHard,
		}); err != nil {
			c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
			return
		}
	}
	recordAudit(c, "member.limit_set", "member", strconv.Itoa(userId), model.AuditResultSuccess,
		fmt.Sprintf("budget=%.2f enforce_hard=%v", body.BudgetUSD, body.EnforceHard))
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "saved"})
}

// EnterpriseToggleMemberStatus PATCH /api/enterprise/members/:id/status
// Re-enable or disable a member (status 1=active, 2=disabled)
func EnterpriseToggleMemberStatus(c *gin.Context) {
	entId, ok := requireConsoleEnterprise(c)
	if !ok {
		return
	}
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "invalid id"})
		return
	}
	var em model.EnterpriseMember
	if err := model.DB.Where("user_id = ? AND enterprise_id = ? AND deleted_at IS NULL", id, entId).
		First(&em).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "用户不属于本企业"})
		return
	}
	var body struct {
		Status int `json:"status"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || (body.Status != 1 && body.Status != 2) {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "status must be 1 or 2"})
		return
	}
	if err := model.DB.Model(&model.User{}).Where("id = ?", id).Update("status", body.Status).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	action := "member.enabled"
	if body.Status == 2 {
		action = "member.disabled"
	}
	recordAudit(c, action, "member", strconv.Itoa(id), model.AuditResultSuccess, "")
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "updated"})
}

// EnterpriseGetMemberLimits GET /api/enterprise/members/:id/limits
// Returns all limits for a specific member (for display in team management)
func EnterpriseGetMemberLimits(c *gin.Context) {
	entId, ok := requireConsoleEnterprise(c)
	if !ok {
		return
	}
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "invalid id"})
		return
	}
	var em model.EnterpriseMember
	if err := model.DB.Where("user_id = ? AND enterprise_id = ? AND deleted_at IS NULL", id, entId).
		First(&em).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "用户不属于本企业"})
		return
	}
	var lim model.EnterpriseLimit
	if err := model.DB.Where(
		"enterprise_id = ? AND scope_type = ? AND scope_id = ? AND period = ?",
		entId, model.LimitScopeMember, uint(id), model.LimitPeriodMonthly,
	).First(&lim).Error; err != nil {
		// No limit configured
		c.JSON(http.StatusOK, gin.H{"success": true, "data": nil})
		return
	}
	model.MaybeResetPeriod(&lim)
	c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{
		"budget_usd":   float64(lim.MaxQuota) / quotaPerUSD,
		"enforce_hard": lim.EnforceHard,
		"used_usd":     float64(lim.UsedQuota) / quotaPerUSD,
		"pct":          func() int {
			if lim.MaxQuota == 0 { return 0 }
			p := int(float64(lim.UsedQuota)/float64(lim.MaxQuota)*100)
			if p > 100 { return 100 }
			return p
		}(),
	}})
}
