package controller

import (
	"net/http"
	"os"
	"path/filepath"

	"github.com/gin-gonic/gin"
)

// GetBijiaStatus 返回最近一次中转站续探脚本写入的存活状态。
// 数据由 /opt/new-api/data/bijia-status.json（cron 每天 04:00 生成）提供。
// 该接口需 admin 鉴权（在 router 里挂在 adminRoute 下）。
func GetBijiaStatus(c *gin.Context) {
	candidates := []string{
		"/opt/new-api/data/bijia-status.json",
		filepath.Join(os.Getenv("HOME"), "new-api/data/bijia-status.json"),
		"data/bijia-status.json",
	}
	for _, p := range candidates {
		data, err := os.ReadFile(p)
		if err == nil {
			c.Data(http.StatusOK, "application/json; charset=utf-8", data)
			return
		}
	}
	c.JSON(http.StatusOK, gin.H{
		"success": false,
		"message": "尚未生成探测数据；cron 首次将在每天 04:00 执行",
		"data":    nil,
	})
}
