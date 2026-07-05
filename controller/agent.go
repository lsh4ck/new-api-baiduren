package controller

import (
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
)

// ─────────────────────────────────────────────
// 管理员接口
// ─────────────────────────────────────────────

// AdminListAgents GET /api/admin/agents
func AdminListAgents(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))
	if page <= 0 {
		page = 1
	}
	if pageSize <= 0 || pageSize > 100 {
		pageSize = 20
	}

	var agents []model.User
	var total int64
	// 涵盖两类销售：(1) 设了 agent_level>0 的代理；(2) 只标了 is_sales=true 但等级=0 的销售
	query := model.DB.Model(&model.User{}).Where("agent_level > 0 OR is_sales = ?", true)
	query.Count(&total)
	offset := (page - 1) * pageSize
	if err := query.Select("id, username, email, display_name, agent_level, commission_rate, aff_count, aff_history, created_at, last_login_at, status, is_sales").
		Order("agent_level DESC, created_at DESC").Offset(offset).Limit(pageSize).Find(&agents).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}

	type AgentItem struct {
		model.User
		CustomerCount    int64   `json:"customer_count"`
		TotalTopupMoney  float64 `json:"total_topup_money"`
		AvailableBalance float64 `json:"available_balance"`
	}

	result := make([]AgentItem, 0, len(agents))
	for _, a := range agents {
		item := AgentItem{User: a}
		model.DB.Model(&model.User{}).Where("inviter_id = ?", a.Id).Count(&item.CustomerCount)
		model.DB.Model(&model.TopUp{}).
			Where("user_id IN (SELECT id FROM users WHERE inviter_id = ?) AND status = ?", a.Id, common.TopUpStatusSuccess).
			Select("COALESCE(SUM(money), 0)").Scan(&item.TotalTopupMoney)
		earned := item.TotalTopupMoney * a.CommissionRate
		withdrawn, _ := model.SumApprovedWithdrawals(a.Id)
		item.AvailableBalance = earned - withdrawn
		result = append(result, item)
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "data": result, "total": total})
}

// AdminSetAgentLevel POST /api/admin/agents/:id/level
func AdminSetAgentLevel(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "invalid id"})
		return
	}
	var body struct {
		AgentLevel     int     `json:"agent_level"`
		CommissionRate float64 `json:"commission_rate"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	if body.AgentLevel < 0 || body.AgentLevel > 3 {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "agent_level must be 0-3 (3 层防传销硬上限)"})
		return
	}
	if body.CommissionRate < 0 || body.CommissionRate > 1 {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "commission_rate must be 0-1"})
		return
	}

	// 推广链深度校验：不允许形成超过 3 级的链
	// 如果该用户的上级链已有 N 层销售（agent_level > 0），那么新的 agent_level 必须 ≤ 4 - N
	if body.AgentLevel > 0 {
		depth := getReferralChainSalesDepth(id)
		maxAllowed := 3 - depth
		if maxAllowed < 1 {
			c.JSON(http.StatusOK, gin.H{"success": false, "message": "该用户的推广链上已有 3 级销售，无法再设为销售（防传销硬上限）"})
			return
		}
		if body.AgentLevel > maxAllowed {
			c.JSON(http.StatusOK, gin.H{"success": false, "message": fmt.Sprintf("该用户最多可设为 %d 级销售（链路深度限制）", maxAllowed)})
			return
		}
	}

	if err := model.DB.Model(&model.User{}).Where("id = ?", id).Updates(map[string]interface{}{
		"agent_level":     body.AgentLevel,
		"commission_rate": body.CommissionRate,
	}).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "updated"})
}

// getReferralChainSalesDepth 算用户向上的推广链中"已经是销售"的层数
// 例：用户 A → inviter B(销售) → inviter C(销售) → 顶 = 深度 2
func getReferralChainSalesDepth(userId int) int {
	depth := 0
	curr := userId
	for i := 0; i < 10 && curr > 0; i++ { // 防御性循环上限 10
		var u struct {
			InviterId  int
			AgentLevel int
		}
		if err := model.DB.Model(&model.User{}).
			Select("inviter_id, agent_level").
			Where("id = ?", curr).
			Scan(&u).Error; err != nil || u.InviterId == 0 {
			break
		}
		// 向上一级
		curr = u.InviterId
		var up struct {
			AgentLevel int
		}
		if err := model.DB.Model(&model.User{}).
			Select("agent_level").
			Where("id = ?", curr).
			Scan(&up).Error; err != nil {
			break
		}
		if up.AgentLevel > 0 {
			depth++
		}
	}
	return depth
}

// AdminGetAgentCustomers GET /api/admin/agents/:id/customers
func AdminGetAgentCustomers(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "invalid id"})
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

	var customers []model.User
	var total int64
	query := model.DB.Model(&model.User{}).Where("inviter_id = ?", id)
	query.Count(&total)
	offset := (page - 1) * pageSize
	if err := query.Select("id, username, email, display_name, used_quota, quota, created_at, last_login_at, status").
		Order("created_at DESC").Offset(offset).Limit(pageSize).Find(&customers).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}

	type CustomerItem struct {
		model.User
		TotalTopupMoney float64 `json:"total_topup_money"`
	}
	result := make([]CustomerItem, 0, len(customers))
	for _, cu := range customers {
		item := CustomerItem{User: cu}
		model.DB.Model(&model.TopUp{}).
			Where("user_id = ? AND status = ?", cu.Id, common.TopUpStatusSuccess).
			Select("COALESCE(SUM(money), 0)").Scan(&item.TotalTopupMoney)
		result = append(result, item)
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "data": result, "total": total})
}

// computeSelfRate 返回销售本人对自己直接客户的提成率。
// 优先级：user.commission_rate > 0 时用 commission_rate（admin 个性化覆盖）；
// 否则按 agent_level 取 OptionMap 默认（L1=5%/L2=3%/L3=3%）。
func computeSelfRate(agentLevel int, commissionRate float64) float64 {
	if commissionRate > 0 {
		return commissionRate
	}
	switch agentLevel {
	case 1:
		return common.SalesL1CommissionRate
	case 2:
		return common.SalesL2CommissionRate
	case 3:
		return common.SalesL3CommissionRate
	}
	return 0
}

// computeEstimatedCommission 叠加全返模型：销售对其名下 1/2/3 级所有业务都按【自己的档位率】计佣。
// 因为佣金沿 inviter 链每级各拿全额，从单个销售视角即"全部下游业务(L1+L2+L3) × 自己的 self_rate"。
// self_rate 由 computeSelfRate 决定(1档5%/2档3%/3档3%，或 commission_rate 个性化覆盖)。
func computeEstimatedCommission(selfRate, l1t, l2t, l3t float64) float64 {
	return (l1t + l2t + l3t) * selfRate
}

// computeMultiLevelStats 计算某销售下属 1/2/3 级客户数与累计充值
func computeMultiLevelStats(agentId int) map[string]interface{} {
	// 1 级：直接客户
	var l1Count int64
	var l1Topup float64
	model.DB.Model(&model.User{}).Where("inviter_id = ?", agentId).Count(&l1Count)
	model.DB.Model(&model.TopUp{}).
		Where("user_id IN (SELECT id FROM users WHERE inviter_id = ?) AND status = ?", agentId, common.TopUpStatusSuccess).
		Select("COALESCE(SUM(money), 0)").Scan(&l1Topup)

	// 2 级：直接客户的客户
	var l2Count int64
	var l2Topup float64
	model.DB.Model(&model.User{}).
		Where("inviter_id IN (SELECT id FROM users WHERE inviter_id = ?)", agentId).
		Count(&l2Count)
	model.DB.Model(&model.TopUp{}).
		Where("user_id IN (SELECT id FROM users WHERE inviter_id IN (SELECT id FROM users WHERE inviter_id = ?)) AND status = ?", agentId, common.TopUpStatusSuccess).
		Select("COALESCE(SUM(money), 0)").Scan(&l2Topup)

	// 3 级：再下一级
	var l3Count int64
	var l3Topup float64
	model.DB.Model(&model.User{}).
		Where("inviter_id IN (SELECT id FROM users WHERE inviter_id IN (SELECT id FROM users WHERE inviter_id = ?))", agentId).
		Count(&l3Count)
	model.DB.Model(&model.TopUp{}).
		Where("user_id IN (SELECT id FROM users WHERE inviter_id IN (SELECT id FROM users WHERE inviter_id IN (SELECT id FROM users WHERE inviter_id = ?))) AND status = ?", agentId, common.TopUpStatusSuccess).
		Select("COALESCE(SUM(money), 0)").Scan(&l3Topup)

	return map[string]interface{}{
		"l1_count": l1Count, "l1_topup": l1Topup,
		"l2_count": l2Count, "l2_topup": l2Topup,
		"l3_count": l3Count, "l3_topup": l3Topup,
		"total_count": l1Count + l2Count + l3Count,
		"total_topup": l1Topup + l2Topup + l3Topup,
	}
}

// AdminGetSalesPerformance GET /api/admin/agents/performance
// 返回所有销售 + 各自 1/2/3 级下属统计，用于月底结佣
// 涵盖 agent_level>0 + is_sales=true 两类
func AdminGetSalesPerformance(c *gin.Context) {
	var agents []model.User
	if err := model.DB.Model(&model.User{}).
		Where("agent_level > 0 OR is_sales = ?", true).
		Select("id, username, email, display_name, agent_level, commission_rate, created_at, is_sales").
		Order("agent_level DESC, id ASC").
		Find(&agents).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}

	type SalesPerformanceRow struct {
		AgentId        int     `json:"agent_id"`
		Username       string  `json:"username"`
		DisplayName    string  `json:"display_name"`
		Email          string  `json:"email"`
		AgentLevel     int     `json:"agent_level"`
		CommissionRate float64 `json:"commission_rate"`
		L1Count        int64   `json:"l1_count"`
		L1Topup        float64 `json:"l1_topup"`
		L2Count        int64   `json:"l2_count"`
		L2Topup        float64 `json:"l2_topup"`
		L3Count        int64   `json:"l3_count"`
		L3Topup        float64 `json:"l3_topup"`
		TotalTopup     float64 `json:"total_topup"`
		EstimatedEarn  float64 `json:"estimated_earn"`
		Withdrawn      float64 `json:"withdrawn"`
		Available      float64 `json:"available"`
	}
	result := make([]SalesPerformanceRow, 0, len(agents))
	for _, a := range agents {
		stats := computeMultiLevelStats(a.Id)
		l1c, _ := stats["l1_count"].(int64)
		l2c, _ := stats["l2_count"].(int64)
		l3c, _ := stats["l3_count"].(int64)
		l1t, _ := stats["l1_topup"].(float64)
		l2t, _ := stats["l2_topup"].(float64)
		l3t, _ := stats["l3_topup"].(float64)
		// 估算佣金（新独立比例模型）：
		// - L1 客户（销售自己客户）× self_rate（按 agent_level 取 5%/3%/3%，或 commission_rate 个性化覆盖）
		// - L2/L3 客户（下级销售带来的）× SalesUpperTotalRate（默认 1%，含 0.5% 抽 + 0.5% 平台补，全链穿透）
		selfRate := computeSelfRate(a.AgentLevel, a.CommissionRate)
		estimated := computeEstimatedCommission(selfRate, l1t, l2t, l3t)
		withdrawn, _ := model.SumApprovedWithdrawals(a.Id)
		result = append(result, SalesPerformanceRow{
			AgentId:        a.Id,
			Username:       a.Username,
			DisplayName:    a.DisplayName,
			Email:          a.Email,
			AgentLevel:     a.AgentLevel,
			CommissionRate: a.CommissionRate,
			L1Count:        l1c, L1Topup: l1t,
			L2Count: l2c, L2Topup: l2t,
			L3Count: l3c, L3Topup: l3t,
			TotalTopup:    l1t + l2t + l3t,
			EstimatedEarn: estimated,
			Withdrawn:     withdrawn,
			Available:     estimated - withdrawn,
		})
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "data": result})
}

// AdminGetAgentStats GET /api/admin/agents/:id/stats
func AdminGetAgentStats(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "invalid id"})
		return
	}
	var agent model.User
	if err := model.DB.Select("id, username, email, agent_level, commission_rate").Where("id = ?", id).First(&agent).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "agent not found"})
		return
	}

	multi := computeMultiLevelStats(id)
	l1c, _ := multi["l1_count"].(int64)
	l1t, _ := multi["l1_topup"].(float64)
	l2c, _ := multi["l2_count"].(int64)
	l2t, _ := multi["l2_topup"].(float64)
	l3c, _ := multi["l3_count"].(int64)
	l3t, _ := multi["l3_topup"].(float64)
	totalTopup := l1t + l2t + l3t

	// 估算佣金（新独立比例模型）：见 computeEstimatedCommission
	selfRate := computeSelfRate(agent.AgentLevel, agent.CommissionRate)
	earned := computeEstimatedCommission(selfRate, l1t, l2t, l3t)
	withdrawn, _ := model.SumApprovedWithdrawals(id)

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"agent_id":          id,
			"agent_level":       agent.AgentLevel,
			"commission_rate":   agent.CommissionRate,
			"l1_count":          l1c,
			"l1_topup":          l1t,
			"l2_count":          l2c,
			"l2_topup":          l2t,
			"l3_count":          l3c,
			"l3_topup":          l3t,
			"customer_count":    l1c + l2c + l3c,
			"total_topup_money": totalTopup,
			"total_earned":      earned,
			"total_withdrawn":   withdrawn,
			"available_balance": earned - withdrawn,
		},
	})
}

// AdminListWithdrawals GET /api/admin/agent-withdrawals
func AdminListWithdrawals(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))
	status := c.Query("status")
	if page <= 0 {
		page = 1
	}
	if pageSize <= 0 || pageSize > 100 {
		pageSize = 20
	}
	list, total, err := model.GetAllWithdrawals(status, page, pageSize)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": list, "total": total})
}

// AdminProcessWithdrawal PUT /api/admin/agent-withdrawals/:id
func AdminProcessWithdrawal(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "invalid id"})
		return
	}
	var body struct {
		Status      string `json:"status"`
		AdminRemark string `json:"admin_remark"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	if body.Status != model.WithdrawalStatusApproved && body.Status != model.WithdrawalStatusRejected {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "status must be approved or rejected"})
		return
	}
	if err := model.UpdateWithdrawalStatus(id, body.Status, body.AdminRemark, time.Now().Unix()); err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	// 切账本后：提现 approve 时把对应金额的 approved 账本 FIFO 核销为 paid
	if body.Status == model.WithdrawalStatusApproved && common.SalesLedgerReadEnabled {
		var w model.AgentWithdrawal
		if model.DB.First(&w, id).Error == nil {
			now := time.Now().Unix()
			var entries []model.CommissionLedger
			model.DB.Where("agent_id = ? AND status = ?", w.AgentId, model.CommissionStatusApproved).
				Order("id ASC").Find(&entries)
			remaining := w.Amount
			for _, e := range entries {
				if remaining <= 0 {
					break
				}
				model.DB.Model(&model.CommissionLedger{}).Where("id = ?", e.Id).
					Updates(map[string]any{"status": model.CommissionStatusPaid, "paid_at": now, "withdrawal_id": id})
				remaining -= e.Amount
			}
		}
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "processed"})
}

// AdminSearchUsers GET /api/admin/agents/user-search  (为设置代理时搜索用户)
func AdminSearchUsersForAgent(c *gin.Context) {
	keyword := c.Query("keyword")
	if keyword == "" {
		c.JSON(http.StatusOK, gin.H{"success": true, "data": []interface{}{}})
		return
	}
	var users []model.User
	model.DB.Select("id, username, email, display_name, agent_level, commission_rate").
		Where("username LIKE ? OR email LIKE ?", "%"+keyword+"%", "%"+keyword+"%").
		Limit(20).Find(&users)
	c.JSON(http.StatusOK, gin.H{"success": true, "data": users})
}

// ─────────────────────────────────────────────
// 代理自助接口
// ─────────────────────────────────────────────

// AgentGetSelfInfo GET /api/user/agent/info
// 销售自助查看：包含 1/2/3 级下属统计
func AgentGetSelfInfo(c *gin.Context) {
	userId := c.GetInt("id")
	var agent model.User
	if err := model.DB.Select("id, username, email, agent_level, commission_rate, aff_code, is_sales").
		Where("id = ?", userId).First(&agent).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "user not found"})
		return
	}
	if agent.AgentLevel == 0 && !agent.IsSales {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "not an agent"})
		return
	}

	multi := computeMultiLevelStats(userId)
	l1c, _ := multi["l1_count"].(int64)
	l1t, _ := multi["l1_topup"].(float64)
	l2c, _ := multi["l2_count"].(int64)
	l2t, _ := multi["l2_topup"].(float64)
	l3c, _ := multi["l3_count"].(int64)
	l3t, _ := multi["l3_topup"].(float64)
	totalTopup := l1t + l2t + l3t

	// 佣金口径与 admin 看板统一：用新模型(自身费率取等级默认/个性化覆盖 + 上级穿透)
	// 此前这里用旧的分级因子模型且直接吃 agent.CommissionRate(为0时算出0),与 admin 不一致。
	selfRate := computeSelfRate(agent.AgentLevel, agent.CommissionRate)
	earned := computeEstimatedCommission(selfRate, l1t, l2t, l3t)
	withdrawn, _ := model.SumApprovedWithdrawals(userId)

	// 账本三态(始终展示，供对账与前端三态卡)
	lPending, lApproved, lPaid := model.GetAgentBalances(userId)
	available := earned - withdrawn
	totalEarned := earned
	totalWithdrawn := withdrawn
	// 切到账本读取时(回填+对账后)：可提=账本approved，已提=账本paid，总额=三态合计
	if common.SalesLedgerReadEnabled {
		available = lApproved
		totalWithdrawn = lPaid
		totalEarned = lPending + lApproved + lPaid
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"agent_level":       agent.AgentLevel,
			"is_sales":          agent.IsSales,
			"commission_rate":   agent.CommissionRate,
			"aff_code":          agent.AffCode,
			"l1_count":          l1c,
			"l1_topup":          l1t,
			"l2_count":          l2c,
			"l2_topup":          l2t,
			"l3_count":          l3c,
			"l3_topup":          l3t,
			"customer_count":    l1c + l2c + l3c,
			"total_topup_money": totalTopup,
			"total_earned":      totalEarned,
			"total_withdrawn":   totalWithdrawn,
			"available_balance": available,
			// 账本三态 + 估算值(对账)
			"ledger_pending":    lPending,
			"ledger_approved":   lApproved,
			"ledger_paid":       lPaid,
			"estimated_earned":  earned,
			"ledger_read":       common.SalesLedgerReadEnabled,
		},
	})
}

// AgentGetCustomers GET /api/user/agent/customers
func AgentGetCustomers(c *gin.Context) {
	userId := c.GetInt("id")
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))
	if page <= 0 {
		page = 1
	}
	if pageSize <= 0 || pageSize > 50 {
		pageSize = 20
	}

	var agent model.User
	model.DB.Select("id, agent_level, commission_rate").Where("id = ?", userId).First(&agent)
	if agent.AgentLevel == 0 {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "not an agent"})
		return
	}

	var customers []model.User
	var total int64
	query := model.DB.Model(&model.User{}).Where("inviter_id = ?", userId)
	query.Count(&total)
	offset := (page - 1) * pageSize
	query.Select("id, username, display_name, used_quota, created_at, last_login_at").
		Order("created_at DESC").Offset(offset).Limit(pageSize).Find(&customers)

	type CustomerItem struct {
		Id          int     `json:"id"`
		Username    string  `json:"username"`
		DisplayName string  `json:"display_name"`
		UsedQuota   int     `json:"used_quota"`
		CreatedAt   int64   `json:"created_at"`
		LastLoginAt int64   `json:"last_login_at"`
		Topup       float64 `json:"total_topup_money"`
	}
	result := make([]CustomerItem, 0, len(customers))
	for _, cu := range customers {
		item := CustomerItem{
			Id: cu.Id, Username: cu.Username, DisplayName: cu.DisplayName,
			UsedQuota: cu.UsedQuota, CreatedAt: cu.CreatedAt, LastLoginAt: cu.LastLoginAt,
		}
		model.DB.Model(&model.TopUp{}).
			Where("user_id = ? AND status = ?", cu.Id, common.TopUpStatusSuccess).
			Select("COALESCE(SUM(money), 0)").Scan(&item.Topup)
		result = append(result, item)
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "data": result, "total": total})
}

// AgentSubmitWithdrawal POST /api/user/agent/withdrawals
func AgentSubmitWithdrawal(c *gin.Context) {
	userId := c.GetInt("id")
	var agent model.User
	model.DB.Select("id, agent_level, commission_rate").Where("id = ?", userId).First(&agent)
	if agent.AgentLevel == 0 {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "not an agent"})
		return
	}

	var body struct {
		Amount float64 `json:"amount"`
		Remark string  `json:"remark"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || body.Amount <= 0 {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "invalid amount"})
		return
	}

	// 提现固定周期：周期内只能申请一次(防频繁提现 + 配合锁定期)
	if common.SalesWithdrawCycleDays > 0 {
		var lastW model.AgentWithdrawal
		if model.DB.Where("agent_id = ?", userId).Order("id DESC").First(&lastW).Error == nil && lastW.Id > 0 {
			if time.Now().Unix()-lastW.CreatedAt < int64(common.SalesWithdrawCycleDays)*86400 {
				c.JSON(http.StatusOK, gin.H{"success": false, "message": fmt.Sprintf("提现周期为 %d 天，距上次申请不足，请稍后再试", common.SalesWithdrawCycleDays)})
				return
			}
		}
	}

	// 计算可用余额：切账本后用 approved 余额；否则用与看板一致的多级估算(修正旧的裸 commission_rate bug)
	var available float64
	if common.SalesLedgerReadEnabled {
		available, _ = model.SumCommissionByStatus(userId, model.CommissionStatusApproved)
	} else {
		multi := computeMultiLevelStats(userId)
		l1t, _ := multi["l1_topup"].(float64)
		l2t, _ := multi["l2_topup"].(float64)
		l3t, _ := multi["l3_topup"].(float64)
		earned := computeEstimatedCommission(computeSelfRate(agent.AgentLevel, agent.CommissionRate), l1t, l2t, l3t)
		withdrawn, _ := model.SumApprovedWithdrawals(userId)
		available = earned - withdrawn
	}

	if common.SalesMinWithdrawAmount > 0 && body.Amount < common.SalesMinWithdrawAmount {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": fmt.Sprintf("低于最低提现额 $%.2f", common.SalesMinWithdrawAmount)})
		return
	}
	if body.Amount > available {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "amount exceeds available balance"})
		return
	}

	w := &model.AgentWithdrawal{
		AgentId: userId,
		Amount:  body.Amount,
		Remark:  body.Remark,
		Status:  model.WithdrawalStatusPending,
	}
	if err := model.CreateWithdrawal(w); err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "submitted"})
}

// AgentGetWithdrawals GET /api/user/agent/withdrawals
func AgentGetWithdrawals(c *gin.Context) {
	userId := c.GetInt("id")
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))
	if page <= 0 {
		page = 1
	}
	if pageSize <= 0 || pageSize > 50 {
		pageSize = 20
	}
	list, total, err := model.GetWithdrawalsByAgent(userId, page, pageSize)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": list, "total": total})
}

// ─────────────────────────────────────────────
// 销售代理身份申请 (Sales Application)
// ─────────────────────────────────────────────

// proposedLevelByInviter 按邀请链推断申请人将获得的销售等级
// inviter 不存在 / agent_level=0 → L1（直接 admin 任命）
// inviter agent_level=1 → L2
// inviter agent_level=2 → L3
// inviter agent_level=3 → 0（拒绝，4 级上限）
func proposedLevelByInviter(inviterId int) int {
	if inviterId <= 0 {
		return 1
	}
	var inviter model.User
	if err := model.DB.Select("id, agent_level").Where("id = ?", inviterId).First(&inviter).Error; err != nil {
		return 1
	}
	switch inviter.AgentLevel {
	case 0:
		return 1
	case 1:
		return 2
	case 2:
		return 3
	case 3:
		return 0 // 4 级上限，拒绝
	}
	return 1
}

// fillApplicationRelations 给 applications 列表填上 user/inviter 关联展示字段
func fillApplicationRelations(apps []*model.SalesApplication) {
	if len(apps) == 0 {
		return
	}
	userIds := make([]int, 0, len(apps)*2)
	for _, a := range apps {
		userIds = append(userIds, a.UserId)
		if a.InviterId > 0 {
			userIds = append(userIds, a.InviterId)
		}
	}
	var users []model.User
	model.DB.Select("id, username, email, display_name").Where("id IN ?", userIds).Find(&users)
	idx := make(map[int]model.User, len(users))
	for _, u := range users {
		idx[u.Id] = u
	}
	for _, a := range apps {
		if u, ok := idx[a.UserId]; ok {
			a.UserName = u.Username
			a.UserEmail = u.Email
			a.UserDisplayName = u.DisplayName
		}
		if a.InviterId > 0 {
			if u, ok := idx[a.InviterId]; ok {
				a.InviterName = u.Username
			}
		}
	}
}

// UserApplyForSales POST /api/user/agent/apply
// 普通用户提交销售身份申请；如已有 pending 不允许重复提交。
func UserApplyForSales(c *gin.Context) {
	userId := c.GetInt("id")
	if userId <= 0 {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "未登录"})
		return
	}

	// 已有 pending 不允许重复
	if existing, _ := model.GetPendingApplicationByUser(userId); existing != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "您已有待审批的申请，请耐心等待"})
		return
	}

	// 已是销售则不能再申请
	var u model.User
	if err := model.DB.Select("id, inviter_id, agent_level, is_sales").Where("id = ?", userId).First(&u).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "用户不存在"})
		return
	}
	if u.AgentLevel > 0 {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "您已是销售身份，无需重复申请"})
		return
	}

	var body struct {
		RealName     string `json:"real_name"`
		Phone        string `json:"phone"`
		WechatId     string `json:"wechat_id"`
		SalesChannel string `json:"sales_channel"`
		Reason       string `json:"reason"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "参数错误"})
		return
	}
	if body.RealName == "" || body.Phone == "" {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "姓名和手机号必填"})
		return
	}

	proposed := proposedLevelByInviter(u.InviterId)
	if proposed == 0 {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "您的邀请链已达 4 级上限，无法申请销售身份"})
		return
	}

	app := &model.SalesApplication{
		UserId:        userId,
		InviterId:     u.InviterId,
		ProposedLevel: proposed,
		RealName:      body.RealName,
		Phone:         body.Phone,
		WechatId:      body.WechatId,
		SalesChannel:  body.SalesChannel,
		Reason:        body.Reason,
		Status:        model.SalesAppStatusPending,
	}
	if err := model.CreateSalesApplication(app); err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": app, "message": "申请已提交，等待审批"})
}

// UserGetMyApplication GET /api/user/agent/apply/self
// 当前用户查询自己最近一次申请状态
func UserGetMyApplication(c *gin.Context) {
	userId := c.GetInt("id")
	if userId <= 0 {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "未登录"})
		return
	}
	var app model.SalesApplication
	err := model.DB.Where("user_id = ?", userId).Order("id DESC").First(&app).Error
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": true, "data": nil})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": &app})
}

// UserListMyDownlineApplications GET /api/user/agent/downline-applications
// 销售看自己下线（inviter_id=本人）的申请列表
func UserListMyDownlineApplications(c *gin.Context) {
	userId := c.GetInt("id")
	if userId <= 0 {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "未登录"})
		return
	}
	// 仅 agent_level > 0 的销售可见
	var u model.User
	if err := model.DB.Select("agent_level").Where("id = ?", userId).First(&u).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "用户不存在"})
		return
	}
	if u.AgentLevel == 0 {
		c.JSON(http.StatusOK, gin.H{"success": true, "data": []*model.SalesApplication{}})
		return
	}
	status := c.Query("status") // optional filter
	apps, err := model.ListDownlineApplications(userId, status)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	fillApplicationRelations(apps)
	c.JSON(http.StatusOK, gin.H{"success": true, "data": apps})
}

// AdminListSalesApplications GET /api/admin/agents/applications
// admin 查看全部销售身份申请（默认按 status 过滤）
func AdminListSalesApplications(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("size", "30"))
	if page <= 0 {
		page = 1
	}
	if pageSize <= 0 || pageSize > 200 {
		pageSize = 30
	}
	status := c.Query("status")
	apps, total, err := model.ListAllSalesApplications(status, page, pageSize)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	fillApplicationRelations(apps)
	c.JSON(http.StatusOK, gin.H{"success": true, "data": apps, "total": total})
}

// ReviewSalesApplication POST /api/admin/agents/applications/:id/review
// 审批：approve → 设申请人 agent_level=proposed_level + is_sales=true；reject → 状态置 rejected
// 调用者可以是 admin（任意申请）也可以是申请人的 inviter（仅自己下属的）
func ReviewSalesApplication(c *gin.Context) {
	reviewerId := c.GetInt("id")
	reviewerRole := c.GetInt("role")
	if reviewerId <= 0 {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "未登录"})
		return
	}
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "invalid id"})
		return
	}
	var body struct {
		Action      string `json:"action"`       // "approve" | "reject"
		AdminRemark string `json:"admin_remark"` // 备注
		OverrideLevel int  `json:"override_level"` // admin 可手动指定 level (1/2/3)，0 则用 proposed_level
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "参数错误"})
		return
	}
	if body.Action != "approve" && body.Action != "reject" {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "action 必须 approve 或 reject"})
		return
	}

	app, err := model.GetSalesApplicationById(id)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "申请不存在"})
		return
	}
	if app.Status != model.SalesAppStatusPending {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "该申请已审批"})
		return
	}

	// 权限：admin(role≥10) 或 申请人的 inviter (双方可见)
	isAdmin := reviewerRole >= 10
	isUplineL1 := app.InviterId > 0 && reviewerId == app.InviterId
	if !isAdmin && !isUplineL1 {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "无权审批"})
		return
	}

	// override_level 仅 admin 可用
	finalLevel := app.ProposedLevel
	if isAdmin && body.OverrideLevel >= 1 && body.OverrideLevel <= 3 {
		finalLevel = body.OverrideLevel
	}

	// 取审批人用户名
	var reviewer model.User
	model.DB.Select("username").Where("id = ?", reviewerId).First(&reviewer)

	if body.Action == "reject" {
		app.Status = model.SalesAppStatusRejected
		app.AdminRemark = body.AdminRemark
		app.ReviewedBy = reviewerId
		app.ReviewedByName = reviewer.Username
		app.ReviewedAt = time.Now().Unix()
		if err := model.UpdateSalesApplication(app); err != nil {
			c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "message": "已拒绝"})
		return
	}

	// approve: 事务 - 更新申请 + 设置用户 agent_level
	tx := model.DB.Begin()
	app.Status = model.SalesAppStatusApproved
	app.AdminRemark = body.AdminRemark
	app.ReviewedBy = reviewerId
	app.ReviewedByName = reviewer.Username
	app.ReviewedAt = time.Now().Unix()
	if err := tx.Save(app).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	updates := map[string]interface{}{
		"agent_level": finalLevel,
		"is_sales":    true,
	}
	if err := tx.Model(&model.User{}).Where("id = ?", app.UserId).Updates(updates).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	tx.Commit()
	logger := fmt.Sprintf("sales application #%d approved by user_id=%d (admin=%v upline=%v) → user_id=%d agent_level=%d",
		app.Id, reviewerId, isAdmin, isUplineL1, app.UserId, finalLevel)
	common.SysLog(logger)
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "已通过", "data": gin.H{
		"final_level": finalLevel,
		"user_id":     app.UserId,
	}})
}
