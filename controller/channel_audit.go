package controller

import (
	"net/http"

	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
)

type auditResultRow struct {
	ID                 int64   `json:"id"`
	ChannelID          int     `json:"channel_id"`
	ChannelName        string  `json:"channel_name"`
	Model              string  `json:"model"`
	AuditedAt          int64   `json:"audited_at"`
	PromptTokens       int     `json:"prompt_tokens"`
	CompletionTokens   int     `json:"completion_tokens"`
	MaxOutputRequested int     `json:"max_output_requested"`
	MaxOutputActual    int     `json:"max_output_actual"`
	TTFBms             int     `json:"ttfb_ms"`
	TotalMs            int     `json:"total_ms"`
	TokensPerSec       float64 `json:"tokens_per_sec"`
	TrialCount         int     `json:"trial_count"`
	TotalMsStdev       int     `json:"total_ms_stdev"`
	TotalMsP95         int     `json:"total_ms_p95"`
	PurityStatus       string  `json:"purity_status"`
	PurityScore        float64 `json:"purity_score"`
	PurityReason       string  `json:"purity_reason"`
	HTTPStatus         int     `json:"http_status"`
	ErrorMessage       string  `json:"error_message"`
	ResponseSample     string  `json:"response_sample"`
}

// GetChannelAuditLatest 拉每个 channel 最新的一次审计（按 channel × model 维度）
// GET /api/admin/channel-audit/latest
func GetChannelAuditLatest(c *gin.Context) {
	var rows []auditResultRow
	sql := `
		SELECT DISTINCT ON (channel_id, model)
			id, channel_id, channel_name, model, audited_at,
			prompt_tokens, completion_tokens, max_output_requested, max_output_actual,
			ttfb_ms, total_ms, tokens_per_sec,
			trial_count, total_ms_stdev, total_ms_p95,
			purity_status, purity_score, purity_reason,
			http_status, error_message, response_sample
		FROM channel_audit_results
		ORDER BY channel_id, model, audited_at DESC
	`
	if err := model.DB.Raw(sql).Scan(&rows).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": rows})
}

// GetChannelAuditHistory 看某个 channel + model 的历史审计
// GET /api/admin/channel-audit/history?channel_id=X&model=Y
func GetChannelAuditHistory(c *gin.Context) {
	channelID := c.Query("channel_id")
	modelName := c.Query("model")
	var rows []auditResultRow
	q := model.DB.Table("channel_audit_results")
	if channelID != "" {
		q = q.Where("channel_id = ?", channelID)
	}
	if modelName != "" {
		q = q.Where("model = ?", modelName)
	}
	if err := q.Order("audited_at DESC").Limit(50).Scan(&rows).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": rows})
}

// TriggerChannelAudit 手动触发一次审计（管理员用）
// POST /api/admin/channel-audit/run
func TriggerChannelAudit(c *gin.Context) {
	go func() {
		_ = service.RunChannelPurityAudit()
	}()
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "已触发审计任务，预计 5–10 分钟完成。完成后刷新查看结果"})
}
