package controller

import (
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"

	"github.com/gin-gonic/gin"
)

// GetChannelStabilityList 获取所有渠道当前稳定性指标 + 调度建议
// Query: window_days (默认 3)
func GetChannelStabilityList(c *gin.Context) {
	windowDays, _ := strconv.Atoi(c.DefaultQuery("window_days", "3"))
	if windowDays <= 0 || windowDays > 30 {
		windowDays = 3
	}

	metrics, err := service.CollectChannelStability(windowDays)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    metrics,
	})
}

// GetChannelStabilityHistory 单渠道 30 天按日趋势
// 路径: /:id 查询: days (默认 30)
func GetChannelStabilityHistory(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "invalid channel id",
		})
		return
	}
	days, _ := strconv.Atoi(c.DefaultQuery("days", "30"))
	if days <= 0 || days > 90 {
		days = 30
	}

	cutoff := time.Now().Add(-time.Duration(days) * 24 * time.Hour).Unix()

	// 实时从 logs 表按日聚合
	type dailyMetric struct {
		Day            string  `json:"day"`
		TotalRequests  int     `json:"total_requests"`
		FailedRequests int     `json:"failed_requests"`
		FailureRate    float64 `json:"failure_rate"`
		AvgUseTime     float64 `json:"avg_use_time"`
		MaxUseTime     int     `json:"max_use_time"`
	}

	var daily []dailyMetric

	// 用 to_timestamp 把 unix int 转为日期；不同 DB 差异较大，分支处理
	if isPostgreSQL() {
		err = model.LOG_DB.Raw(`
			SELECT
				TO_CHAR(TO_TIMESTAMP(created_at), 'YYYY-MM-DD') AS day,
				COUNT(*) AS total_requests,
				SUM(CASE WHEN completion_tokens = 0 THEN 1 ELSE 0 END) AS failed_requests,
				CASE WHEN COUNT(*) > 0 THEN SUM(CASE WHEN completion_tokens = 0 THEN 1 ELSE 0 END)::float / COUNT(*) ELSE 0 END AS failure_rate,
				COALESCE(AVG(use_time), 0) AS avg_use_time,
				COALESCE(MAX(use_time), 0) AS max_use_time
			FROM logs
			WHERE channel_id = ? AND created_at > ?
			GROUP BY day
			ORDER BY day ASC
		`, id, cutoff).Scan(&daily).Error
	} else if isMySQL() {
		err = model.LOG_DB.Raw(`
			SELECT
				FROM_UNIXTIME(created_at, '%Y-%m-%d') AS day,
				COUNT(*) AS total_requests,
				SUM(CASE WHEN completion_tokens = 0 THEN 1 ELSE 0 END) AS failed_requests,
				CASE WHEN COUNT(*) > 0 THEN SUM(CASE WHEN completion_tokens = 0 THEN 1 ELSE 0 END) / COUNT(*) ELSE 0 END AS failure_rate,
				COALESCE(AVG(use_time), 0) AS avg_use_time,
				COALESCE(MAX(use_time), 0) AS max_use_time
			FROM logs
			WHERE channel_id = ? AND created_at > ?
			GROUP BY day
			ORDER BY day ASC
		`, id, cutoff).Scan(&daily).Error
	} else {
		// SQLite
		err = model.LOG_DB.Raw(`
			SELECT
				strftime('%Y-%m-%d', datetime(created_at, 'unixepoch')) AS day,
				COUNT(*) AS total_requests,
				SUM(CASE WHEN completion_tokens = 0 THEN 1 ELSE 0 END) AS failed_requests,
				CASE WHEN COUNT(*) > 0 THEN CAST(SUM(CASE WHEN completion_tokens = 0 THEN 1 ELSE 0 END) AS REAL) / COUNT(*) ELSE 0 END AS failure_rate,
				COALESCE(AVG(use_time), 0) AS avg_use_time,
				COALESCE(MAX(use_time), 0) AS max_use_time
			FROM logs
			WHERE channel_id = ? AND created_at > ?
			GROUP BY day
			ORDER BY day ASC
		`, id, cutoff).Scan(&daily).Error
	}

	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": fmt.Sprintf("query daily history failed: %v", err),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data": gin.H{
			"channel_id": id,
			"days":       days,
			"history":    daily,
		},
	})
}

// GetChannelScheduleLogs 获取调度日志列表（admin 后台用）
// Query: channel_id (可选), page, size
func GetChannelScheduleLogs(c *gin.Context) {
	channelId, _ := strconv.Atoi(c.DefaultQuery("channel_id", "0"))
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	size, _ := strconv.Atoi(c.DefaultQuery("size", "50"))
	if page <= 0 {
		page = 1
	}
	if size <= 0 || size > 200 {
		size = 50
	}

	logs, total, err := model.GetChannelScheduleLogs(channelId, size, (page-1)*size)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data": gin.H{
			"items": logs,
			"total": total,
			"page":  page,
			"size":  size,
		},
	})
}

// RunChannelScheduleEvaluation 手动触发调度评估
func RunChannelScheduleEvaluation(c *gin.Context) {
	n, err := service.RunScheduleEvaluation(false)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": fmt.Sprintf("evaluated %d action(s)", n),
		"data": gin.H{
			"action_count": n,
		},
	})
}

// 内部工具
func isPostgreSQL() bool { return common.UsingPostgreSQL }
func isMySQL() bool      { return common.UsingMySQL }
