package service

import (
	"fmt"
	"net/http"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
)

// SubscriptionRateLimiter 订阅账号专用限流器
// 提供三层防护:
// 1. 用户级限流: 防止单个用户刷爆订阅池
// 2. 账号级 RPM 限流: 防止单个订阅账号请求过快
// 3. 账号级并发控制: 防止单个订阅账号同时处理过多请求
// 4. 平台级并发控制: 防止单个平台的所有账号同时过载
type SubscriptionRateLimiter struct {
	// 用户级限流: key = "user:{userId}", value = 时间戳队列
	userLimiter *common.InMemoryRateLimiter

	// 账号级 RPM 限流: key = "account:{accountId}", value = 时间戳队列
	accountLimiter *common.InMemoryRateLimiter

	// 账号级并发信号量: key = accountId, value = chan struct{}
	accountSemaphores sync.Map

	// 平台级并发信号量: key = platform, value = chan struct{}
	platformSemaphores sync.Map
}

var (
	subRateLimiter     *SubscriptionRateLimiter
	subRateLimiterOnce sync.Once
)

// DefaultSubscriptionRateLimit 默认用户级限流配置
var DefaultSubscriptionRateLimit = struct {
	DurationMinutes int
	MaxRequests     int
}{
	DurationMinutes: 1,
	MaxRequests:     30, // 默认 1 分钟 30 次
}

// DefaultPlatformConcurrency 默认平台级最大并发数
var DefaultPlatformConcurrency = map[string]int{
	"claude": 20,
	"codex":  20,
	"gemini": 20,
}

// GetSubscriptionRateLimiter 获取单例限流器
func GetSubscriptionRateLimiter() *SubscriptionRateLimiter {
	subRateLimiterOnce.Do(func() {
		subRateLimiter = &SubscriptionRateLimiter{
			userLimiter:    &common.InMemoryRateLimiter{},
			accountLimiter: &common.InMemoryRateLimiter{},
		}
		subRateLimiter.userLimiter.Init(time.Duration(DefaultSubscriptionRateLimit.DurationMinutes) * time.Minute)
		subRateLimiter.accountLimiter.Init(time.Minute) // 账号级固定 1 分钟窗口
	})
	return subRateLimiter
}

// ==================== 用户级限流 ====================

// CheckUserRateLimit 检查用户是否超过订阅请求频率限制
// 返回 true 表示允许请求，false 表示被限流
func (rl *SubscriptionRateLimiter) CheckUserRateLimit(userID int, maxRequests int) bool {
	if maxRequests <= 0 {
		maxRequests = DefaultSubscriptionRateLimit.MaxRequests
	}
	key := fmt.Sprintf("user:%d", userID)
	duration := int64(DefaultSubscriptionRateLimit.DurationMinutes * 60)
	return rl.userLimiter.Request(key, maxRequests, duration)
}

// ==================== 账号级 RPM 限流 ====================

// CheckAccountRateLimit 检查订阅账号是否超过 RPM 限制
// rpm <= 0 表示不限制
func (rl *SubscriptionRateLimiter) CheckAccountRateLimit(accountID uint, rpm int) bool {
	if rpm <= 0 {
		return true
	}
	key := fmt.Sprintf("account:%d", accountID)
	return rl.accountLimiter.Request(key, rpm, 60)
}

// ==================== 账号级并发控制 ====================

// AcquireAccountConcurrency 获取账号的并发许可
// maxConcurrent <= 0 表示不限制
// 返回 true 表示获取成功，false 表示并发已满
func (rl *SubscriptionRateLimiter) AcquireAccountConcurrency(accountID uint, maxConcurrent int) bool {
	if maxConcurrent <= 0 {
		return true
	}
	sem := rl.getOrCreateAccountSemaphore(accountID, maxConcurrent)
	select {
	case sem <- struct{}{}:
		return true
	default:
		return false
	}
}

// ReleaseAccountConcurrency 释放账号的并发许可
func (rl *SubscriptionRateLimiter) ReleaseAccountConcurrency(accountID uint, maxConcurrent int) {
	if maxConcurrent <= 0 {
		return
	}
	sem := rl.getOrCreateAccountSemaphore(accountID, maxConcurrent)
	select {
	case <-sem:
	default:
	}
}

func (rl *SubscriptionRateLimiter) getOrCreateAccountSemaphore(accountID uint, maxConcurrent int) chan struct{} {
	key := fmt.Sprintf("account:%d", accountID)
	if val, ok := rl.accountSemaphores.Load(key); ok {
		if ch, ok := val.(chan struct{}); ok {
			return ch
		}
	}
	newCh := make(chan struct{}, maxConcurrent)
	actual, _ := rl.accountSemaphores.LoadOrStore(key, newCh)
	return actual.(chan struct{})
}

// ==================== 平台级并发控制 ====================

// AcquirePlatformConcurrency 获取平台的并发许可
// 返回 true 表示获取成功，false 表示并发已满
func (rl *SubscriptionRateLimiter) AcquirePlatformConcurrency(platform string, maxConcurrent int) bool {
	if maxConcurrent <= 0 {
		maxConcurrent = DefaultPlatformConcurrency[platform]
		if maxConcurrent <= 0 {
			maxConcurrent = 20
		}
	}
	sem := rl.getOrCreatePlatformSemaphore(platform, maxConcurrent)
	select {
	case sem <- struct{}{}:
		return true
	default:
		return false
	}
}

// ReleasePlatformConcurrency 释放平台的并发许可
func (rl *SubscriptionRateLimiter) ReleasePlatformConcurrency(platform string, maxConcurrent int) {
	if maxConcurrent <= 0 {
		maxConcurrent = DefaultPlatformConcurrency[platform]
		if maxConcurrent <= 0 {
			maxConcurrent = 20
		}
	}
	sem := rl.getOrCreatePlatformSemaphore(platform, maxConcurrent)
	select {
	case <-sem:
	default:
	}
}

func (rl *SubscriptionRateLimiter) getOrCreatePlatformSemaphore(platform string, maxConcurrent int) chan struct{} {
	key := fmt.Sprintf("platform:%s", platform)
	if val, ok := rl.platformSemaphores.Load(key); ok {
		if ch, ok := val.(chan struct{}); ok {
			return ch
		}
	}
	newCh := make(chan struct{}, maxConcurrent)
	actual, _ := rl.platformSemaphores.LoadOrStore(key, newCh)
	return actual.(chan struct{})
}

// ==================== 便捷方法 ====================

// CheckAndLimitSubscriptionRequest 综合检查订阅请求是否被允许
// 依次检查: 用户限流 -> 平台并发 -> 账号RPM -> 账号并发
// 返回 HTTP status code 和错误信息，0 表示通过
func CheckAndLimitSubscriptionRequest(userID int, accountID uint, platform string, rpm, maxConcurrent int) (int, string) {
	rl := GetSubscriptionRateLimiter()

	// 1. 用户级限流
	if !rl.CheckUserRateLimit(userID, 0) {
		return http.StatusTooManyRequests, "subscription user rate limit exceeded"
	}

	// 2. 平台级并发
	if !rl.AcquirePlatformConcurrency(platform, 0) {
		return http.StatusTooManyRequests, "subscription platform concurrency limit exceeded"
	}

	// 3. 账号级 RPM
	if !rl.CheckAccountRateLimit(accountID, rpm) {
		rl.ReleasePlatformConcurrency(platform, 0)
		return http.StatusTooManyRequests, "subscription account rate limit exceeded"
	}

	// 4. 账号级并发
	if !rl.AcquireAccountConcurrency(accountID, maxConcurrent) {
		rl.ReleasePlatformConcurrency(platform, 0)
		return http.StatusTooManyRequests, "subscription account concurrency limit exceeded"
	}

	return 0, ""
}

// ReleaseSubscriptionRequestResources 释放订阅请求占用的并发资源
func ReleaseSubscriptionRequestResources(accountID uint, platform string, maxConcurrent int) {
	rl := GetSubscriptionRateLimiter()
	rl.ReleaseAccountConcurrency(accountID, maxConcurrent)
	rl.ReleasePlatformConcurrency(platform, 0)
}
