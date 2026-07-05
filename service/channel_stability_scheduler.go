package service

import (
	"fmt"
	"math"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
)

// ChannelStabilityMetric 渠道稳定性实时指标（不入库，实时从 logs 表算）
type ChannelStabilityMetric struct {
	ChannelId      int     `json:"channel_id"`
	ChannelName    string  `json:"channel_name"`
	Status         int     `json:"status"`   // 1启用 2手动停用 3自动禁用
	Priority       int     `json:"priority"`
	Groups         string  `json:"groups"`
	TotalRequests  int     `json:"total_requests"`
	FailedRequests int     `json:"failed_requests"`
	FailureRate    float64 `json:"failure_rate"`
	AvgUseTime     float64 `json:"avg_use_time"`
	P95UseTime     int     `json:"p95_use_time"`
	MaxUseTime     int     `json:"max_use_time"`
	OverTimeoutN   int     `json:"over_timeout_count"`
	WindowDays     int     `json:"window_days"`

	// 主动测试结果（来自 channels 表，渠道测试时写入）
	TestTime     int64 `json:"test_time"`     // 上次主动测试时间戳（0=从未测）
	ResponseTime int   `json:"response_time"` // 上次测试响应耗时(ms)

	// 调度评估结果（如果调度器运行过）
	SuggestedAction string `json:"suggested_action"` // up / down / keep
	Reason          string `json:"reason"`

	// 当前所在三档分组（聚合统计）
	CurrentTier string `json:"current_tier"` // cheap / pool / enterprise / mixed / none

	// 利润护栏：渠道在当前各档下的利润率（用于判断是否允许升降档）
	MinAllowedTier string `json:"min_allowed_tier"` // cheap / pool / enterprise — 不能降到比这个更低
}

// SchedulerConfig 调度规则配置
type SchedulerConfig struct {
	WindowDays       int     // 评估窗口天数（默认 3）
	MinRequestsToJudge int   // 最少请求数才能判断（避免低样本误判，默认 30）
	StableFailureRate float64 // 稳定阈值（失败率 < 这个值，默认 0.05）
	UnstableFailureRate float64 // 不稳定阈值（失败率 > 这个值，默认 0.15）
	MinProfitMargin  float64 // 利润护栏：最低保留利润率（默认 0.30）
}

var DefaultSchedulerConfig = SchedulerConfig{
	WindowDays:          3,
	MinRequestsToJudge:  30,
	StableFailureRate:   0.05,
	UnstableFailureRate: 0.15,
	MinProfitMargin:     0.30,
}

var (
	schedulerOnce sync.Once
	// 调度档次对应的 GroupRatio 范围
	TierGroupRatios = map[string]float64{
		"cheap":      0.5,
		"pool":       0.7,
		"enterprise": 0.9,
	}
)

// 渠道倍率提取正则（从 name 字段提取）
var (
	usdRatioRegex = regexp.MustCompile(`USD\s*([0-9.]+)`)
	rmbRatioRegex = regexp.MustCompile(`·\s*([0-9.]+)x`)
)

// extractChannelRatio 从渠道名称提取上游倍率
// 返回 (类型, 倍率)：类型可以是 "usd" / "rmb" / "free" / "unknown"
func extractChannelRatio(name string) (string, float64) {
	if strings.Contains(name, "免费") || strings.Contains(name, "0x") {
		return "free", 0
	}
	if m := usdRatioRegex.FindStringSubmatch(name); len(m) > 1 {
		var v float64
		_, _ = fmt.Sscanf(m[1], "%f", &v)
		return "usd", v
	}
	if m := rmbRatioRegex.FindStringSubmatch(name); len(m) > 1 {
		var v float64
		_, _ = fmt.Sscanf(m[1], "%f", &v)
		return "rmb", v
	}
	return "unknown", 0
}

// CalcProfitMargin 算渠道在某档分组下的利润率
// USD 渠道: 1 - 0.969 × d / GR
// RMB 渠道: 1 - R / (GR × 7)
// 免费渠道: 1.0
// 未知: 返回 NaN
func CalcProfitMargin(ratioType string, ratio float64, GR float64) float64 {
	switch ratioType {
	case "free":
		return 1.0
	case "usd":
		return 1 - 0.969*ratio/GR
	case "rmb":
		return 1 - ratio/(GR*7)
	}
	return math.NaN()
}

// GetMinAllowedTier 算渠道能放进的最低档次（保证 ≥30% 利润）
func GetMinAllowedTier(ratioType string, ratio float64, minMargin float64) string {
	for _, tier := range []string{"cheap", "pool", "enterprise"} {
		gr := TierGroupRatios[tier]
		m := CalcProfitMargin(ratioType, ratio, gr)
		if !math.IsNaN(m) && m >= minMargin {
			return tier
		}
	}
	return "enterprise" // 默认企业组
}

// detectChannelTier 检测渠道当前所在的主要档次
func detectChannelTier(groups string) string {
	hasCheap := strings.Contains(groups, "-cheap") || strings.Contains(groups, "特价组")
	hasPool := strings.Contains(groups, "-pool") || strings.Contains(groups, "号池")
	hasEnt := strings.Contains(groups, "-enterprise") || strings.Contains(groups, "企业组")

	count := 0
	if hasCheap {
		count++
	}
	if hasPool {
		count++
	}
	if hasEnt {
		count++
	}
	if count > 1 {
		return "mixed"
	}
	if hasEnt {
		return "enterprise"
	}
	if hasPool {
		return "pool"
	}
	if hasCheap {
		return "cheap"
	}
	return "none"
}

// CollectChannelStability 实时收集所有启用渠道的稳定性指标
func CollectChannelStability(windowDays int) ([]ChannelStabilityMetric, error) {
	if windowDays <= 0 {
		windowDays = DefaultSchedulerConfig.WindowDays
	}

	// 1. 拉取所有渠道
	channels, err := model.GetAllChannels(0, 0, true, false)
	if err != nil {
		return nil, fmt.Errorf("get channels failed: %w", err)
	}

	cutoff := time.Now().Add(-time.Duration(windowDays) * 24 * time.Hour).Unix()

	results := make([]ChannelStabilityMetric, 0, len(channels))
	for _, ch := range channels {
		metric := ChannelStabilityMetric{
			ChannelId:   ch.Id,
			ChannelName: ch.Name,
			Status:      ch.Status,
			Priority:    int(ch.GetPriority()),
			Groups:       ch.Group,
			WindowDays:   windowDays,
			TestTime:     ch.TestTime,
			ResponseTime: ch.ResponseTime,
		}

		// 2. 从 logs 表查指标
		type aggRow struct {
			Total      int
			Fails      int
			AvgTime    float64
			MaxTime    int
			OverTimeoutN int
		}
		var agg aggRow
		err := model.LOG_DB.Table("logs").
			Select(`COUNT(*) AS total,
				SUM(CASE WHEN completion_tokens = 0 THEN 1 ELSE 0 END) AS fails,
				COALESCE(AVG(use_time), 0) AS avg_time,
				COALESCE(MAX(use_time), 0) AS max_time,
				SUM(CASE WHEN use_time > 60 THEN 1 ELSE 0 END) AS over_timeout_n`).
			Where("channel_id = ? AND created_at > ?", ch.Id, cutoff).
			Scan(&agg).Error
		if err != nil {
			common.SysError(fmt.Sprintf("collect stability for channel %d failed: %v", ch.Id, err))
			continue
		}

		metric.TotalRequests = agg.Total
		metric.FailedRequests = agg.Fails
		metric.AvgUseTime = agg.AvgTime
		metric.MaxUseTime = agg.MaxTime
		metric.OverTimeoutN = agg.OverTimeoutN
		if agg.Total > 0 {
			metric.FailureRate = float64(agg.Fails) / float64(agg.Total)
		}

		// P95 use_time（单独查）
		var useTimes []int
		_ = model.LOG_DB.Table("logs").
			Select("use_time").
			Where("channel_id = ? AND created_at > ?", ch.Id, cutoff).
			Order("use_time DESC").
			Limit(100).
			Pluck("use_time", &useTimes).Error
		if len(useTimes) > 0 {
			sort.Ints(useTimes)
			p95Idx := int(float64(len(useTimes)) * 0.95)
			if p95Idx >= len(useTimes) {
				p95Idx = len(useTimes) - 1
			}
			metric.P95UseTime = useTimes[p95Idx]
		}

		// 3. 检测当前档次 + 利润护栏
		metric.CurrentTier = detectChannelTier(ch.Group)
		ratioType, ratio := extractChannelRatio(ch.Name)
		metric.MinAllowedTier = GetMinAllowedTier(ratioType, ratio, DefaultSchedulerConfig.MinProfitMargin)

		// 4. 调度建议
		metric.SuggestedAction, metric.Reason = evaluateScheduleAction(metric)

		results = append(results, metric)
	}
	return results, nil
}

// evaluateScheduleAction 根据稳定性指标 + 利润护栏给出调度建议
func evaluateScheduleAction(m ChannelStabilityMetric) (string, string) {
	if m.TotalRequests < DefaultSchedulerConfig.MinRequestsToJudge {
		return "keep", fmt.Sprintf("样本不足 (req=%d < %d)，保持现状", m.TotalRequests, DefaultSchedulerConfig.MinRequestsToJudge)
	}

	if m.FailureRate < DefaultSchedulerConfig.StableFailureRate {
		// 表现稳定 → 升档
		switch m.CurrentTier {
		case "cheap":
			return "up", fmt.Sprintf("稳定 (失败率 %.1f%% < %.0f%%)，建议升 pool", m.FailureRate*100, DefaultSchedulerConfig.StableFailureRate*100)
		case "pool":
			// 升 enterprise 需护栏校验
			if m.MinAllowedTier == "enterprise" {
				return "up", fmt.Sprintf("稳定且利润允许，建议升 enterprise")
			}
			return "keep", fmt.Sprintf("稳定但护栏阻止升 enterprise (min=%s)", m.MinAllowedTier)
		case "enterprise":
			return "keep", fmt.Sprintf("稳定，已在最高档")
		}
		return "keep", "稳定但当前未归入三档"
	}

	if m.FailureRate > DefaultSchedulerConfig.UnstableFailureRate {
		// 不稳定 → 降档
		switch m.CurrentTier {
		case "enterprise":
			// 降 pool 需护栏校验
			if isAllowedDown(m.MinAllowedTier, "pool") {
				return "down", fmt.Sprintf("不稳定 (失败率 %.1f%% > %.0f%%)，建议降 pool", m.FailureRate*100, DefaultSchedulerConfig.UnstableFailureRate*100)
			}
			return "blocked", fmt.Sprintf("不稳定但护栏阻止降档 (该渠道最低允许 %s)", m.MinAllowedTier)
		case "pool":
			if isAllowedDown(m.MinAllowedTier, "cheap") {
				return "down", fmt.Sprintf("不稳定，建议降 cheap")
			}
			return "blocked", fmt.Sprintf("不稳定但护栏阻止降 cheap (该渠道最低允许 %s，降会亏损)", m.MinAllowedTier)
		case "cheap":
			return "keep", "已在最低档，建议手动停用或调查上游"
		}
		return "keep", "不稳定但当前未归入三档"
	}

	return "keep", fmt.Sprintf("中间状态 (失败率 %.1f%%)，保持观察", m.FailureRate*100)
}

// isAllowedDown 检查目标档次是否被护栏允许
func isAllowedDown(minAllowed string, target string) bool {
	tierOrder := map[string]int{"cheap": 0, "pool": 1, "enterprise": 2}
	return tierOrder[target] >= tierOrder[minAllowed]
}

// RunScheduleEvaluation 跑一次完整调度评估（写入日志，但不自动执行 SQL）
// 自动执行需要用户配置 enabled，默认只记录建议供 admin 决策
func RunScheduleEvaluation(automatic bool) (int, error) {
	metrics, err := CollectChannelStability(DefaultSchedulerConfig.WindowDays)
	if err != nil {
		return 0, err
	}

	count := 0
	for _, m := range metrics {
		// 仅有动作建议时记录（keep 跳过减少噪音）
		if m.SuggestedAction == "keep" {
			continue
		}

		// 写日志
		log := &model.ChannelScheduleLog{
			ChannelId:     m.ChannelId,
			ChannelName:   m.ChannelName,
			WindowStart:   time.Now().Add(-time.Duration(m.WindowDays) * 24 * time.Hour).Unix(),
			WindowEnd:     time.Now().Unix(),
			WindowDays:    m.WindowDays,
			TotalRequests: m.TotalRequests,
			FailedReqs:    m.FailedRequests,
			FailureRate:   m.FailureRate,
			AvgUseTime:    m.AvgUseTime,
			P95UseTime:    m.P95UseTime,
			OverTimeoutN:  m.OverTimeoutN,
			Action:        m.SuggestedAction,
			FromGroups:    m.Groups,
			ToGroups:      "", // 实际生效需要 admin 手动确认
			Reason:        m.Reason,
			ProfitGuard:   m.SuggestedAction != "blocked",
			Automatic:     automatic,
		}
		if m.SuggestedAction == "blocked" {
			log.BlockedBy = "profit_floor_guard"
		}

		if err := model.NewChannelScheduleLog(log); err != nil {
			common.SysError(fmt.Sprintf("save schedule log for channel %d failed: %v", m.ChannelId, err))
			continue
		}
		count++
	}
	return count, nil
}

// StartChannelStabilitySchedulerTask 启动渠道稳定性调度任务（每 3 天评估一次）
func StartChannelStabilitySchedulerTask() {
	if !common.IsMasterNode {
		return
	}
	schedulerOnce.Do(func() {
		go func() {
			// 启动 10 分钟后跑首次（用于验证）
			time.Sleep(10 * time.Minute)
			n, err := RunScheduleEvaluation(true)
			if err != nil {
				common.SysError(fmt.Sprintf("first schedule eval failed: %v", err))
			} else {
				common.SysLog(fmt.Sprintf("channel stability scheduler: evaluated %d actions", n))
			}

			ticker := time.NewTicker(3 * 24 * time.Hour)
			defer ticker.Stop()
			for range ticker.C {
				n, err := RunScheduleEvaluation(true)
				if err != nil {
					common.SysError(fmt.Sprintf("schedule eval failed: %v", err))
				} else {
					common.SysLog(fmt.Sprintf("channel stability scheduler: evaluated %d actions", n))
				}
			}
		}()
	})
}

// ratio_setting 兜底引用（防止未引用编译错误）
var _ = ratio_setting.GetGroupRatio
