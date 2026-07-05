package controller

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"

	"github.com/gin-gonic/gin"
)

// === WorkGroup endpoints ===

func parseWorkGroupId(c *gin.Context) (uint, bool) {
	wgIdStr := c.Param("wg_id")
	if wgIdStr == "" {
		wgIdStr = c.Param("id")
	}
	wgId, err := strconv.Atoi(wgIdStr)
	if err != nil || wgId <= 0 {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "无效的工作组 ID"})
		return 0, false
	}
	return uint(wgId), true
}

// requireEnterpriseAccess 校验当前用户能否管理目标企业；返回企业 ID
func requireEnterpriseAccess(c *gin.Context) (uint, bool) {
	id, ok := parseEnterpriseId(c)
	if !ok {
		return 0, false
	}
	if !canManageEnterprise(c, id) {
		c.JSON(http.StatusForbidden, gin.H{"success": false, "message": "无权操作"})
		return 0, false
	}
	return id, true
}

type createWorkGroupReq struct {
	Name        string `json:"name"`
	Description string `json:"description"`
}

// CreateWorkGroup POST /api/enterprise/admin/enterprises/:id/workgroups
func CreateWorkGroup(c *gin.Context) {
	entId, ok := requireEnterpriseAccess(c)
	if !ok {
		return
	}
	var req createWorkGroupReq
	if err := common.DecodeJson(c.Request.Body, &req); err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "无效请求"})
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" || len(req.Name) > 128 {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "工作组名称长度需在 1-128"})
		return
	}
	wg := &model.WorkGroup{
		EnterpriseId: entId,
		Name:         req.Name,
		Description:  strings.TrimSpace(req.Description),
	}
	if err := model.CreateWorkGroup(wg); err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": wg})
}

// ListWorkGroups GET /api/enterprise/admin/enterprises/:id/workgroups
func ListWorkGroups(c *gin.Context) {
	entId, ok := requireEnterpriseAccess(c)
	if !ok {
		return
	}
	rows, err := model.ListWorkGroupsByEnterprise(entId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": rows})
}

type updateWorkGroupReq struct {
	Name        string `json:"name"`
	Description string `json:"description"`
}

// UpdateWorkGroup PUT /api/enterprise/admin/enterprises/:id/workgroups/:wg_id
func UpdateWorkGroup(c *gin.Context) {
	entId, ok := requireEnterpriseAccess(c)
	if !ok {
		return
	}
	wgId, ok := parseWorkGroupId(c)
	if !ok {
		return
	}
	wg, err := model.GetWorkGroupById(wgId)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	if wg.EnterpriseId != entId {
		c.JSON(http.StatusForbidden, gin.H{"success": false, "message": "工作组不属于该企业"})
		return
	}
	var req updateWorkGroupReq
	if err := common.DecodeJson(c.Request.Body, &req); err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "无效请求"})
		return
	}
	if req.Name != "" {
		wg.Name = strings.TrimSpace(req.Name)
	}
	wg.Description = strings.TrimSpace(req.Description)
	if err := model.UpdateWorkGroup(wg); err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": wg})
}

// DeleteWorkGroup DELETE /api/enterprise/admin/enterprises/:id/workgroups/:wg_id
func DeleteWorkGroup(c *gin.Context) {
	entId, ok := requireEnterpriseAccess(c)
	if !ok {
		return
	}
	wgId, ok := parseWorkGroupId(c)
	if !ok {
		return
	}
	wg, err := model.GetWorkGroupById(wgId)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	if wg.EnterpriseId != entId {
		c.JSON(http.StatusForbidden, gin.H{"success": false, "message": "工作组不属于该企业"})
		return
	}
	if err := model.DeleteWorkGroup(wgId); err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true})
}

// ListWorkGroupMembers GET /api/enterprise/admin/enterprises/:id/workgroups/:wg_id/members
func ListWorkGroupMembers(c *gin.Context) {
	entId, ok := requireEnterpriseAccess(c)
	if !ok {
		return
	}
	wgId, ok := parseWorkGroupId(c)
	if !ok {
		return
	}
	wg, err := model.GetWorkGroupById(wgId)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	if wg.EnterpriseId != entId {
		c.JSON(http.StatusForbidden, gin.H{"success": false, "message": "工作组不属于该企业"})
		return
	}
	users, err := model.ListWorkGroupMembers(wgId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	for i := range users {
		users[i].Password = ""
		users[i].AccessToken = nil
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": users})
}

type wgMemberReq struct {
	UserId int `json:"user_id"`
}

// AddWorkGroupMember POST /api/enterprise/admin/enterprises/:id/workgroups/:wg_id/members
func AddWorkGroupMember(c *gin.Context) {
	entId, ok := requireEnterpriseAccess(c)
	if !ok {
		return
	}
	wgId, ok := parseWorkGroupId(c)
	if !ok {
		return
	}
	wg, err := model.GetWorkGroupById(wgId)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	if wg.EnterpriseId != entId {
		c.JSON(http.StatusForbidden, gin.H{"success": false, "message": "工作组不属于该企业"})
		return
	}
	var req wgMemberReq
	if err := common.DecodeJson(c.Request.Body, &req); err != nil || req.UserId <= 0 {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "无效请求"})
		return
	}
	if err := model.AddWorkGroupMember(wgId, req.UserId); err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true})
}

// RemoveWorkGroupMember DELETE /api/enterprise/admin/enterprises/:id/workgroups/:wg_id/members/:user_id
func RemoveWorkGroupMember(c *gin.Context) {
	entId, ok := requireEnterpriseAccess(c)
	if !ok {
		return
	}
	wgId, ok := parseWorkGroupId(c)
	if !ok {
		return
	}
	wg, err := model.GetWorkGroupById(wgId)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	if wg.EnterpriseId != entId {
		c.JSON(http.StatusForbidden, gin.H{"success": false, "message": "工作组不属于该企业"})
		return
	}
	uid, err := strconv.Atoi(c.Param("user_id"))
	if err != nil || uid <= 0 {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "无效用户 ID"})
		return
	}
	if err := model.RemoveWorkGroupMember(wgId, uid); err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true})
}

// === Enterprise Limits endpoints ===

type createLimitReq struct {
	ScopeType   string `json:"scope_type"`
	ScopeId     uint   `json:"scope_id"`
	Period      string `json:"period"`
	MaxQuota    int64  `json:"max_quota"`
	EnforceHard bool   `json:"enforce_hard"`
}

// CreateEnterpriseLimit POST /api/enterprise/admin/enterprises/:id/limits
func CreateEnterpriseLimit(c *gin.Context) {
	entId, ok := requireEnterpriseAccess(c)
	if !ok {
		return
	}
	var req createLimitReq
	if err := common.DecodeJson(c.Request.Body, &req); err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "无效请求"})
		return
	}
	if !isValidScope(req.ScopeType) || !isValidPeriod(req.Period) {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "scope_type 或 period 不合法"})
		return
	}
	if req.MaxQuota < 0 {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "max_quota 不能为负数"})
		return
	}
	// 校验 scope_id 合法
	if req.ScopeType == model.LimitScopeEnterprise {
		req.ScopeId = 0
	} else if req.ScopeType == model.LimitScopeWorkGroup {
		wg, err := model.GetWorkGroupById(req.ScopeId)
		if err != nil || wg.EnterpriseId != entId {
			c.JSON(http.StatusOK, gin.H{"success": false, "message": "工作组不属于该企业"})
			return
		}
	} else if req.ScopeType == model.LimitScopeMember {
		// 校验该用户是该企业成员
		var count int64
		model.DB.Model(&model.EnterpriseMember{}).Where("enterprise_id = ? AND user_id = ?", entId, req.ScopeId).Count(&count)
		if count == 0 {
			c.JSON(http.StatusOK, gin.H{"success": false, "message": "目标用户不在该企业中"})
			return
		}
	}
	l := &model.EnterpriseLimit{
		EnterpriseId: entId,
		ScopeType:    req.ScopeType,
		ScopeId:      req.ScopeId,
		Period:       req.Period,
		MaxQuota:     req.MaxQuota,
		EnforceHard:  req.EnforceHard,
	}
	if err := model.CreateEnterpriseLimit(l); err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": l})
}

// ListEnterpriseLimits GET /api/enterprise/admin/enterprises/:id/limits
func ListEnterpriseLimits(c *gin.Context) {
	entId, ok := requireEnterpriseAccess(c)
	if !ok {
		return
	}
	rows, err := model.ListEnterpriseLimits(entId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": rows})
}

type updateLimitReq struct {
	MaxQuota    *int64 `json:"max_quota"`
	EnforceHard *bool  `json:"enforce_hard"`
}

// UpdateEnterpriseLimit PUT /api/enterprise/admin/enterprises/:id/limits/:limit_id
func UpdateEnterpriseLimit(c *gin.Context) {
	entId, ok := requireEnterpriseAccess(c)
	if !ok {
		return
	}
	limitId, err := strconv.Atoi(c.Param("limit_id"))
	if err != nil || limitId <= 0 {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "无效限额 ID"})
		return
	}
	l, err := model.GetEnterpriseLimitById(uint(limitId))
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	if l.EnterpriseId != entId {
		c.JSON(http.StatusForbidden, gin.H{"success": false, "message": "限额不属于该企业"})
		return
	}
	var req updateLimitReq
	if err := common.DecodeJson(c.Request.Body, &req); err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "无效请求"})
		return
	}
	if req.MaxQuota != nil {
		if *req.MaxQuota < 0 {
			c.JSON(http.StatusOK, gin.H{"success": false, "message": "max_quota 不能为负数"})
			return
		}
		l.MaxQuota = *req.MaxQuota
	}
	if req.EnforceHard != nil {
		l.EnforceHard = *req.EnforceHard
	}
	if err := model.UpdateEnterpriseLimit(l); err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": l})
}

// DeleteEnterpriseLimit DELETE /api/enterprise/admin/enterprises/:id/limits/:limit_id
func DeleteEnterpriseLimit(c *gin.Context) {
	entId, ok := requireEnterpriseAccess(c)
	if !ok {
		return
	}
	limitId, err := strconv.Atoi(c.Param("limit_id"))
	if err != nil || limitId <= 0 {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "无效限额 ID"})
		return
	}
	l, err := model.GetEnterpriseLimitById(uint(limitId))
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	if l.EnterpriseId != entId {
		c.JSON(http.StatusForbidden, gin.H{"success": false, "message": "限额不属于该企业"})
		return
	}
	if err := model.DeleteEnterpriseLimit(uint(limitId)); err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true})
}

func isValidScope(s string) bool {
	return s == model.LimitScopeEnterprise || s == model.LimitScopeWorkGroup || s == model.LimitScopeMember
}

func isValidPeriod(p string) bool {
	return p == model.LimitPeriodDaily || p == model.LimitPeriodMonthly ||
		p == model.LimitPeriodQuarter || p == model.LimitPeriodTotal
}
