package controller

import (
	"strconv"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
)

// AdminListSubscriptionGroups GET /api/admin/subscription/groups
func AdminListSubscriptionGroups(c *gin.Context) {
	platform := c.Query("platform")
	status := c.Query("status")
	page := common.GetPageQuery(c)

	groups, total, err := model.ListSubscriptionGroups(platform, status, page.Page, page.PageSize)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{
		"groups": groups,
		"total":  total,
		"page":   page.Page,
		"size":   page.PageSize,
	})
}

// AdminGetSubscriptionGroup GET /api/admin/subscription/groups/:id
func AdminGetSubscriptionGroup(c *gin.Context) {
	id, ok := parseSubGroupID(c)
	if !ok {
		return
	}
	group, err := model.GetSubscriptionGroupByID(id)
	if err != nil {
		common.ApiErrorMsg(c, "分组不存在")
		return
	}
	common.ApiSuccess(c, group)
}

// AdminCreateSubscriptionGroup POST /api/admin/subscription/groups
func AdminCreateSubscriptionGroup(c *gin.Context) {
	var group model.SubscriptionGroup
	if err := c.ShouldBindJSON(&group); err != nil {
		common.ApiErrorMsg(c, "参数错误: "+err.Error())
		return
	}
	if group.Status == "" {
		group.Status = "active"
	}
	if group.Platform == "" {
		group.Platform = model.SubPlatformClaude
	}
	if err := model.CreateSubscriptionGroup(&group); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, group)
}

// AdminUpdateSubscriptionGroup PUT /api/admin/subscription/groups/:id
func AdminUpdateSubscriptionGroup(c *gin.Context) {
	id, ok := parseSubGroupID(c)
	if !ok {
		return
	}
	existing, err := model.GetSubscriptionGroupByID(id)
	if err != nil {
		common.ApiErrorMsg(c, "分组不存在")
		return
	}
	if err := c.ShouldBindJSON(existing); err != nil {
		common.ApiErrorMsg(c, "参数错误: "+err.Error())
		return
	}
	existing.ID = id
	if err := model.UpdateSubscriptionGroup(existing); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, existing)
}

// AdminDeleteSubscriptionGroup DELETE /api/admin/subscription/groups/:id
func AdminDeleteSubscriptionGroup(c *gin.Context) {
	id, ok := parseSubGroupID(c)
	if !ok {
		return
	}
	if err := model.DeleteSubscriptionGroup(id); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, nil)
}

// AdminGetGroupAccounts GET /api/admin/subscription/groups/:id/accounts
func AdminGetGroupAccounts(c *gin.Context) {
	id, ok := parseSubGroupID(c)
	if !ok {
		return
	}
	accountIDs, err := model.GetGroupAccounts(id)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{"account_ids": accountIDs, "count": len(accountIDs)})
}

// AdminAddGroupAccounts POST /api/admin/subscription/groups/:id/accounts
func AdminAddGroupAccounts(c *gin.Context) {
	id, ok := parseSubGroupID(c)
	if !ok {
		return
	}
	var req struct {
		AccountIDs []uint `json:"account_ids" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiErrorMsg(c, "参数错误: account_ids 不能为空")
		return
	}
	if err := model.AddAccountsToGroup(id, req.AccountIDs); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{"message": "已添加"})
}

// AdminRemoveGroupAccounts DELETE /api/admin/subscription/groups/:id/accounts
func AdminRemoveGroupAccounts(c *gin.Context) {
	id, ok := parseSubGroupID(c)
	if !ok {
		return
	}
	var req struct {
		AccountIDs []uint `json:"account_ids" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiErrorMsg(c, "参数错误: account_ids 不能为空")
		return
	}
	if err := model.RemoveAccountsFromGroup(id, req.AccountIDs); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{"message": "已移除"})
}

func parseSubGroupID(c *gin.Context) (uint, bool) {
	idVal, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil || idVal == 0 {
		common.ApiErrorMsg(c, "无效的分组 ID")
		return 0, false
	}
	return uint(idVal), true
}
