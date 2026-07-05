package controller

import (
	"net/http"
	"strconv"
	"time"

	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"

	"github.com/gin-gonic/gin"
)

// ===== 销售自助 =====

// AgentGetLedger GET /api/user/agent/ledger 佣金明细(三态 + 分页 + status 过滤)
func AgentGetLedger(c *gin.Context) {
	userId := c.GetInt("id")
	status := c.Query("status")
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	size, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))
	rows, total, err := model.GetLedgerEntries(userId, status, page, size)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	pending, approved, paid := model.GetAgentBalances(userId)
	c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{
		"items": rows, "total": total,
		"pending": pending, "approved": approved, "paid": paid,
	}})
}

// ===== Admin =====

// AdminListLedger GET /api/admin/commission/ledger 按 agent/status/source 过滤
func AdminListLedger(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	size, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))
	if page < 1 {
		page = 1
	}
	if size <= 0 || size > 200 {
		size = 20
	}
	q := model.DB.Model(&model.CommissionLedger{})
	if a := c.Query("agent_id"); a != "" {
		q = q.Where("agent_id = ?", a)
	}
	if s := c.Query("status"); s != "" {
		q = q.Where("status = ?", s)
	}
	if st := c.Query("source_type"); st != "" {
		q = q.Where("source_type = ?", st)
	}
	var total int64
	q.Count(&total)
	var rows []model.CommissionLedger
	q.Order("id DESC").Offset((page - 1) * size).Limit(size).Find(&rows)
	c.JSON(http.StatusOK, gin.H{"success": true, "data": rows, "total": total})
}

// AdminManualCommission POST /api/admin/commission/manual 手动补单
func AdminManualCommission(c *gin.Context) {
	var req struct {
		AgentId    int     `json:"agent_id"`
		CustomerId int     `json:"customer_id"`
		Amount     float64 `json:"amount"`
		Remark     string  `json:"remark"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || req.AgentId <= 0 || req.Amount == 0 {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "参数错误(agent_id/amount)"})
		return
	}
	now := time.Now().Unix()
	cl := &model.CommissionLedger{
		AgentId: req.AgentId, CustomerId: req.CustomerId, Level: 1,
		SourceType: model.CommissionSourceManual, BaseAmount: req.Amount, Rate: 1,
		Amount: req.Amount, Status: model.CommissionStatusApproved, ApprovedAt: now,
		Remark:         "manual: " + req.Remark,
		IdempotencyKey: "manual:" + strconv.FormatInt(now, 10) + ":agent:" + strconv.Itoa(req.AgentId),
	}
	if err := model.DB.Create(cl).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	model.RecordCommissionAudit(&model.CommissionAuditLog{
		ActorId: c.GetInt("id"), ActorName: c.GetString("username"), Action: "manual_commission",
		TargetAgentId: req.AgentId, LedgerId: cl.Id, AmountDelta: req.Amount, Detail: req.Remark, Ip: c.ClientIP(),
	})
	c.JSON(http.StatusOK, gin.H{"success": true, "data": cl})
}

// AdminVoidCommission POST /api/admin/commission/:id/void 作废一条佣金
func AdminVoidCommission(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	var cl model.CommissionLedger
	if err := model.DB.First(&cl, id).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "not found"})
		return
	}
	model.DB.Model(&model.CommissionLedger{}).Where("id = ?", id).
		Update("status", model.CommissionStatusVoided)
	model.RecordCommissionAudit(&model.CommissionAuditLog{
		ActorId: c.GetInt("id"), ActorName: c.GetString("username"), Action: "void",
		TargetAgentId: cl.AgentId, LedgerId: id, AmountDelta: -cl.Amount, Ip: c.ClientIP(),
	})
	c.JSON(http.StatusOK, gin.H{"success": true})
}

// AdminClawbackCommission POST /api/admin/commission/clawback 手动按来源冲正
func AdminClawbackCommission(c *gin.Context) {
	var req struct {
		SourceType string `json:"source_type"`
		SourceId   int64  `json:"source_id"`
		Reason     string `json:"reason"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || req.SourceType == "" || req.SourceId == 0 {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "参数错误"})
		return
	}
	service.ClawbackBySource(req.SourceType, req.SourceId, req.Reason)
	model.RecordCommissionAudit(&model.CommissionAuditLog{
		ActorId: c.GetInt("id"), ActorName: c.GetString("username"), Action: "manual_clawback",
		Detail: req.SourceType + ":" + strconv.FormatInt(req.SourceId, 10) + " " + req.Reason, Ip: c.ClientIP(),
	})
	c.JSON(http.StatusOK, gin.H{"success": true})
}

// AdminFreezeAgent POST /api/admin/agents/:id/freeze 黑名单冻结/解冻
func AdminFreezeAgent(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	var req struct {
		Frozen bool   `json:"frozen"`
		Reason string `json:"reason"`
	}
	_ = c.ShouldBindJSON(&req)
	model.DB.Model(&model.User{}).Where("id = ?", id).Update("commission_frozen", req.Frozen)
	model.RecordCommissionAudit(&model.CommissionAuditLog{
		ActorId: c.GetInt("id"), ActorName: c.GetString("username"),
		Action: "freeze", TargetAgentId: id, Detail: req.Reason, Ip: c.ClientIP(),
	})
	c.JSON(http.StatusOK, gin.H{"success": true})
}

// AdminReviewFraud POST /api/admin/agents/:id/fraud-review 风控审核(放行/确认作弊)
func AdminReviewFraud(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id")) // 这里 id 是被审的客户 user id
	var req struct {
		FraudFlag int    `json:"fraud_flag"` // 2=确认作弊 3=放行清白
		Reason    string `json:"reason"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || (req.FraudFlag != 2 && req.FraudFlag != 3) {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "fraud_flag 须为 2(作弊)或3(清白)"})
		return
	}
	model.DB.Model(&model.User{}).Where("id = ?", id).Update("fraud_flag", req.FraudFlag)
	model.RecordCommissionAudit(&model.CommissionAuditLog{
		ActorId: c.GetInt("id"), ActorName: c.GetString("username"),
		Action: "fraud_review", TargetAgentId: id, Detail: strconv.Itoa(req.FraudFlag) + " " + req.Reason, Ip: c.ClientIP(),
	})
	c.JSON(http.StatusOK, gin.H{"success": true})
}

// AdminListFraudUsers GET /api/admin/commission/fraud 待审/疑似自邀用户
func AdminListFraudUsers(c *gin.Context) {
	var rows []model.User
	model.DB.Select("id, username, email, inviter_id, register_ip, fraud_flag").
		Where("fraud_flag = ?", 1).Order("id DESC").Limit(200).Find(&rows)
	c.JSON(http.StatusOK, gin.H{"success": true, "data": rows})
}

// AdminListCommissionAudit GET /api/admin/commission/audit
func AdminListCommissionAudit(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	size, _ := strconv.Atoi(c.DefaultQuery("page_size", "30"))
	if page < 1 {
		page = 1
	}
	if size <= 0 || size > 200 {
		size = 30
	}
	var total int64
	model.DB.Model(&model.CommissionAuditLog{}).Count(&total)
	var rows []model.CommissionAuditLog
	model.DB.Order("id DESC").Offset((page - 1) * size).Limit(size).Find(&rows)
	c.JSON(http.StatusOK, gin.H{"success": true, "data": rows, "total": total})
}

// AdminGetLeaderboard GET /api/admin/agents/leaderboard 销售排行榜(按账本佣金总额降序)
func AdminGetLeaderboard(c *gin.Context) {
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	type Row struct {
		AgentId int     `json:"agent_id"`
		Total   float64 `json:"total"`
	}
	var rows []Row
	model.DB.Model(&model.CommissionLedger{}).
		Select("agent_id, COALESCE(SUM(amount),0) as total").
		Where("status IN ?", []string{model.CommissionStatusApproved, model.CommissionStatusPaid, model.CommissionStatusPending}).
		Group("agent_id").Order("total DESC").Limit(limit).Scan(&rows)
	out := make([]gin.H, 0, len(rows))
	for _, r := range rows {
		var u model.User
		model.DB.Select("username").First(&u, r.AgentId)
		var cnt int64
		model.DB.Model(&model.User{}).Where("inviter_id = ?", r.AgentId).Count(&cnt)
		out = append(out, gin.H{"agent_id": r.AgentId, "username": u.Username, "total_commission": r.Total, "l1_count": cnt})
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": out})
}

// AdminBackfillCommission POST /api/admin/commission/backfill 从历史成功充值回填账本(幂等,生成 approved 条目)
func AdminBackfillCommission(c *gin.Context) {
	go func() {
		n := service.BackfillTopupCommissions()
		model.RecordCommissionAudit(&model.CommissionAuditLog{
			Action: "backfill", Detail: "回填历史佣金条目数: " + strconv.Itoa(n),
		})
	}()
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "回填已在后台启动，完成后查审计日志"})
}
