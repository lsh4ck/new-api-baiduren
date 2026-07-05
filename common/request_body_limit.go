package common

import (
	"github.com/QuantumNous/new-api/constant"
)

// 官方 d2f7f9ee(#5244):匿名请求体大小限制。防止未鉴权接口(register/login/webhook 等)
// 被超大请求体/zip bomb 打爆内存。env ANONYMOUS_REQUEST_BODY_LIMIT_KB(默认 512),<0 关闭。
// 注:IsRequestBodyTooLargeError 已在 gin.go 定义,直接复用。
const defaultAnonymousRequestBodyLimitKB = 512

// GetAnonymousRequestBodyLimitBytes 返回匿名请求体上限字节数(<=0 表示不限制)
func GetAnonymousRequestBodyLimitBytes() int64 {
	limitKB := constant.AnonymousRequestBodyLimitKB
	if limitKB < 0 {
		limitKB = defaultAnonymousRequestBodyLimitKB
	}
	return int64(limitKB) << 10
}
