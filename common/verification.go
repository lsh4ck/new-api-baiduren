package common

import (
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
)

type verificationValue struct {
	code string
	time time.Time
}

const (
	EmailVerificationPurpose = "v"
	PasswordResetPurpose     = "r"
)

var verificationMutex sync.Mutex
var verificationMap map[string]verificationValue
var verificationMapMaxSize = 1000      // 之前 10 太小，多用户场景旧码可能被淘汰
var VerificationValidMinutes = 30      // 之前 10 分钟，outlook 等慢邮箱常延迟到货后已过期，改为 30 分钟
const verificationRedisKeyPrefix = "verify:" // Redis 中前缀，重启不丢
const verificationCooldownSeconds = 60       // 同一邮箱 60s 内只能发 1 次码，防连点把旧邮件码覆盖

// IsVerificationOnCooldown 返回 true 表示该 email 在 60 秒冷却期内，应拒绝再次发码
// 同时（如果不在冷却期）把当前时间标记进 Redis，TTL=60s
func IsVerificationOnCooldown(key string, purpose string) bool {
	if !RedisEnabled {
		return false // Redis 不可用时不强制冷却（避免 Redis 故障时阻塞所有发码）
	}
	cooldownKey := verificationRedisKeyPrefix + "cd:" + purpose + ":" + key
	if v, err := RedisGet(cooldownKey); err == nil && v != "" {
		return true // 冷却期内
	}
	_ = RedisSet(cooldownKey, "1", time.Duration(verificationCooldownSeconds)*time.Second)
	return false
}

func GenerateVerificationCode(length int) string {
	code := uuid.New().String()
	code = strings.Replace(code, "-", "", -1)
	if length == 0 {
		return code
	}
	return code[:length]
}

// RegisterVerificationCodeWithKey 双写：Redis（持久，重启不丢）+ 内存 map（fallback）
func RegisterVerificationCodeWithKey(key string, code string, purpose string) {
	// Redis 优先（持久化，跨重启）
	if RedisEnabled {
		redisKey := verificationRedisKeyPrefix + purpose + ":" + key
		_ = RedisSet(redisKey, code, time.Duration(VerificationValidMinutes)*time.Minute)
	}
	// 内存 map 保底（Redis 挂了仍可用）
	verificationMutex.Lock()
	defer verificationMutex.Unlock()
	verificationMap[purpose+key] = verificationValue{
		code: code,
		time: time.Now(),
	}
	if len(verificationMap) > verificationMapMaxSize {
		removeExpiredPairs()
	}
}

// VerifyCodeWithKey 优先查 Redis（重启后仍能验），fallback 到内存
func VerifyCodeWithKey(key string, code string, purpose string) bool {
	if RedisEnabled {
		redisKey := verificationRedisKeyPrefix + purpose + ":" + key
		if stored, err := RedisGet(redisKey); err == nil && stored != "" {
			return code == stored
		}
	}
	verificationMutex.Lock()
	defer verificationMutex.Unlock()
	value, okay := verificationMap[purpose+key]
	now := time.Now()
	if !okay || int(now.Sub(value.time).Seconds()) >= VerificationValidMinutes*60 {
		return false
	}
	return code == value.code
}

func DeleteKey(key string, purpose string) {
	if RedisEnabled {
		_ = RedisDel(verificationRedisKeyPrefix + purpose + ":" + key)
	}
	verificationMutex.Lock()
	defer verificationMutex.Unlock()
	delete(verificationMap, purpose+key)
}

// no lock inside, so the caller must lock the verificationMap before calling!
func removeExpiredPairs() {
	now := time.Now()
	for key := range verificationMap {
		if int(now.Sub(verificationMap[key].time).Seconds()) >= VerificationValidMinutes*60 {
			delete(verificationMap, key)
		}
	}
}

func init() {
	verificationMutex.Lock()
	defer verificationMutex.Unlock()
	verificationMap = make(map[string]verificationValue)
}
