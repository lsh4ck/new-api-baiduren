package controller

import (
	"net/http"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
)

// channelHealthRow 单个渠道近 24h 的健康度聚合
type channelHealthRow struct {
	ChannelID     int     `json:"channel_id"`
	Name          string  `json:"name"`
	Type          int     `json:"type"`
	Group         string  `json:"group"`
	Status        int     `json:"status"`
	Priority      int     `json:"priority"`
	Successes     int64   `json:"successes"`
	Errors        int64   `json:"errors"`
	Total         int64   `json:"total"`
	ErrorRate     float64 `json:"error_rate"` // 0~1
	LastSuccessAt int64   `json:"last_success_at"`
	LastErrorAt   int64   `json:"last_error_at"`
	HealthLevel   string  `json:"health_level"` // healthy / warning / critical / disabled / silent
}

// rowCount logs 聚合行 (LOG_DB 查询用)
type rowCount struct {
	ChannelID   int   `gorm:"column:channel_id"`
	Successes   int64 `gorm:"column:successes"`
	Errors      int64 `gorm:"column:errors"`
	LastSuccess int64 `gorm:"column:last_success"`
	LastError   int64 `gorm:"column:last_error"`
}

// GetChannelHealth GET /api/channel/health
// 返回所有渠道近 24h 健康度聚合 — 给 admin 面板用
func GetChannelHealth(c *gin.Context) {
	now := time.Now().Unix()
	cutoff := now - 24*3600

	// 1. 拉所有渠道元数据
	var channels []model.Channel
	if err := model.DB.
		Select("id, name, type, status, priority, created_time, \"group\"").
		Order("priority desc, id asc").
		Find(&channels).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "failed to list channels: " + err.Error(),
		})
		return
	}

	// 2. 聚合 logs (近 24h)
	var rows []rowCount
	if err := model.LOG_DB.Table("logs").
		Select("channel_id, "+
			"SUM(CASE WHEN type = 2 THEN 1 ELSE 0 END) AS successes, "+
			"SUM(CASE WHEN type = 5 THEN 1 ELSE 0 END) AS errors, "+
			"MAX(CASE WHEN type = 2 THEN created_at ELSE 0 END) AS last_success, "+
			"MAX(CASE WHEN type = 5 THEN created_at ELSE 0 END) AS last_error").
		Where("created_at >= ? AND type IN (2, 5) AND channel_id > 0", cutoff).
		Group("channel_id").
		Find(&rows).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "failed to aggregate logs: " + err.Error(),
		})
		return
	}
	statsByID := make(map[int]rowCount)
	for _, r := range rows {
		statsByID[r.ChannelID] = r
	}

	// 3. 组合输出
	out := make([]channelHealthRow, 0, len(channels))
	var (
		totalCh        = 0
		healthyCh      = 0
		warningCh      = 0
		criticalCh     = 0
		disabledCh     = 0
		silentCh       = 0
		totalSuccesses int64
		totalErrors    int64
	)
	for _, ch := range channels {
		stat := statsByID[ch.Id]
		total := stat.Successes + stat.Errors
		var errRate float64
		if total > 0 {
			errRate = float64(stat.Errors) / float64(total)
		}

		level := "healthy"
		switch {
		case ch.Status == common.ChannelStatusAutoDisabled || ch.Status == common.ChannelStatusManuallyDisabled:
			level = "disabled"
			disabledCh++
		case total == 0 && ch.Status == common.ChannelStatusEnabled:
			level = "silent"
			silentCh++
		case errRate >= 0.50 && total >= 10:
			level = "critical"
			criticalCh++
		case errRate >= 0.20 && total >= 10:
			level = "warning"
			warningCh++
		default:
			healthyCh++
		}
		totalCh++
		totalSuccesses += stat.Successes
		totalErrors += stat.Errors

		out = append(out, channelHealthRow{
			ChannelID:     ch.Id,
			Name:          ch.Name,
			Type:          ch.Type,
			Group:         ch.Group,
			Status:        ch.Status,
			Priority:      int(ch.GetPriority()),
			Successes:     stat.Successes,
			Errors:        stat.Errors,
			Total:         total,
			ErrorRate:     errRate,
			LastSuccessAt: stat.LastSuccess,
			LastErrorAt:   stat.LastError,
			HealthLevel:   level,
		})
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"rows":        out,
			"window_secs": 24 * 3600,
			"summary": gin.H{
				"total_channels":  totalCh,
				"healthy":         healthyCh,
				"warning":         warningCh,
				"critical":        criticalCh,
				"disabled":        disabledCh,
				"silent":          silentCh,
				"total_successes": totalSuccesses,
				"total_errors":    totalErrors,
				"global_error_rate": func() float64 {
					sum := totalSuccesses + totalErrors
					if sum == 0 {
						return 0
					}
					return float64(totalErrors) / float64(sum)
				}(),
			},
		},
	})
}
