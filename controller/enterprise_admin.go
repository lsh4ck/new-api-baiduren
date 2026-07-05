package controller

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"

	"github.com/gin-gonic/gin"
)

// === 权限助手 ===

// isPlatformAdmin 平台管理员（含 root）
func isPlatformAdmin(c *gin.Context) bool {
	return c.GetInt("role") >= common.RoleAdminUser
}

// isSalesUser 销售身份（is_sales=true）
func isSalesUser(c *gin.Context) bool {
	userId := c.GetInt("id")
	if userId == 0 {
		return false
	}
	user, err := model.GetUserById(userId, true)
	if err != nil || user == nil {
		return false
	}
	return user.IsSales
}

// currentUserEnterpriseAdminOf 返回当前用户管理的企业 ID（0=不是任何企业管理员）
func currentUserEnterpriseAdminOf(c *gin.Context) uint {
	userId := c.GetInt("id")
	if userId == 0 {
		return 0
	}
	user, err := model.GetUserById(userId, true)
	if err != nil || user == nil {
		return 0
	}
	if user.EnterpriseAdminOf <= 0 {
		return 0
	}
	return uint(user.EnterpriseAdminOf)
}

// === Endpoints ===

type createEnterpriseReq struct {
	Name        string `json:"name"`
	Description string `json:"description"`
}

// CreateEnterprise POST /api/enterprise/admin/enterprises
// 销售 / 平台管理员可创建
func CreateEnterprise(c *gin.Context) {
	if !isPlatformAdmin(c) && !isSalesUser(c) {
		c.JSON(http.StatusForbidden, gin.H{"success": false, "message": "无权创建企业"})
		return
	}
	var req createEnterpriseReq
	if err := common.DecodeJson(c.Request.Body, &req); err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "无效请求"})
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" || len(req.Name) > 128 {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "企业名称长度需在 1-128"})
		return
	}
	e := &model.Enterprise{
		Name:        req.Name,
		Description: strings.TrimSpace(req.Description),
		OwnerId:     c.GetInt("id"),
		Status:      "active",
	}
	if err := model.CreateEnterprise(e); err != nil {
		if err == model.ErrEnterpriseNameTaken {
			c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
			return
		}
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": e})
}

// ListEnterprises GET /api/enterprise/admin/enterprises
// 平台管理员：看全部；企业管理员：仅看自己的
func ListEnterprises(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("p", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))
	keyword := c.Query("keyword")

	if isPlatformAdmin(c) {
		items, total, err := model.ListEnterprises(keyword, page, pageSize)
		if err != nil {
			common.ApiError(c, err)
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{
			"items": items, "total": total, "page": page, "page_size": pageSize,
		}})
		return
	}

	// 销售：只能看自己创建的 (后续可扩展，先返回所有 owner=self 的)
	if isSalesUser(c) {
		page, pageSize := page, pageSize
		// 限制条件
		items := make([]model.Enterprise, 0)
		var total int64
		uid := c.GetInt("id")
		q := model.DB.Model(&model.Enterprise{}).Where("owner_id = ?", uid)
		if keyword != "" {
			q = q.Where("name LIKE ?", "%"+keyword+"%")
		}
		if err := q.Count(&total).Error; err != nil {
			common.ApiError(c, err)
			return
		}
		if page < 1 {
			page = 1
		}
		if pageSize < 1 || pageSize > 200 {
			pageSize = 20
		}
		if err := q.Order("id DESC").Offset((page - 1) * pageSize).Limit(pageSize).Find(&items).Error; err != nil {
			common.ApiError(c, err)
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{
			"items": items, "total": total, "page": page, "page_size": pageSize,
		}})
		return
	}

	// 企业管理员：仅看自己管理的企业
	eid := currentUserEnterpriseAdminOf(c)
	if eid == 0 {
		c.JSON(http.StatusForbidden, gin.H{"success": false, "message": "无权访问"})
		return
	}
	e, err := model.GetEnterpriseById(eid)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{
		"items": []*model.Enterprise{e}, "total": 1, "page": 1, "page_size": 1,
	}})
}

func parseEnterpriseId(c *gin.Context) (uint, bool) {
	idStr := c.Param("id")
	id, err := strconv.Atoi(idStr)
	if err != nil || id <= 0 {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "无效的企业 ID"})
		return 0, false
	}
	return uint(id), true
}

// canManageEnterprise 平台管理员或该企业管理员
func canManageEnterprise(c *gin.Context, enterpriseId uint) bool {
	if isPlatformAdmin(c) {
		return true
	}
	return currentUserEnterpriseAdminOf(c) == enterpriseId
}

// GetEnterprise GET /api/enterprise/admin/enterprises/:id
func GetEnterprise(c *gin.Context) {
	id, ok := parseEnterpriseId(c)
	if !ok {
		return
	}
	if !canManageEnterprise(c, id) {
		c.JSON(http.StatusForbidden, gin.H{"success": false, "message": "无权访问"})
		return
	}
	e, err := model.GetEnterpriseById(id)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": e})
}

type updateEnterpriseReq struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	Status      string `json:"status"`
}

// UpdateEnterprise PUT /api/enterprise/admin/enterprises/:id
func UpdateEnterprise(c *gin.Context) {
	id, ok := parseEnterpriseId(c)
	if !ok {
		return
	}
	if !canManageEnterprise(c, id) {
		c.JSON(http.StatusForbidden, gin.H{"success": false, "message": "无权操作"})
		return
	}
	var req updateEnterpriseReq
	if err := common.DecodeJson(c.Request.Body, &req); err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "无效请求"})
		return
	}
	e, err := model.GetEnterpriseById(id)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	if req.Name != "" {
		e.Name = strings.TrimSpace(req.Name)
	}
	if req.Description != "" {
		e.Description = strings.TrimSpace(req.Description)
	}
	// 状态变更仅平台管理员可改
	if req.Status != "" && isPlatformAdmin(c) {
		e.Status = req.Status
	}
	if err := model.UpdateEnterprise(e); err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": e})
}

// DeleteEnterprise DELETE /api/enterprise/admin/enterprises/:id
// 仅平台管理员
func DeleteEnterprise(c *gin.Context) {
	if !isPlatformAdmin(c) {
		c.JSON(http.StatusForbidden, gin.H{"success": false, "message": "无权删除企业"})
		return
	}
	id, ok := parseEnterpriseId(c)
	if !ok {
		return
	}
	if err := model.DeleteEnterprise(id); err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true})
}

type addMemberReq struct {
	UserId int `json:"user_id"`
}

type bulkAddMembersReq struct {
	// identifiers 接受 user_id (int 字符串) / username / email 混合
	Identifiers []string `json:"identifiers"`
}

type bulkAddResult struct {
	Added   []int             `json:"added"`     // 成功加入的 user_id
	Skipped []bulkAddSkipItem `json:"skipped"`   // 因各种原因跳过的 (含失败原因)
}

type bulkAddSkipItem struct {
	Identifier string `json:"identifier"`
	UserId     int    `json:"user_id,omitempty"`
	Reason     string `json:"reason"`
}

// BulkAddEnterpriseMembers POST /api/enterprise/admin/enterprises/:id/members/bulk
// 接受 identifiers 混合数组：user_id(纯数字) / username / email
func BulkAddEnterpriseMembers(c *gin.Context) {
	id, ok := parseEnterpriseId(c)
	if !ok {
		return
	}
	if !canManageEnterprise(c, id) {
		c.JSON(http.StatusForbidden, gin.H{"success": false, "message": "无权操作"})
		return
	}
	var req bulkAddMembersReq
	if err := common.DecodeJson(c.Request.Body, &req); err != nil || len(req.Identifiers) == 0 {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "无效请求或标识列表为空"})
		return
	}
	if len(req.Identifiers) > 2000 {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "单次最多 2000 个标识"})
		return
	}

	result := bulkAddResult{
		Added:   []int{},
		Skipped: []bulkAddSkipItem{},
	}

	for _, raw := range req.Identifiers {
		identifier := strings.TrimSpace(raw)
		if identifier == "" {
			continue
		}
		// 解析 identifier → user_id
		var target model.User
		var resolveErr error
		if uid, err := strconv.Atoi(identifier); err == nil && uid > 0 {
			resolveErr = model.DB.Where("id = ?", uid).First(&target).Error
		} else if strings.Contains(identifier, "@") {
			resolveErr = model.DB.Where("email = ?", identifier).First(&target).Error
		} else {
			resolveErr = model.DB.Where("username = ?", identifier).First(&target).Error
		}
		if resolveErr != nil || target.Id == 0 {
			result.Skipped = append(result.Skipped, bulkAddSkipItem{
				Identifier: identifier,
				Reason:     "找不到对应用户",
			})
			continue
		}
		if err := model.AddEnterpriseMember(id, target.Id); err != nil {
			result.Skipped = append(result.Skipped, bulkAddSkipItem{
				Identifier: identifier,
				UserId:     target.Id,
				Reason:     err.Error(),
			})
			continue
		}
		result.Added = append(result.Added, target.Id)
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "data": result})
}

// SearchUsersForEnterprise GET /api/enterprise/admin/enterprises/:id/search-candidates?keyword=
// 用户搜索器：按用户名/邮箱/显示名模糊搜索，最多返回 20 条，排除已在该企业的用户
func SearchUsersForEnterprise(c *gin.Context) {
	id, ok := parseEnterpriseId(c)
	if !ok {
		return
	}
	if !canManageEnterprise(c, id) {
		c.JSON(http.StatusForbidden, gin.H{"success": false, "message": "无权操作"})
		return
	}
	keyword := strings.TrimSpace(c.Query("keyword"))
	if keyword == "" || len(keyword) < 1 {
		c.JSON(http.StatusOK, gin.H{"success": true, "data": []any{}})
		return
	}
	like := "%" + keyword + "%"

	type candidate struct {
		Id           int    `json:"id"`
		Username     string `json:"username"`
		DisplayName  string `json:"display_name"`
		Email        string `json:"email"`
		AlreadyIn    bool   `json:"already_in"`
		OtherEntName string `json:"other_enterprise_name,omitempty"`
	}
	var users []model.User
	// 找匹配用户（限制 20）
	q := model.DB.Model(&model.User{}).
		Where("username LIKE ? OR email LIKE ? OR display_name LIKE ?", like, like, like).
		Order("id ASC").Limit(20)
	if err := q.Find(&users).Error; err != nil {
		common.ApiError(c, err)
		return
	}
	// 一次性查所有候选用户的企业归属
	userIds := make([]int, 0, len(users))
	for i := range users {
		userIds = append(userIds, users[i].Id)
	}
	type memberInfo struct {
		UserId       int
		EnterpriseId uint
	}
	var memberRows []memberInfo
	if len(userIds) > 0 {
		_ = model.DB.Table("enterprise_members em").
			Select("em.user_id, em.enterprise_id").
			Where("em.user_id IN ? AND em.deleted_at IS NULL", userIds).
			Scan(&memberRows).Error
	}
	memberMap := make(map[int]uint, len(memberRows))
	for _, m := range memberRows {
		memberMap[m.UserId] = m.EnterpriseId
	}
	// 查其他企业名称（用于提示"已在 X 企业"）
	otherEntIds := make([]uint, 0)
	for _, eid := range memberMap {
		if eid != id {
			otherEntIds = append(otherEntIds, eid)
		}
	}
	entNames := make(map[uint]string)
	if len(otherEntIds) > 0 {
		var ents []model.Enterprise
		_ = model.DB.Where("id IN ?", otherEntIds).Find(&ents).Error
		for _, e := range ents {
			entNames[e.Id] = e.Name
		}
	}

	results := make([]candidate, 0, len(users))
	for _, u := range users {
		c := candidate{
			Id:          u.Id,
			Username:    u.Username,
			DisplayName: u.DisplayName,
			Email:       u.Email,
		}
		if memberEntId, ok := memberMap[u.Id]; ok {
			if memberEntId == id {
				c.AlreadyIn = true
			} else {
				c.OtherEntName = entNames[memberEntId]
			}
		}
		results = append(results, c)
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": results})
}

// AddEnterpriseMember POST /api/enterprise/admin/enterprises/:id/members
func AddEnterpriseMember(c *gin.Context) {
	id, ok := parseEnterpriseId(c)
	if !ok {
		return
	}
	if !canManageEnterprise(c, id) {
		c.JSON(http.StatusForbidden, gin.H{"success": false, "message": "无权操作"})
		return
	}
	var req addMemberReq
	if err := common.DecodeJson(c.Request.Body, &req); err != nil || req.UserId <= 0 {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "无效请求"})
		return
	}
	if _, err := model.GetUserById(req.UserId, false); err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "目标用户不存在"})
		return
	}
	if err := model.AddEnterpriseMember(id, req.UserId); err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true})
}

// RemoveEnterpriseMember DELETE /api/enterprise/admin/enterprises/:id/members/:user_id
func RemoveEnterpriseMember(c *gin.Context) {
	id, ok := parseEnterpriseId(c)
	if !ok {
		return
	}
	if !canManageEnterprise(c, id) {
		c.JSON(http.StatusForbidden, gin.H{"success": false, "message": "无权操作"})
		return
	}
	uid, err := strconv.Atoi(c.Param("user_id"))
	if err != nil || uid <= 0 {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "无效用户 ID"})
		return
	}
	if err := model.RemoveEnterpriseMember(id, uid); err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true})
}

// ListEnterpriseMembers GET /api/enterprise/admin/enterprises/:id/members
func ListEnterpriseMembers(c *gin.Context) {
	id, ok := parseEnterpriseId(c)
	if !ok {
		return
	}
	if !canManageEnterprise(c, id) {
		c.JSON(http.StatusForbidden, gin.H{"success": false, "message": "无权访问"})
		return
	}
	page, _ := strconv.Atoi(c.DefaultQuery("p", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))
	keyword := c.Query("keyword")
	users, total, err := model.ListEnterpriseMembers(id, keyword, page, pageSize)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	// 隐藏敏感字段
	for i := range users {
		users[i].Password = ""
		users[i].AccessToken = nil
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{
		"items": users, "total": total, "page": page, "page_size": pageSize,
	}})
}

type setAdminReq struct {
	UserId int `json:"user_id"`
}

// SetEnterpriseAdmin PUT /api/enterprise/admin/enterprises/:id/admin
// 仅平台管理员可指派企业管理员
func SetEnterpriseAdmin(c *gin.Context) {
	if !isPlatformAdmin(c) {
		c.JSON(http.StatusForbidden, gin.H{"success": false, "message": "仅平台管理员可指派企业管理员"})
		return
	}
	id, ok := parseEnterpriseId(c)
	if !ok {
		return
	}
	var req setAdminReq
	if err := common.DecodeJson(c.Request.Body, &req); err != nil || req.UserId <= 0 {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "无效请求"})
		return
	}
	if err := model.SetEnterpriseAdmin(id, req.UserId); err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true})
}

// === 销售身份管理（仅平台管理员） ===

type setSalesReq struct {
	UserId  int  `json:"user_id"`
	IsSales bool `json:"is_sales"`
}

// SetUserSalesFlag PUT /api/user/admin/sales
// 平台管理员把任意用户标记为销售或取消
func SetUserSalesFlag(c *gin.Context) {
	if !isPlatformAdmin(c) {
		c.JSON(http.StatusForbidden, gin.H{"success": false, "message": "无权操作"})
		return
	}
	var req setSalesReq
	if err := common.DecodeJson(c.Request.Body, &req); err != nil || req.UserId <= 0 {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "无效请求"})
		return
	}
	var u model.User
	if err := model.DB.Select("id, agent_level, inviter_id").Where("id = ?", req.UserId).First(&u).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "用户不存在"})
		return
	}
	updates := map[string]any{"is_sales": req.IsSales}
	if req.IsSales {
		// 指派为销售：若当前无档位，按邀请链自动定档(无销售上级=默认1档/5%，有上级=2/3档)，避免"标了销售却0%"的坑
		if u.AgentLevel == 0 {
			lvl := proposedLevelByInviter(u.InviterId)
			if lvl == 0 {
				c.JSON(http.StatusOK, gin.H{"success": false, "message": "该用户的上级已是 3 档销售，达 3 级上限，无法再指派为销售"})
				return
			}
			updates["agent_level"] = lvl
		}
	} else {
		// 取消销售身份：一并清空档位(否则 is_sales=false 但 agent_level>0 仍被视为销售继续计佣)
		updates["agent_level"] = 0
	}
	if err := model.DB.Model(&model.User{}).Where("id = ?", req.UserId).Updates(updates).Error; err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true})
}
