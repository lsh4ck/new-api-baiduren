package controller

import (
	"net/http"

	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
)

// RunChannelSilenceCheck POST /api/channel/silence_check
// 管理员手动触发一次渠道静默告警巡检（不等 1 小时 cron）
// 注意：这里直接复用后台 cron 的检查函数；如果有匹配渠道会立刻发邮件
func RunChannelSilenceCheck(c *gin.Context) {
	go service.RunChannelSilenceCheckOnce()
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "已触发静默渠道巡检，请查看邮箱与系统日志",
	})
}
