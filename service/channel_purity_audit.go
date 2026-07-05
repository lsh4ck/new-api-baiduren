package service

import (
	"bufio"
	"bytes"
	"fmt"
	"io"
	"math"
	"net/http"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
)

const (
	purityAuditCronHour  = 4   // 每天凌晨 4 点跑
	auditTrialPerChannel = 1   // 改 1 次（之前 2）— 进一步减少消耗
	auditMaxConcurrency  = 4
	auditRequestTimeout  = 90
	auditMaxOutputTest   = 200 // 改成 200 tok（之前 2000）— 烧 1/10 的钱
)

type auditTrial struct {
	HTTPStatus       int
	TTFBms           int
	TotalMs          int
	PromptTokens     int
	CompletionTokens int
	ResponseSample   string
	ErrorMessage     string
	FinishReason     string
	ActualModel      string
}

type channelAuditResult struct {
	ChannelID          int
	ChannelName        string
	Model              string
	AuditedAt          int64
	PromptTokens       int
	CompletionTokens   int
	MaxOutputRequested int
	MaxOutputActual    int
	TTFBms             int
	TotalMs            int
	TokensPerSec       float64
	TrialCount         int
	TotalMsStdev       int
	TotalMsP95         int
	PurityStatus       string
	PurityScore        float64
	PurityReason       string
	HTTPStatus         int
	ErrorMessage       string
	ResponseSample     string
}

var purityAuditOnce sync.Once

// StartChannelPurityAuditTask 启动每日纯血度审计任务
func StartChannelPurityAuditTask() {
	if !common.IsMasterNode {
		return
	}
	purityAuditOnce.Do(func() {
		go func() {
			// 启动 5 分钟后跑一次（用于验证）
			time.Sleep(5 * time.Minute)
			_ = RunChannelPurityAudit()
			for {
				now := time.Now()
				next := time.Date(now.Year(), now.Month(), now.Day(), purityAuditCronHour, 0, 0, 0, now.Location())
				if !next.After(now) {
					next = next.Add(24 * time.Hour)
				}
				time.Sleep(time.Until(next))
				_ = RunChannelPurityAudit()
			}
		}()
	})
}

// RunChannelPurityAudit 立即跑一次审计（cron + 手动触发共用）
func RunChannelPurityAudit() error {
	defer func() {
		if r := recover(); r != nil {
			common.SysError(fmt.Sprintf("channel purity audit panic: %v", r))
		}
	}()

	var channels []model.Channel
	if err := model.DB.
		Select("id, name, type, status, base_url, key, models").
		Where("status = ?", common.ChannelStatusEnabled).
		Find(&channels).Error; err != nil {
		return err
	}

	common.SysLog(fmt.Sprintf("[PurityAudit] starting on %d channels", len(channels)))
	sem := make(chan struct{}, auditMaxConcurrency)
	var wg sync.WaitGroup

	for _, ch := range channels {
		ch := ch
		wg.Add(1)
		sem <- struct{}{}
		go func() {
			defer wg.Done()
			defer func() { <-sem }()
			defer func() {
				if r := recover(); r != nil {
					common.SysError(fmt.Sprintf("[PurityAudit] channel #%d panic: %v", ch.Id, r))
				}
			}()
			results := auditChannel(ch)
			for _, r := range results {
				_ = storeAuditResult(r)
			}
		}()
	}
	wg.Wait()
	common.SysLog("[PurityAudit] completed")
	return nil
}

// auditChannel 测一个 channel 的所有"代表性模型"
func auditChannel(ch model.Channel) []channelAuditResult {
	results := []channelAuditResult{}

	models := pickAuditModels(ch.Models)
	if len(models) == 0 {
		return results
	}

	// 💰 成本保护：provider-i 渠道（积分制 + 单价高）只测 1 个最便宜模型
	chNameL := strings.ToLower(ch.Name)
	if strings.Contains(chNameL, "provider-i") {
		if len(models) > 1 {
			models = models[:1]
		}
	}

	baseRaw := ""
	if ch.BaseURL != nil {
		baseRaw = *ch.BaseURL
	}
	baseURL := normalizeBaseURL(baseRaw)
	if baseURL == "" {
		return results
	}

	for _, m := range models {
		// 跳过纯图片/视频模型（chat completions 测不了）
		if isMediaModel(m) {
			continue
		}
		// 跑 N 次取均值 + 方差
		trials := make([]auditTrial, 0, auditTrialPerChannel)
		for i := 0; i < auditTrialPerChannel; i++ {
			t := singleChannelTrial(baseURL, ch.Key, m)
			trials = append(trials, t)
			time.Sleep(500 * time.Millisecond)
		}
		results = append(results, summarizeTrials(ch, m, trials))
	}
	return results
}

// pickAuditModels 从 channel.models 字段中挑出 ≤3 个代表性模型审计
// 优先选**便宜模型**降低审计成本（haiku/mini/flash 而不是 opus/gpt-5）
func pickAuditModels(modelsCSV string) []string {
	all := strings.Split(modelsCSV, ",")
	for i := range all {
		all[i] = strings.TrimSpace(all[i])
	}
	picked := []string{}
	// 优先级反转：先测便宜的（每 trial ~$0.01 而非 ~$1）
	priority := []string{
		"claude-haiku-4-5", "claude-haiku-3",
		"gpt-5.4-mini", "gpt-5-nano", "gpt-4o-mini", "gpt-3.5",
		"gemini-2.5-flash", "gemini-2.5-flash-lite",
		"deepseek-v4-flash", "deepseek-v3",
		"glm-5", "minimax-m2.1",
		// 旗舰模型作为兜底（如果便宜模型都没）
		"claude-sonnet-4-6", "claude-sonnet-4-5",
		"claude-opus-4-7", "claude-opus-4-6",
		"gpt-5", "gpt-5.5",
		"gemini-3-pro-preview", "gemini-3.1-pro-preview",
	}
	seen := map[string]bool{}
	for _, p := range priority {
		for _, m := range all {
			if m == p || strings.HasPrefix(m, p) {
				if !seen[m] {
					picked = append(picked, m)
					seen[m] = true
					break
				}
			}
		}
		if len(picked) >= 2 { // 改成最多 2 个模型（之前是 3），降一半成本
			break
		}
	}
	// 还不够 → 加第一个非媒体模型兜底
	if len(picked) == 0 {
		for _, m := range all {
			if m != "" && !isMediaModel(m) {
				picked = append(picked, m)
				break
			}
		}
	}
	return picked
}

func isMediaModel(m string) bool {
	l := strings.ToLower(m)
	keywords := []string{"image", "banana", "flux", "dall", "seedream", "midjourney",
		"photon", "recraft", "video", "wan-", "wan2", "kling", "sora", "runway",
		"suno", "tts", "imagine", "ideogram", "qwen-image", "cogview", "happyhorse",
		"hunyuan-image", "hunyuan-video", "veo-", "imagen", "grok-image"}
	for _, k := range keywords {
		if strings.Contains(l, k) {
			return true
		}
	}
	return false
}

func normalizeBaseURL(rawURL string) string {
	u := strings.TrimSpace(rawURL)
	u = strings.TrimRight(u, "/")
	// 把 SmartRelay 代理路径还原成真实上游
	if strings.HasSuffix(u, "/upstream/provider-a") {
		return "https://provider-a.example.com"
	}
	if strings.HasSuffix(u, "/upstream/provider-i") {
		return "https://provider-i.example.com"
	}
	if strings.HasSuffix(u, "/upstream/provider-b") {
		return "https://provider-b.example.com"
	}
	if strings.HasSuffix(u, "/upstream/provider-c") {
		return "https://provider-c.example.com"
	}
	if u == "" {
		return ""
	}
	return u
}

// singleChannelTrial 单次审计请求 — 满血测试：要求 2000 tokens 长输出 + 给较长 prompt 测上下文
func singleChannelTrial(baseURL, apiKey, modelName string) auditTrial {
	t := auditTrial{}
	// 满血测试 prompt：第一行强制 PING_OK 防截断检测 + 要求生成 1500+ 字解答
	prompt := "Reply with exactly 'PING_OK' on first line. Then write a detailed 1500-word essay on " +
		"the history of distributed systems from 1960 to 2025, covering CAP theorem, consensus algorithms " +
		"(Paxos, Raft), MapReduce, Kubernetes, microservices, service mesh, and the trade-offs between " +
		"consistency, availability, and partition tolerance. Include specific years, names of engineers, " +
		"and company case studies (Google, Amazon, Netflix). Be comprehensive — minimum 1500 words."
	body := fmt.Sprintf(`{"model":%q,"messages":[{"role":"user","content":%q}],"max_tokens":%d,"stream":false}`,
		modelName, prompt, auditMaxOutputTest)
	req, err := http.NewRequest("POST", baseURL+"/v1/chat/completions", bytes.NewBufferString(body))
	if err != nil {
		t.ErrorMessage = err.Error()
		return t
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+apiKey)

	client := &http.Client{Timeout: time.Duration(auditRequestTimeout) * time.Second}
	start := time.Now()
	resp, err := client.Do(req)
	if err != nil {
		t.ErrorMessage = err.Error()
		t.TotalMs = int(time.Since(start).Milliseconds())
		return t
	}
	defer resp.Body.Close()
	t.HTTPStatus = resp.StatusCode

	// 读 body
	br := bufio.NewReader(resp.Body)
	firstByteAt := time.Now()
	// 偷偷读 1 字节看 TTFB
	if _, err := br.Peek(1); err == nil {
		firstByteAt = time.Now()
	}
	t.TTFBms = int(firstByteAt.Sub(start).Milliseconds())
	bodyBytes, _ := io.ReadAll(br)
	t.TotalMs = int(time.Since(start).Milliseconds())

	if len(bodyBytes) > 0 {
		// 提取关键字段：usage.prompt_tokens / completion_tokens / model / choices[0].message.content / finish_reason
		t.PromptTokens = extractIntField(bodyBytes, `"prompt_tokens":`)
		t.CompletionTokens = extractIntField(bodyBytes, `"completion_tokens":`)
		t.ActualModel = extractStringField(bodyBytes, `"model":`)
		t.FinishReason = extractStringField(bodyBytes, `"finish_reason":`)
		content := extractStringField(bodyBytes, `"content":`)
		t.ResponseSample = content
		if t.HTTPStatus >= 400 && t.ErrorMessage == "" {
			t.ErrorMessage = extractStringField(bodyBytes, `"message":`)
		}
	}
	return t
}

// extractIntField 简易 JSON int 提取（避免引入 json 解析的复杂性）
func extractIntField(b []byte, marker string) int {
	idx := bytes.Index(b, []byte(marker))
	if idx < 0 {
		return 0
	}
	start := idx + len(marker)
	for start < len(b) && (b[start] == ' ' || b[start] == '\t') {
		start++
	}
	end := start
	for end < len(b) && (b[end] >= '0' && b[end] <= '9' || b[end] == '-') {
		end++
	}
	if end == start {
		return 0
	}
	n := 0
	for _, c := range b[start:end] {
		if c >= '0' && c <= '9' {
			n = n*10 + int(c-'0')
		}
	}
	return n
}

// extractStringField 简易 JSON string 提取
func extractStringField(b []byte, marker string) string {
	idx := bytes.Index(b, []byte(marker))
	if idx < 0 {
		return ""
	}
	start := idx + len(marker)
	for start < len(b) && (b[start] == ' ' || b[start] == '\t') {
		start++
	}
	if start >= len(b) || b[start] != '"' {
		return ""
	}
	start++
	end := start
	for end < len(b) {
		if b[end] == '\\' {
			end += 2
			continue
		}
		if b[end] == '"' {
			break
		}
		end++
	}
	if end > len(b) {
		end = len(b)
	}
	s := string(b[start:end])
	if len(s) > 300 {
		s = s[:300] + "..."
	}
	return s
}

func summarizeTrials(ch model.Channel, modelName string, trials []auditTrial) channelAuditResult {
	r := channelAuditResult{
		ChannelID:          ch.Id,
		ChannelName:        ch.Name,
		Model:              modelName,
		AuditedAt:          time.Now().Unix(),
		MaxOutputRequested: auditMaxOutputTest,
		TrialCount:         len(trials),
	}
	if len(trials) == 0 {
		r.PurityStatus = "dead"
		r.PurityReason = "no trials run"
		return r
	}

	successCount := 0
	totals := []int{}
	ttfbs := []int{}
	var sumComp, sumPrompt int
	var lastErr, lastSample, lastActualModel, lastFinishReason string
	var lastHTTPStatus int
	maxComp := 0
	for _, t := range trials {
		if t.HTTPStatus == 200 && t.ErrorMessage == "" {
			successCount++
			totals = append(totals, t.TotalMs)
			ttfbs = append(ttfbs, t.TTFBms)
			sumComp += t.CompletionTokens
			sumPrompt += t.PromptTokens
			if t.CompletionTokens > maxComp {
				maxComp = t.CompletionTokens
			}
			lastSample = t.ResponseSample
			lastActualModel = t.ActualModel
			lastFinishReason = t.FinishReason
		} else {
			lastErr = t.ErrorMessage
			lastHTTPStatus = t.HTTPStatus
		}
	}

	r.MaxOutputActual = maxComp
	r.ResponseSample = lastSample
	r.HTTPStatus = lastHTTPStatus
	r.ErrorMessage = lastErr

	if successCount == 0 {
		r.PurityStatus = "dead"
		r.PurityScore = 0
		r.PurityReason = fmt.Sprintf("all %d trials failed: %s", len(trials), truncate(lastErr, 200))
		if lastHTTPStatus == 0 {
			lastHTTPStatus = -1
		}
		return r
	}

	// 平均时长
	sort.Ints(totals)
	sumTotal := 0
	for _, v := range totals {
		sumTotal += v
	}
	r.TotalMs = sumTotal / len(totals)
	r.TTFBms = avg(ttfbs)
	if len(totals) >= 2 {
		r.TotalMsStdev = stdev(totals)
		r.TotalMsP95 = totals[int(float64(len(totals))*0.95)]
		if r.TotalMsP95 == 0 {
			r.TotalMsP95 = totals[len(totals)-1]
		}
	}

	avgComp := sumComp / successCount
	avgPrompt := sumPrompt / successCount
	r.CompletionTokens = avgComp
	r.PromptTokens = avgPrompt
	if r.TotalMs > 0 {
		r.TokensPerSec = float64(avgComp) / (float64(r.TotalMs) / 1000)
	}

	// 纯血度判定（综合评分）
	r.PurityStatus, r.PurityScore, r.PurityReason = judgePurity(modelName, lastActualModel, avgComp, lastFinishReason, r.TotalMs, r.TotalMsStdev)

	return r
}

// isReasoningModel 检测是否是"推理模型"（visible content 默认空，内容在 reasoning_content）
// gpt-5.x / o1-* / o3-* / 后缀 -thinking / -high / -xhigh / -codex 等
func isReasoningModel(model string) bool {
	l := strings.ToLower(model)
	// OpenAI 新一代 reasoning：gpt-5 / gpt-5.x / o1 / o3 / o4
	if strings.HasPrefix(l, "gpt-5.") || strings.HasPrefix(l, "gpt-5-") || l == "gpt-5" {
		return true
	}
	if strings.HasPrefix(l, "o1-") || strings.HasPrefix(l, "o3-") || strings.HasPrefix(l, "o4-") {
		return true
	}
	// Claude / 其他 thinking 后缀
	if strings.Contains(l, "-thinking") || strings.Contains(l, "-codex") {
		return true
	}
	// GPT-5 后缀（high/xhigh/medium/low/minimal/openai-compact）也是 reasoning
	if strings.Contains(l, "-high") || strings.Contains(l, "-xhigh") ||
		strings.Contains(l, "-medium") || strings.Contains(l, "-low") ||
		strings.Contains(l, "-minimal") || strings.Contains(l, "-openai-compact") {
		return true
	}
	return false
}

// judgePurity 综合判定纯血度（满分 100）
// 评分维度：模型一致性 35 + 参数满血 30 + 速度 15 + 稳定性 20
func judgePurity(requestedModel, actualModel string, completionTokens int, finishReason string, totalMs, stdev int) (string, float64, string) {
	score := 100.0
	reasons := []string{}
	reasoningMode := isReasoningModel(requestedModel)

	// 1. 模型一致性 (35 分)
	if actualModel != "" && requestedModel != "" {
		rq := normalizeForCompare(requestedModel)
		ac := normalizeForCompare(actualModel)
		if !strings.Contains(ac, rq) && !strings.Contains(rq, ac) {
			score -= 35
			reasons = append(reasons, fmt.Sprintf("模型不匹配: 请求=%s 返回=%s", requestedModel, actualModel))
		}
	}

	// 2. 参数满血度 (30 分) — 仅对非 reasoning 模型生效
	//    reasoning 模型 visible content 默认是空，tokens 在 reasoning_content 里，不能用 completion_tokens 判
	if reasoningMode {
		// reasoning 模型：只检查上游是否实际响应，不看 completion tokens 长度
		if completionTokens == 0 && finishReason == "" {
			score -= 15
			reasons = append(reasons, "reasoning 模型 0 tokens 输出且无 finish_reason，疑似响应异常")
		}
	} else {
		expectedMin := auditMaxOutputTest * 75 / 100 // 1500 tok = 75% 满血
		if finishReason == "length" {
			if completionTokens < expectedMin {
				score -= 25
				reasons = append(reasons, fmt.Sprintf("⚠ 满血缩水: 请求 %d tok 但 length 截断仅给 %d tok（应 ≥%d）",
					auditMaxOutputTest, completionTokens, expectedMin))
			}
		} else if finishReason == "stop" {
			if completionTokens < 500 {
				score -= 20
				reasons = append(reasons, fmt.Sprintf("⚠ 输出过短: 请求长文但仅 %d tok，疑似上游限制 max_output", completionTokens))
			} else if completionTokens < expectedMin {
				score -= 10
				reasons = append(reasons, fmt.Sprintf("输出未达预期: %d tok（应 ≥%d）", completionTokens, expectedMin))
			}
		} else {
			if completionTokens < 30 {
				score -= 30
				reasons = append(reasons, fmt.Sprintf("回答异常: %d tok / finish=%s", completionTokens, finishReason))
			}
		}
	}

	// 3. 响应速度 (15 分)
	if totalMs > 90_000 {
		score -= 15
		reasons = append(reasons, fmt.Sprintf("响应过慢 %dms", totalMs))
	} else if totalMs > 60_000 {
		score -= 10
		reasons = append(reasons, fmt.Sprintf("响应慢 %dms", totalMs))
	} else if totalMs > 30_000 {
		score -= 5
	}

	// 4. 稳定性 (20 分)
	if totalMs > 0 && stdev > 0 {
		volatility := float64(stdev) / float64(totalMs)
		if volatility > 0.5 {
			score -= 20
			reasons = append(reasons, fmt.Sprintf("稳定性差 (波动 %.0f%%)", volatility*100))
		} else if volatility > 0.3 {
			score -= 10
			reasons = append(reasons, fmt.Sprintf("稳定性一般 (波动 %.0f%%)", volatility*100))
		}
	}

	status := "pure"
	if score < 50 {
		status = "degraded"
	} else if score < 75 {
		status = "suspicious"
	}
	reasonStr := "无异常 · 满血"
	if len(reasons) > 0 {
		reasonStr = strings.Join(reasons, "; ")
	}
	return status, score, reasonStr
}

func normalizeForCompare(s string) string {
	// claude-opus-4.7 ↔ claude-opus-4-7
	s = strings.ToLower(s)
	s = strings.ReplaceAll(s, ".", "-")
	// 去时间戳后缀 -20251001
	parts := strings.Split(s, "-")
	clean := []string{}
	for _, p := range parts {
		if len(p) == 8 && allDigits(p) {
			continue
		}
		clean = append(clean, p)
	}
	return strings.Join(clean, "-")
}

func allDigits(s string) bool {
	for _, c := range s {
		if c < '0' || c > '9' {
			return false
		}
	}
	return true
}

func storeAuditResult(r channelAuditResult) error {
	sql := `INSERT INTO channel_audit_results
	(channel_id, channel_name, model, audited_at,
	 prompt_tokens, completion_tokens, max_output_requested, max_output_actual,
	 ttfb_ms, total_ms, tokens_per_sec,
	 trial_count, total_ms_stdev, total_ms_p95,
	 purity_status, purity_score, purity_reason,
	 http_status, error_message, response_sample)
	VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
	return model.DB.Exec(sql,
		r.ChannelID, r.ChannelName, r.Model, r.AuditedAt,
		r.PromptTokens, r.CompletionTokens, r.MaxOutputRequested, r.MaxOutputActual,
		r.TTFBms, r.TotalMs, r.TokensPerSec,
		r.TrialCount, r.TotalMsStdev, r.TotalMsP95,
		r.PurityStatus, r.PurityScore, r.PurityReason,
		r.HTTPStatus, truncate(r.ErrorMessage, 1000), truncate(r.ResponseSample, 500),
	).Error
}

func truncate(s string, n int) string {
	if len(s) > n {
		return s[:n] + "..."
	}
	return s
}

func avg(xs []int) int {
	if len(xs) == 0 {
		return 0
	}
	s := 0
	for _, v := range xs {
		s += v
	}
	return s / len(xs)
}

func stdev(xs []int) int {
	if len(xs) < 2 {
		return 0
	}
	m := avg(xs)
	var ss float64
	for _, v := range xs {
		d := float64(v - m)
		ss += d * d
	}
	return int(math.Sqrt(ss / float64(len(xs))))
}
