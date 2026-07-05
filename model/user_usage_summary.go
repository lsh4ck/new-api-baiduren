package model

import (
	"errors"

	"github.com/QuantumNous/new-api/common"
)

// UserModelUsage 单个用户在指定时间窗内某模型的用量聚合
type UserModelUsage struct {
	ModelName    string `json:"model_name"`
	RequestCount int64  `json:"request_count"`
	Quota        int64  `json:"quota"`
	PromptTokens int64  `json:"prompt_tokens"`
	CompTokens   int64  `json:"completion_tokens"`
	TotalTokens  int64  `json:"total_tokens"`
	CacheTokens  int64  `json:"cache_tokens"` // 命中缓存的 token 数（prompt 子集）
}

// UserDailyUsage 单个用户某天的用量聚合
type UserDailyUsage struct {
	DayBucket    int64 `json:"day_bucket"` // unix_ts / 86400, 即天数
	RequestCount int64 `json:"request_count"`
	Quota        int64 `json:"quota"`
	TotalTokens  int64 `json:"total_tokens"`
}

// UserUsageTotals 时间窗内的总和
type UserUsageTotals struct {
	RequestCount int64 `json:"request_count"`
	Quota        int64 `json:"quota"`
	PromptTokens int64 `json:"prompt_tokens"`
	CompTokens   int64 `json:"completion_tokens"`
	TotalTokens  int64 `json:"total_tokens"`
	Topup        int64 `json:"topup"` // 同窗口内充值 quota（log type=1）
}

// GetUserUsageByModel 聚合指定用户在时间窗内按模型分组的用量。
// cache_tokens 在 Other JSON 字段，跨 DB 直接聚合代价高，故 SQL 只算 prompt/comp/quota/count，
// cache 部分由 Go 侧二次扫描 logs.other 累加。扫描上限 cacheScanLimit 行。
func GetUserUsageByModel(userId int, startTs, endTs int64, limit int) ([]UserModelUsage, error) {
	if userId <= 0 {
		return nil, errors.New("invalid user id")
	}
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	var rows []UserModelUsage
	tx := LOG_DB.Table("logs").
		Select("model_name, COUNT(*) AS request_count, COALESCE(SUM(quota),0) AS quota, COALESCE(SUM(prompt_tokens),0) AS prompt_tokens, COALESCE(SUM(completion_tokens),0) AS comp_tokens, COALESCE(SUM(prompt_tokens),0) + COALESCE(SUM(completion_tokens),0) AS total_tokens").
		Where("user_id = ? AND type = ?", userId, LogTypeConsume).
		Group("model_name").
		Order("quota DESC").
		Limit(limit)
	if startTs > 0 {
		tx = tx.Where("created_at >= ?", startTs)
	}
	if endTs > 0 {
		tx = tx.Where("created_at <= ?", endTs)
	}
	if err := tx.Scan(&rows).Error; err != nil {
		common.SysError("failed to aggregate user usage by model: " + err.Error())
		return nil, errors.New("查询模型用量失败")
	}

	// 二次扫描：按用户 + 时间窗扫 logs.other 累加 cache_tokens。
	cacheByModel, err := aggregateUserCacheTokensByModel(userId, startTs, endTs)
	if err == nil {
		for i := range rows {
			if v, ok := cacheByModel[rows[i].ModelName]; ok {
				rows[i].CacheTokens = v
			}
		}
	}
	return rows, nil
}

// cacheScanLimit 二次扫描行数上限。
const cacheScanLimit = 20000

// aggregateUserCacheTokensByModel 拉取 (model_name, other) 行并在 Go 侧聚合 cache_tokens。
func aggregateUserCacheTokensByModel(userId int, startTs, endTs int64) (map[string]int64, error) {
	type row struct {
		ModelName string
		Other     string
	}
	var rows []row
	tx := LOG_DB.Table("logs").
		Select("model_name, other").
		Where("user_id = ? AND type = ?", userId, LogTypeConsume)
	if startTs > 0 {
		tx = tx.Where("created_at >= ?", startTs)
	}
	if endTs > 0 {
		tx = tx.Where("created_at <= ?", endTs)
	}
	if err := tx.Order("id desc").Limit(cacheScanLimit).Scan(&rows).Error; err != nil {
		return nil, err
	}
	result := make(map[string]int64, 32)
	for _, r := range rows {
		if r.Other == "" {
			continue
		}
		m, perr := common.StrToMap(r.Other)
		if perr != nil || m == nil {
			continue
		}
		v, ok := m["cache_tokens"]
		if !ok {
			continue
		}
		switch n := v.(type) {
		case float64:
			result[r.ModelName] += int64(n)
		case int:
			result[r.ModelName] += int64(n)
		case int64:
			result[r.ModelName] += n
		}
	}
	return result, nil
}

// GetUserUsageByDay 聚合指定用户在时间窗内按天分组的用量（用整数天数桶，跨 DB 通用）
func GetUserUsageByDay(userId int, startTs, endTs int64) ([]UserDailyUsage, error) {
	if userId <= 0 {
		return nil, errors.New("invalid user id")
	}
	var rows []UserDailyUsage
	tx := LOG_DB.Table("logs").
		Select("(created_at / 86400) AS day_bucket, COUNT(*) AS request_count, COALESCE(SUM(quota),0) AS quota, COALESCE(SUM(prompt_tokens),0) + COALESCE(SUM(completion_tokens),0) AS total_tokens").
		Where("user_id = ? AND type = ?", userId, LogTypeConsume).
		Group("day_bucket").
		Order("day_bucket ASC")
	if startTs > 0 {
		tx = tx.Where("created_at >= ?", startTs)
	}
	if endTs > 0 {
		tx = tx.Where("created_at <= ?", endTs)
	}
	if err := tx.Scan(&rows).Error; err != nil {
		common.SysError("failed to aggregate user usage by day: " + err.Error())
		return nil, errors.New("查询每日用量失败")
	}
	return rows, nil
}

// GetUserUsageTotals 聚合时间窗内的总用量 + 总充值
func GetUserUsageTotals(userId int, startTs, endTs int64) (UserUsageTotals, error) {
	var totals UserUsageTotals
	if userId <= 0 {
		return totals, errors.New("invalid user id")
	}

	// 消费汇总
	consumeQ := LOG_DB.Table("logs").
		Select("COUNT(*) AS request_count, COALESCE(SUM(quota),0) AS quota, COALESCE(SUM(prompt_tokens),0) AS prompt_tokens, COALESCE(SUM(completion_tokens),0) AS comp_tokens, COALESCE(SUM(prompt_tokens),0) + COALESCE(SUM(completion_tokens),0) AS total_tokens").
		Where("user_id = ? AND type = ?", userId, LogTypeConsume)
	if startTs > 0 {
		consumeQ = consumeQ.Where("created_at >= ?", startTs)
	}
	if endTs > 0 {
		consumeQ = consumeQ.Where("created_at <= ?", endTs)
	}
	if err := consumeQ.Scan(&totals).Error; err != nil {
		common.SysError("failed to query user consume totals: " + err.Error())
		return totals, errors.New("查询消费汇总失败")
	}

	// 充值 quota 汇总（log type=1）
	topupQ := LOG_DB.Table("logs").
		Select("COALESCE(SUM(quota),0) AS topup").
		Where("user_id = ? AND type = ?", userId, LogTypeTopup)
	if startTs > 0 {
		topupQ = topupQ.Where("created_at >= ?", startTs)
	}
	if endTs > 0 {
		topupQ = topupQ.Where("created_at <= ?", endTs)
	}
	var topupRow struct {
		Topup int64 `json:"topup"`
	}
	if err := topupQ.Scan(&topupRow).Error; err != nil {
		common.SysError("failed to query user topup totals: " + err.Error())
		return totals, errors.New("查询充值汇总失败")
	}
	totals.Topup = topupRow.Topup

	return totals, nil
}
