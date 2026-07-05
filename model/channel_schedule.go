package model

import (
	"time"
)

// ChannelScheduleLog 渠道升降档调度日志
// 记录每次自动/手动调度的决策，包括稳定性指标、目标动作、利润护栏校验结果
type ChannelScheduleLog struct {
	Id          int64  `json:"id" gorm:"primaryKey;autoIncrement"`
	ChannelId   int    `json:"channel_id" gorm:"index;not null"`
	ChannelName string `json:"channel_name" gorm:"type:varchar(128)"`

	// 评估窗口
	WindowStart   int64 `json:"window_start" gorm:"bigint;index"` // 评估起始时间戳
	WindowEnd     int64 `json:"window_end" gorm:"bigint;index"`   // 评估结束时间戳
	WindowDays    int   `json:"window_days"`                      // 窗口天数（通常 3）

	// 稳定性指标
	TotalRequests int     `json:"total_requests"`     // 总请求数
	FailedReqs    int     `json:"failed_reqs"`        // 失败请求数（completion_tokens=0）
	FailureRate   float64 `json:"failure_rate"`       // 失败率 0-1
	AvgUseTime    float64 `json:"avg_use_time"`       // 平均响应时间（秒）
	P95UseTime    int     `json:"p95_use_time"`       // P95 响应时间（秒）
	OverTimeoutN  int     `json:"over_timeout_count"` // 超过 60s 的请求数

	// 调度决策
	Action       string `json:"action" gorm:"type:varchar(32);index"` // up / down / keep / blocked
	FromGroups   string `json:"from_groups" gorm:"type:text"`         // 原分组归属（逗号分隔）
	ToGroups     string `json:"to_groups" gorm:"type:text"`           // 新分组归属（逗号分隔）
	Reason       string `json:"reason" gorm:"type:varchar(512)"`      // 决策理由
	BlockedBy    string `json:"blocked_by" gorm:"type:varchar(128)"`  // 被护栏阻止的原因
	ProfitGuard  bool   `json:"profit_guard_passed"`                  // 利润护栏是否通过

	// 元数据
	CreatedAt   int64 `json:"created_at" gorm:"bigint;index"`
	Automatic   bool  `json:"automatic"` // 自动触发 or 手动触发
}

func (ChannelScheduleLog) TableName() string {
	return "channel_schedule_logs"
}

// NewChannelScheduleLog 创建一条调度日志
func NewChannelScheduleLog(log *ChannelScheduleLog) error {
	if log.CreatedAt == 0 {
		log.CreatedAt = time.Now().Unix()
	}
	return DB.Create(log).Error
}

// GetChannelScheduleLogs 获取调度日志（支持按渠道筛选 + 分页）
func GetChannelScheduleLogs(channelId int, limit int, offset int) ([]ChannelScheduleLog, int64, error) {
	var logs []ChannelScheduleLog
	var total int64

	query := DB.Model(&ChannelScheduleLog{})
	if channelId > 0 {
		query = query.Where("channel_id = ?", channelId)
	}
	query.Count(&total)

	err := query.Order("created_at DESC").
		Limit(limit).Offset(offset).
		Find(&logs).Error
	return logs, total, err
}

// GetChannelLatestScheduleLog 获取某渠道最近一次调度记录
func GetChannelLatestScheduleLog(channelId int) (*ChannelScheduleLog, error) {
	var log ChannelScheduleLog
	err := DB.Where("channel_id = ?", channelId).
		Order("created_at DESC").
		First(&log).Error
	if err != nil {
		return nil, err
	}
	return &log, nil
}
