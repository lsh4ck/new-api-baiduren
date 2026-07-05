package controller

import (
	"io"
	"net/http"
	"os"
	"strconv"
	"time"

	"github.com/QuantumNous/new-api/common"

	"github.com/gin-gonic/gin"
)

// smartRelayBase 优先读 env，回退到本机默认地址。
func smartRelayBase() string {
	if v := os.Getenv("SMART_RELAY_URL"); v != "" {
		return v
	}
	return "http://127.0.0.1:9090"
}

// proxySmartRelay 通用反代 smart-relay 的 dashboard endpoint。
// path 形如 "/dashboard/global-savings" 或 "/dashboard/user/savings"。
func proxySmartRelay(c *gin.Context, path string, extraQuery map[string]string) {
	base := smartRelayBase()
	url := base + path

	req, err := http.NewRequestWithContext(c.Request.Context(), "GET", url, nil)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"success": false, "message": "构造请求失败: " + err.Error()})
		return
	}

	// 透传 query
	q := req.URL.Query()
	for k, v := range c.Request.URL.Query() {
		for _, vv := range v {
			q.Add(k, vv)
		}
	}
	for k, v := range extraQuery {
		q.Set(k, v)
	}
	req.URL.RawQuery = q.Encode()

	client := &http.Client{Timeout: 6 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		common.SysLog("smart-relay proxy error: " + err.Error())
		c.JSON(http.StatusBadGateway, gin.H{"success": false, "message": "smart-relay 不可达"})
		return
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)

	c.Data(resp.StatusCode, resp.Header.Get("Content-Type"), body)
}

// GetUserOptimizationSummary GET /api/user/self/optimization-summary
// 调用 smart-relay /dashboard/user/savings?user_id=<self>
func GetUserOptimizationSummary(c *gin.Context) {
	userId := c.GetInt("id")
	if userId == 0 {
		c.JSON(http.StatusUnauthorized, gin.H{"success": false, "message": "未登录"})
		return
	}
	proxySmartRelay(c, "/dashboard/user/savings", map[string]string{"user_id": strconv.Itoa(userId)})
}

// GetAdminUserOptimizationSummary GET /api/user/:id/optimization-summary（AdminAuth）
// 让管理员在用量详情里看任意用户的节省数据
func GetAdminUserOptimizationSummary(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.Atoi(idStr)
	if err != nil || id <= 0 {
		common.ApiErrorMsg(c, "无效的用户 ID")
		return
	}
	proxySmartRelay(c, "/dashboard/user/savings", map[string]string{"user_id": strconv.Itoa(id)})
}

// GetGlobalOptimizationSavings GET /api/optimization/global-savings（公开）
// 落地页用，无需登录
func GetGlobalOptimizationSavings(c *gin.Context) {
	proxySmartRelay(c, "/dashboard/global-savings", nil)
}
