package controller

import (
	"net/http"
	"strconv"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"

	"github.com/gin-gonic/gin"
)

// GetUserUsageSummary 管理员查看某用户的用量画像
// GET /api/user/:id/usage-summary?start_timestamp=&end_timestamp=&top=20
func GetUserUsageSummary(c *gin.Context) {
	idStr := c.Param("id")
	userId, err := strconv.Atoi(idStr)
	if err != nil || userId <= 0 {
		common.ApiErrorMsg(c, "无效的用户 ID")
		return
	}

	startTs, _ := strconv.ParseInt(c.Query("start_timestamp"), 10, 64)
	endTs, _ := strconv.ParseInt(c.Query("end_timestamp"), 10, 64)
	top, _ := strconv.Atoi(c.Query("top"))
	if top <= 0 || top > 200 {
		top = 50
	}

	// 校验用户存在
	user, uerr := model.GetUserById(userId, true)
	if uerr != nil || user == nil {
		common.ApiErrorMsg(c, "用户不存在")
		return
	}

	byModel, err := model.GetUserUsageByModel(userId, startTs, endTs, top)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	byDay, err := model.GetUserUsageByDay(userId, startTs, endTs)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	totals, err := model.GetUserUsageTotals(userId, startTs, endTs)
	if err != nil {
		common.ApiError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data": gin.H{
			"user": gin.H{
				"id":          user.Id,
				"username":    user.Username,
				"display_name": user.DisplayName,
				"email":       user.Email,
				"role":        user.Role,
				"status":      user.Status,
				"quota":       user.Quota,
				"used_quota":  user.UsedQuota,
				"group":       user.Group,
			},
			"totals":   totals,
			"by_model": byModel,
			"by_day":   byDay,
		},
	})
}
