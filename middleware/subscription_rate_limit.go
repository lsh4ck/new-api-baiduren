package middleware

import (
	"fmt"
	"net/http"

	"github.com/QuantumNous/new-api/service"

	"github.com/gin-gonic/gin"
)

// SubscriptionRateLimit 订阅中继专用用户级限流中间件
// 挂载在 /v1/subscription/* 路由上，防止单个用户刷爆订阅账号池
func SubscriptionRateLimit() gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.GetInt("id")
		if userID == 0 {
			c.Next()
			return
		}

		rl := service.GetSubscriptionRateLimiter()
		if !rl.CheckUserRateLimit(userID, 0) {
			c.JSON(http.StatusTooManyRequests, gin.H{
				"error": gin.H{
					"message": fmt.Sprintf("订阅请求过于频繁，请稍后再试"),
					"type":    "subscription_rate_limit",
				},
			})
			c.Abort()
			return
		}

		c.Next()
	}
}
