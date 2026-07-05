package controller

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/operation_setting"

	"github.com/gin-gonic/gin"
)

// ───────── 漫剧成片渲染：网关 → 独立渲染机(render-worker) ─────────
// 流程：客户 POST /api/render（逐镜成片 url + 后处理选项）→ 网关转发渲染机 → 轮询
// GET /api/render/:id → 完成时按成片时长 + 后处理项一次性计费 → 成片走网关代理脱敏。

type renderShotReq struct {
	URL       string `json:"url"`
	Narration string `json:"narration"`
}

type renderSubmitReq struct {
	Shots     []renderShotReq `json:"shots"`
	DedupMode string          `json:"dedup_mode"`
	Dub       bool            `json:"dub"`
	Voice     string          `json:"voice"`
	Subtitle  bool            `json:"subtitle"`
	Speed     float64         `json:"speed"`
	Variant   int             `json:"variant"` // 批量去重变体号
	Width     int             `json:"width"`
	Height    int             `json:"height"`
}

// 渲染机响应
type renderWorkerSubmitResp struct {
	JobID  string `json:"job_id"`
	Status string `json:"status"`
}

type renderWorkerBillable struct {
	VideoSec float64 `json:"video_sec"`
	Dub      bool    `json:"dub"`
	Subtitle bool    `json:"subtitle"`
	Concat   bool    `json:"concat"`
}

type renderWorkerResult struct {
	OutputURL string               `json:"output_url"`
	Duration  float64              `json:"duration"`
	Billable  renderWorkerBillable `json:"billable"`
}

type renderWorkerStatusResp struct {
	ID       string              `json:"id"`
	Status   string              `json:"status"` // queued/running/done/failed
	Progress int                 `json:"progress"`
	Stage    string              `json:"stage"`
	Result   *renderWorkerResult `json:"result"`
	Error    string              `json:"error"`
}

func renderError(c *gin.Context, code int, msg string) {
	c.JSON(code, gin.H{"error": gin.H{"message": msg, "type": "render_error"}})
}

func renderHTTPClient() *http.Client {
	return &http.Client{Timeout: 30 * time.Second}
}

// cnyToQuota 把人民币费率折算成 quota（与平台计费口径一致）。
func cnyToQuota(cny float64) int {
	rate := operation_setting.USDExchangeRate
	if rate <= 0 {
		rate = 7.3
	}
	return int(cny / rate * common.QuotaPerUnit)
}

// RenderSubmit POST /api/render —— 提交成片任务。
func RenderSubmit(c *gin.Context) {
	rs := operation_setting.GetRenderSetting()
	if !rs.Enabled || rs.WorkerURL == "" {
		renderError(c, http.StatusServiceUnavailable, "成片渲染服务未启用")
		return
	}
	userId := c.GetInt("id")
	if quota, err := model.GetUserQuota(userId, false); err == nil && quota <= 0 {
		renderError(c, http.StatusForbidden, "额度不足，请先充值")
		return
	}

	var req renderSubmitReq
	if err := common.DecodeJson(c.Request.Body, &req); err != nil {
		renderError(c, http.StatusBadRequest, "请求体解析失败")
		return
	}
	if len(req.Shots) == 0 {
		renderError(c, http.StatusBadRequest, "shots 不能为空")
		return
	}
	if req.Speed <= 0 {
		req.Speed = 1.0 // 防御:speed=0(客户端未传)会导致渲染机 setpts 除零
	}

	payload := map[string]interface{}{
		"shots":      req.Shots,
		"dedup_mode": req.DedupMode,
		"dub":        req.Dub,
		"voice":      req.Voice,
		"subtitle":   req.Subtitle,
		"speed":      req.Speed,
		"variant":    req.Variant,
		"width":      req.Width,
		"height":     req.Height,
	}
	body, _ := common.Marshal(payload)
	wreq, err := http.NewRequest(http.MethodPost, rs.WorkerURL+"/api/render", bytes.NewReader(body))
	if err != nil {
		renderError(c, http.StatusInternalServerError, "构造渲染请求失败")
		return
	}
	wreq.Header.Set("Content-Type", "application/json")
	wreq.Header.Set("X-Render-Token", rs.WorkerToken)
	resp, err := renderHTTPClient().Do(wreq)
	if err != nil {
		logger.LogError(c.Request.Context(), "render worker submit failed: "+err.Error())
		renderError(c, http.StatusBadGateway, "渲染服务暂时不可用")
		return
	}
	defer resp.Body.Close()
	rb, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		logger.LogError(c.Request.Context(), fmt.Sprintf("render worker submit status=%d body=%s", resp.StatusCode, string(rb)))
		renderError(c, http.StatusBadGateway, "渲染服务返回异常")
		return
	}
	var sr renderWorkerSubmitResp
	if err := common.Unmarshal(rb, &sr); err != nil || sr.JobID == "" {
		renderError(c, http.StatusBadGateway, "渲染服务响应解析失败")
		return
	}

	now := time.Now().Unix()
	job := &model.RenderJob{
		UserId:      userId,
		TokenId:     c.GetInt("token_id"),
		WorkerJobId: sr.JobID,
		Status:      "queued",
		Dub:         req.Dub,
		Subtitle:    req.Subtitle,
		CreatedTime: now,
		UpdatedTime: now,
	}
	if err := job.Insert(); err != nil {
		logger.LogError(c.Request.Context(), "render job insert failed: "+err.Error())
		renderError(c, http.StatusInternalServerError, "任务记录失败")
		return
	}
	c.JSON(http.StatusOK, gin.H{"job_id": sr.JobID, "status": "queued"})
}

// RenderStatus GET /api/render/:id —— 轮询；完成时结算并返回脱敏成片地址。
func RenderStatus(c *gin.Context) {
	rs := operation_setting.GetRenderSetting()
	userId := c.GetInt("id")
	jobId := c.Param("id")
	job, err := model.GetRenderJob(userId, jobId)
	if err != nil {
		renderError(c, http.StatusInternalServerError, "查询任务失败")
		return
	}
	if job == nil {
		renderError(c, http.StatusNotFound, "任务不存在")
		return
	}

	// 已终态：直接返回缓存结果（计费只发生一次）
	if job.Status != "done" && job.Status != "failed" {
		ws, perr := pollRenderWorker(c.Request.Context(), rs, jobId)
		if perr == nil && ws != nil {
			job.Progress = ws.Progress
			job.Stage = ws.Stage
			switch ws.Status {
			case "done":
				settleRenderJob(c, job, ws)
			case "failed":
				job.Status = "failed"
				job.FailReason = ws.Error
			default:
				job.Status = ws.Status
			}
			job.UpdatedTime = time.Now().Unix()
			_ = job.Update()
		}
	}

	out := ""
	if job.Status == "done" {
		out = rs.PublicBase + "/api/render/" + jobId + "/content"
	}
	c.JSON(http.StatusOK, gin.H{
		"id": jobId, "status": job.Status, "progress": job.Progress, "stage": job.Stage,
		"duration": job.DurationSec, "quota": job.Quota, "output_url": out, "fail_reason": job.FailReason,
	})
}

func pollRenderWorker(ctx context.Context, rs *operation_setting.RenderSetting, jobId string) (*renderWorkerStatusResp, error) {
	wreq, err := http.NewRequestWithContext(ctx, http.MethodGet, rs.WorkerURL+"/api/render/"+jobId, nil)
	if err != nil {
		return nil, err
	}
	wreq.Header.Set("X-Render-Token", rs.WorkerToken)
	resp, err := renderHTTPClient().Do(wreq)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	rb, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("worker status=%d", resp.StatusCode)
	}
	var ws renderWorkerStatusResp
	if err := common.Unmarshal(rb, &ws); err != nil {
		return nil, err
	}
	return &ws, nil
}

// settleRenderJob 任务完成时一次性结算（幂等：已结算不重复扣）。
func settleRenderJob(c *gin.Context, job *model.RenderJob, ws *renderWorkerStatusResp) {
	job.Status = "done"
	if ws.Result == nil {
		return
	}
	job.DurationSec = ws.Result.Duration
	if ws.Result.OutputURL != "" {
		job.OutputURL = ws.Result.OutputURL
	}
	if job.Billed {
		return
	}
	rs := operation_setting.GetRenderSetting()
	b := ws.Result.Billable
	cny := ws.Result.Duration * rs.PricePerSecCNY
	if b.Dub {
		cny += rs.PriceDubCNY
	}
	if b.Subtitle {
		cny += rs.PriceSubtitleCNY
	}
	if b.Concat {
		cny += rs.PriceConcatCNY
	}
	quota := cnyToQuota(cny)
	if quota < 0 {
		quota = 0
	}
	job.Quota = quota
	job.Billed = true

	if quota > 0 {
		if err := model.DecreaseUserQuota(job.UserId, quota, false); err != nil {
			logger.LogError(c.Request.Context(), "render decrease quota failed: "+err.Error())
		}
		model.RecordConsumeLog(c, job.UserId, model.RecordConsumeLogParams{
			ModelName: "漫剧成片渲染",
			TokenName: c.GetString("token_name"),
			Quota:     quota,
			TokenId:   job.TokenId,
			Group:     c.GetString("group"),
			Content: fmt.Sprintf("成片 %.1fs · 配音=%v · 字幕=%v · 拼接=%v（¥%.2f）",
				ws.Result.Duration, b.Dub, b.Subtitle, b.Concat, cny),
			Other: map[string]interface{}{
				"render": true, "duration_sec": ws.Result.Duration,
				"dub": b.Dub, "subtitle": b.Subtitle, "concat": b.Concat,
			},
		})
	}
}

// RenderContent GET /api/render/:id/content —— 代理拉取成片，脱敏渲染机地址。
func RenderContent(c *gin.Context) {
	rs := operation_setting.GetRenderSetting()
	userId := c.GetInt("id")
	jobId := c.Param("id")
	job, err := model.GetRenderJob(userId, jobId)
	if err != nil || job == nil {
		renderError(c, http.StatusNotFound, "任务不存在")
		return
	}
	if job.Status != "done" {
		renderError(c, http.StatusBadRequest, "成片未完成")
		return
	}
	// 从渲染机内部地址拉取（filename = worker job_id），客户只看到本站代理 URL
	src := rs.WorkerURL + "/output/" + job.WorkerJobId + ".mp4"
	wreq, err := http.NewRequestWithContext(c.Request.Context(), http.MethodGet, src, nil)
	if err != nil {
		renderError(c, http.StatusInternalServerError, "构造请求失败")
		return
	}
	wreq.Header.Set("X-Render-Token", rs.WorkerToken)
	resp, err := (&http.Client{Timeout: 120 * time.Second}).Do(wreq)
	if err != nil {
		renderError(c, http.StatusBadGateway, "成片拉取失败")
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusNotFound {
		renderError(c, http.StatusGone, "成片已过期（保留 7 天）")
		return
	}
	if resp.StatusCode != http.StatusOK {
		renderError(c, http.StatusBadGateway, "成片不可用")
		return
	}
	c.Header("Content-Type", "video/mp4")
	c.Header("Content-Disposition", fmt.Sprintf("inline; filename=manju_%s.mp4", jobId))
	if cl := resp.Header.Get("Content-Length"); cl != "" {
		c.Header("Content-Length", cl)
	}
	c.Status(http.StatusOK)
	_, _ = io.Copy(c.Writer, resp.Body)
}
