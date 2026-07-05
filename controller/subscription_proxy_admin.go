package controller

import (
	"strconv"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
)

// AdminListSubscriptionProxies GET /api/admin/subscription/proxies
func AdminListSubscriptionProxies(c *gin.Context) {
	status := c.Query("status")
	page := common.GetPageQuery(c)

	proxies, total, err := model.ListSubscriptionProxies(status, page.Page, page.PageSize)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{
		"proxies": proxies,
		"total":   total,
		"page":    page.Page,
		"size":    page.PageSize,
	})
}

// AdminGetSubscriptionProxy GET /api/admin/subscription/proxies/:id
func AdminGetSubscriptionProxy(c *gin.Context) {
	id, ok := parseProxyID(c)
	if !ok {
		return
	}
	proxy, err := model.GetSubscriptionProxyByID(id)
	if err != nil {
		common.ApiErrorMsg(c, "代理不存在")
		return
	}
	common.ApiSuccess(c, proxy)
}

// AdminCreateSubscriptionProxy POST /api/admin/subscription/proxies
func AdminCreateSubscriptionProxy(c *gin.Context) {
	var proxy model.SubscriptionProxy
	if err := c.ShouldBindJSON(&proxy); err != nil {
		common.ApiErrorMsg(c, "参数错误: "+err.Error())
		return
	}
	if proxy.Status == "" {
		proxy.Status = "active"
	}
	proxy.IsHealthy = true
	if err := model.CreateSubscriptionProxy(&proxy); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, proxy)
}

// AdminUpdateSubscriptionProxy PUT /api/admin/subscription/proxies/:id
func AdminUpdateSubscriptionProxy(c *gin.Context) {
	id, ok := parseProxyID(c)
	if !ok {
		return
	}
	existing, err := model.GetSubscriptionProxyByID(id)
	if err != nil {
		common.ApiErrorMsg(c, "代理不存在")
		return
	}
	if err := c.ShouldBindJSON(existing); err != nil {
		common.ApiErrorMsg(c, "参数错误: "+err.Error())
		return
	}
	existing.ID = id
	if err := model.UpdateSubscriptionProxy(existing); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, existing)
}

// AdminDeleteSubscriptionProxy DELETE /api/admin/subscription/proxies/:id
func AdminDeleteSubscriptionProxy(c *gin.Context) {
	id, ok := parseProxyID(c)
	if !ok {
		return
	}
	if err := model.DeleteSubscriptionProxy(id); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, nil)
}

// AdminTestSubscriptionProxy POST /api/admin/subscription/proxies/:id/test
func AdminTestSubscriptionProxy(c *gin.Context) {
	id, ok := parseProxyID(c)
	if !ok {
		return
	}
	proxy, err := model.GetSubscriptionProxyByID(id)
	if err != nil {
		common.ApiErrorMsg(c, "代理不存在")
		return
	}

	client, err := service.GetHttpClientWithProxy(proxy.URL)
	if err != nil {
		common.ApiSuccess(c, gin.H{"ok": false, "message": "代理 URL 无效: " + err.Error()})
		return
	}

	// Quick connectivity test to a known endpoint
	resp, err := client.Get("https://www.google.com/generate_204")
	if err != nil {
		model.DB.Model(proxy).Updates(map[string]interface{}{
			"is_healthy": false,
			"fail_count": proxy.FailCount + 1,
		})
		common.ApiSuccess(c, gin.H{"ok": false, "message": "连接失败: " + err.Error()})
		return
	}
	resp.Body.Close()

	ok2 := resp.StatusCode == 204 || resp.StatusCode == 200
	model.DB.Model(proxy).Updates(map[string]interface{}{
		"is_healthy": ok2,
		"fail_count": 0,
	})
	msg := "代理连接正常"
	if !ok2 {
		msg = "代理返回异常状态码: " + strconv.Itoa(resp.StatusCode)
	}
	common.ApiSuccess(c, gin.H{"ok": ok2, "message": msg})
}

func parseProxyID(c *gin.Context) (uint, bool) {
	idVal, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil || idVal == 0 {
		common.ApiErrorMsg(c, "无效的代理 ID")
		return 0, false
	}
	return uint(idVal), true
}
