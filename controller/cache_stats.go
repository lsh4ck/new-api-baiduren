package controller

import (
	"net/http"
	"time"

	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
)

// CacheStats 上游 prompt cache 命中率统计（业界标准 Anthropic/DeepSeek 公式）
//
// 公式：cache_hit_rate = SUM(cache_tokens) / SUM(prompt_tokens)
//
// 字段说明：
//   prompt_tokens — 客户请求的总输入 tokens（已含 cached）
//   cache_tokens  — 上游识别为缓存命中的 tokens
//
// 参考：
//   - Anthropic: cache_read_input_tokens / (cache_read_input_tokens + cache_creation_input_tokens)
//   - DeepSeek:  prompt_cache_hit_tokens / (prompt_cache_hit_tokens + prompt_cache_miss_tokens)
//   - OpenAI:    cached_tokens / prompt_tokens
type cacheStatsResp struct {
	UserID            int     `json:"user_id"`
	Period            string  `json:"period"`
	TotalRequests     int64   `json:"total_requests"`
	TotalPromptTokens int64   `json:"total_prompt_tokens"`
	TotalCachedTokens int64   `json:"total_cached_tokens"`
	CacheHitRate      float64 `json:"cache_hit_rate"`            // 0-1 比例
	IndustryAvg       float64 `json:"industry_average"`          // 业界中位估算
	Methodology       string  `json:"methodology"`
	ReferenceLink     string  `json:"reference_link"`
}

// GetSelfCacheStats GET /api/user/self/cache-stats?days=7
func GetSelfCacheStats(c *gin.Context) {
	userId := c.GetInt("id")
	if userId == 0 {
		c.JSON(http.StatusUnauthorized, gin.H{"success": false, "message": "未登录"})
		return
	}
	days := 7
	if d := c.Query("days"); d != "" {
		if v, err := time.ParseDuration(d + "h"); err == nil && v > 0 {
			days = int(v.Hours() / 24)
		}
	}
	if days < 1 || days > 90 {
		days = 7
	}
	since := time.Now().Add(-time.Duration(days) * 24 * time.Hour).Unix()

	// SUM 聚合查询 — 用 jsonb 操作符提取 other.cache_tokens
	var row struct {
		TotalReq    int64
		TotalPrompt int64
		TotalCached int64
	}
	q := model.DB.Table("logs").
		Where("user_id = ? AND created_at >= ? AND prompt_tokens > 0", userId, since).
		Select(`COUNT(*) AS total_req,
			COALESCE(SUM(prompt_tokens), 0) AS total_prompt,
			COALESCE(SUM(NULLIF((other::jsonb->>'cache_tokens'), '')::bigint), 0) AS total_cached`)
	if err := q.Scan(&row).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "查询失败: " + err.Error()})
		return
	}

	var hitRate float64
	if row.TotalPrompt > 0 {
		hitRate = float64(row.TotalCached) / float64(row.TotalPrompt)
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": cacheStatsResp{
			UserID:            userId,
			Period:            "last_" + itoa(days) + "_days",
			TotalRequests:     row.TotalReq,
			TotalPromptTokens: row.TotalPrompt,
			TotalCachedTokens: row.TotalCached,
			CacheHitRate:      hitRate,
			IndustryAvg:       0.50, // Anthropic 文档建议"理想 > 50%"
			Methodology:       "Industry standard: cache_tokens / prompt_tokens (Anthropic/DeepSeek/OpenAI 通用公式)",
			ReferenceLink:     "https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching",
		},
	})
}

// 局部 helper, 避免 import strconv
func itoa(i int) string {
	if i == 0 {
		return "0"
	}
	neg := false
	if i < 0 {
		neg = true
		i = -i
	}
	var b [20]byte
	idx := len(b)
	for i > 0 {
		idx--
		b[idx] = byte('0' + i%10)
		i /= 10
	}
	if neg {
		idx--
		b[idx] = '-'
	}
	return string(b[idx:])
}
