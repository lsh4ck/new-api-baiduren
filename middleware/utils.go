package middleware

import (
	"fmt"
	"net/http"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/types"
	"github.com/gin-gonic/gin"
)

func abortWithOpenAiMessage(c *gin.Context, statusCode int, message string, code ...types.ErrorCode) {
	userId := c.GetInt("id")
	// 真实错误始终记入日志，无论是否对客户屏蔽
	logger.LogError(c.Request.Context(), fmt.Sprintf("user %d | %s", userId, message))

	// 开启屏蔽时：对客户一律返回通用 500，不透传任何上游/内部细节(分组名、渠道名、模型名等)。
	// 例外：429 限速消息(仅含"我方每分钟请求上限"，不含任何上游/渠道/模型信息)如实透传，
	// 让被限速的用户看到明确提示而非误以为服务故障。
	if common.MaskRelayClientError && statusCode != http.StatusTooManyRequests {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": gin.H{
				"message": common.MaskedClientErrorMessage(c.GetString(common.RequestIdKey)),
				"type":    "server_error",
				"code":    "server_error",
			},
		})
		c.Abort()
		return
	}

	codeStr := ""
	if len(code) > 0 {
		codeStr = string(code[0])
	}
	c.JSON(statusCode, gin.H{
		"error": gin.H{
			"message": common.MessageWithRequestId(message, c.GetString(common.RequestIdKey)),
			"type":    "new_api_error",
			"code":    codeStr,
		},
	})
	c.Abort()
}

func abortWithMidjourneyMessage(c *gin.Context, statusCode int, code int, description string) {
	c.JSON(statusCode, gin.H{
		"description": description,
		"type":        "new_api_error",
		"code":        code,
	})
	c.Abort()
	logger.LogError(c.Request.Context(), description)
}
