package service

import (
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
)

// 渠道健康监控三层告警：
//   ① 自动禁用告警（敏感，5 分钟一次）— 新发现 status=3 → 立即邮件
//   ② 静默告警（兜底，1 小时一次）— enabled 渠道连续 12h 无流量 → 邮件
//   ③ 错误率告警（1 小时一次）— enabled 渠道近 1h error_rate ≥ errorRateThreshold 且 样本 ≥ errorRateMinSamples → 邮件
const (
	silenceThreshold       = 12 * time.Hour
	silenceCheckInterval   = 1 * time.Hour
	autoDisableInterval    = 5 * time.Minute // 实时
	silenceDedupeWindow    = 24 * time.Hour
	autoDisableDedupe      = 6 * time.Hour
	minChannelAge          = 24 * time.Hour
	errorRateWindow        = 1 * time.Hour
	errorRateThreshold     = 0.50 // 50% 失败率触发告警
	errorRateMinSamples    = 10   // 至少 10 次总请求才判定（避免低流量噪声）
	errorRateDedupeWindow  = 6 * time.Hour
	providerIPurchaseURL         = "https://example.com/purchase-link"
	providerIPurchaseDescription = "供货商充值应急包（示例）"
)

var monitorChannelTrafficOnce sync.Once

// MonitorChannelTraffic 启动三层巡检 goroutine
func MonitorChannelTraffic() {
	if !common.IsMasterNode {
		return
	}
	monitorChannelTrafficOnce.Do(func() {
		time.Sleep(2 * time.Minute)
		// 1h 错误率检查（12h 静默告警已按用户要求停发 2026-06-06：没人用没事，不必告警；
		// 手动触发 RunChannelSilenceCheckOnce 仍保留静默检查能力）
		go func() {
			runChannelErrorRateCheck()
			ticker := time.NewTicker(silenceCheckInterval)
			defer ticker.Stop()
			for range ticker.C {
				runChannelErrorRateCheck()
			}
		}()
		// 5min 自动禁用检查
		go func() {
			runAutoDisableCheck()
			ticker := time.NewTicker(autoDisableInterval)
			defer ticker.Stop()
			for range ticker.C {
				runAutoDisableCheck()
			}
		}()
	})
}

// RunChannelSilenceCheckOnce 管理员手动触发一次（controller 用）
func RunChannelSilenceCheckOnce() {
	runChannelSilenceCheck()
	runAutoDisableCheck()
	runChannelErrorRateCheck()
}

// ─────────────────────────────────────────────────────────────
// 层 ② 12h 无流量检查（兜底）
// ─────────────────────────────────────────────────────────────
func runChannelSilenceCheck() {
	defer func() {
		if r := recover(); r != nil {
			common.SysError(fmt.Sprintf("channel silence check panic: %v", r))
		}
	}()

	var channels []model.Channel
	err := model.DB.
		Select("id, name, status, created_time, \"group\"").
		Where("status = ?", common.ChannelStatusEnabled).
		Find(&channels).Error
	if err != nil {
		common.SysError("channel silence check: failed to list channels: " + err.Error())
		return
	}

	now := time.Now().Unix()
	cutoff := now - int64(silenceThreshold.Seconds())
	ageGate := now - int64(minChannelAge.Seconds())

	for _, ch := range channels {
		if ch.CreatedTime > ageGate {
			continue
		}
		var count int64
		err := model.DB.Table("logs").
			Where("channel_id = ? AND created_at >= ?", ch.Id, cutoff).
			Count(&count).Error
		if err != nil {
			continue
		}
		if count == 0 {
			dedupeKey := fmt.Sprintf("channel_silence_alert:%d", ch.Id)
			if common.RedisEnabled {
				existed, _ := common.RedisGet(dedupeKey)
				if existed != "" {
					continue
				}
			}
			receiver := adminAlertEmail()
			if receiver == "" {
				return
			}
			subject := fmt.Sprintf("[转转·渠道告警] #%d %s 连续 12 小时无流量", ch.Id, ch.Name)
			body := buildSilenceAlertBody(ch)
			if err := common.SendEmail(subject, receiver, body); err == nil {
				if common.RedisEnabled {
					_ = common.RedisSet(dedupeKey, "1", silenceDedupeWindow)
				}
				common.SysLog(fmt.Sprintf("channel silence alert sent: #%d %s", ch.Id, ch.Name))
			}
		}
	}
}

// ─────────────────────────────────────────────────────────────
// 层 ① 自动禁用实时检查（5 分钟级，主告警）
// 发现 status=3 (ChannelStatusAutoDisabled) 的 provider-i / 上游缺钱类渠道 → 立即邮件
// ─────────────────────────────────────────────────────────────
func runAutoDisableCheck() {
	defer func() {
		if r := recover(); r != nil {
			common.SysError(fmt.Sprintf("channel auto-disable check panic: %v", r))
		}
	}()

	var channels []model.Channel
	err := model.DB.
		Select("id, name, status, created_time, \"group\"").
		Where("status = ?", common.ChannelStatusAutoDisabled).
		Find(&channels).Error
	if err != nil {
		return
	}
	if len(channels) == 0 {
		return
	}

	for _, ch := range channels {
		dedupeKey := fmt.Sprintf("channel_autodisable_alert:%d", ch.Id)
		if common.RedisEnabled {
			existed, _ := common.RedisGet(dedupeKey)
			if existed != "" {
				continue
			}
		}
		receiver := adminAlertEmail()
		if receiver == "" {
			return
		}
		// 判断是不是 provider-i / 缺钱类渠道（名字含 provider-i / 上游 URL 含 provider-i）
		isProviderIChannel := strings.Contains(strings.ToLower(ch.Name), "provider-i")
		subject := fmt.Sprintf("[转转·紧急] 渠道 #%d %s 已被自动禁用（疑似上游缺钱/封号）", ch.Id, ch.Name)
		body := buildAutoDisableAlertBody(ch, isProviderIChannel)
		if err := common.SendEmail(subject, receiver, body); err == nil {
			if common.RedisEnabled {
				_ = common.RedisSet(dedupeKey, "1", autoDisableDedupe)
			}
			common.SysLog(fmt.Sprintf("channel auto-disable alert sent: #%d %s (provideri=%v)", ch.Id, ch.Name, isProviderIChannel))
		}
	}
}

func adminAlertEmail() string {
	if root := model.GetRootUser(); root != nil && root.Email != "" {
		return root.Email
	}
	if e, ok := common.OptionMap["RootUserEmail"]; ok && e != "" {
		return e
	}
	return ""
}

// ─────────────────────────────────────────────────────────────
// 邮件模板
// ─────────────────────────────────────────────────────────────
func buildAutoDisableAlertBody(ch model.Channel, isProviderI bool) string {
	createdStr := time.Unix(ch.CreatedTime, 0).Format("2006-01-02 15:04")
	purchaseBlock := ""
	if isProviderI {
		purchaseBlock = fmt.Sprintf(`
    <div style="margin-top:18px;padding:14px 16px;background:linear-gradient(135deg,#fef3c7,#fed7aa);border-radius:10px;border:1px solid rgba(245,158,11,0.3);">
      <div style="font-size:13px;font-weight:700;color:#9a3412;margin-bottom:6px;">🛒 一键采购补充</div>
      <div style="font-size:12.5px;color:#78350f;margin-bottom:10px;line-height:1.6;">
        provider-i 缺钱专用应急包：<b>%s</b><br>
        买完 30 分钟内卖家发账号，立即去 <a href="https://zhuanzhuan.pw/console/channels" style="color:#9a3412;font-weight:600;">控制台</a> 替换 Key
      </div>
      <a href="%s" style="display:inline-block;background:linear-gradient(90deg,#f59e0b,#dc2626);color:white;font-size:13.5px;font-weight:700;padding:9px 18px;border-radius:8px;text-decoration:none;">立即去淘宝采购 →</a>
    </div>`, providerIPurchaseDescription, providerIPurchaseURL)
	}

	return fmt.Sprintf(`<div style="font-family:-apple-system,'Helvetica Neue',Arial,sans-serif;line-height:1.7;max-width:640px;margin:0 auto;color:#1f2937;">
  <div style="background:linear-gradient(135deg,#dc2626,#991b1b);color:white;padding:18px 22px;border-radius:14px 14px 0 0;">
    <div style="font-size:13px;opacity:0.85;letter-spacing:0.5px;">🚨 CHANNEL AUTO-DISABLED</div>
    <div style="font-size:22px;font-weight:700;margin-top:4px;">渠道已被系统自动禁用</div>
  </div>
  <div style="background:#ffffff;border:1px solid rgba(220,38,38,0.25);border-top:none;border-radius:0 0 14px 14px;padding:20px 22px;">
    <p style="margin:0 0 14px;font-size:14px;">new-api 内置的健康检查机制检测到该渠道连续返回错误，已自动 <b style="color:#dc2626;">禁用（status=3）</b>。最可能的原因：</p>
    <ul style="margin:0 0 16px;padding-left:22px;font-size:13.5px;color:#475569;">
      <li><b>上游账号缺积分</b>（provider-i / 订阅号池：HTTP 402 insufficient_quota）</li>
      <li><b>Key 失效</b>（账号被封、密码改了、token 过期）</li>
      <li><b>上游服务异常</b>（5xx / timeout 连续 N 次）</li>
    </ul>

    <table style="width:100%%;border-collapse:collapse;font-size:13.5px;background:#fef2f2;border-radius:8px;overflow:hidden;">
      <tr><td style="padding:9px 14px;border-bottom:1px solid #fecaca;color:#7f1d1d;width:30%%;">渠道 ID</td><td style="padding:9px 14px;border-bottom:1px solid #fecaca;font-weight:600;">#%d</td></tr>
      <tr><td style="padding:9px 14px;border-bottom:1px solid #fecaca;color:#7f1d1d;">渠道名</td><td style="padding:9px 14px;border-bottom:1px solid #fecaca;font-weight:600;">%s</td></tr>
      <tr><td style="padding:9px 14px;border-bottom:1px solid #fecaca;color:#7f1d1d;">所属分组</td><td style="padding:9px 14px;border-bottom:1px solid #fecaca;"><code style="background:#fecaca;padding:1px 6px;border-radius:4px;font-size:12px;">%s</code></td></tr>
      <tr><td style="padding:9px 14px;border-bottom:1px solid #fecaca;color:#7f1d1d;">渠道类型</td><td style="padding:9px 14px;border-bottom:1px solid #fecaca;">%s</td></tr>
      <tr><td style="padding:9px 14px;border-bottom:1px solid #fecaca;color:#7f1d1d;">创建时间</td><td style="padding:9px 14px;border-bottom:1px solid #fecaca;">%s</td></tr>
      <tr><td style="padding:9px 14px;color:#7f1d1d;">告警时间</td><td style="padding:9px 14px;">%s</td></tr>
    </table>
%s
    <div style="margin-top:18px;padding:12px 14px;background:#f3f4f6;border-left:3px solid #6b7280;border-radius:6px;font-size:13px;color:#374151;">
      <b>排查 checklist：</b><br>
      1. 进控制台「测试」该渠道，看具体错误码<br>
      2. 若是 402 / insufficient_quota → 补充上游积分（provider-i 见上方采购链接）<br>
      3. 若是 401 / 403 → 检查 Key 是否被卖家撤回、账号是否被封<br>
      4. 若是 5xx → 上游故障，临时看官方公告 / Discord
    </div>

    <div style="margin-top:14px;display:flex;gap:10px;justify-content:center;">
      <a href="https://zhuanzhuan.pw/console/channels" style="display:inline-block;background:#1f2937;color:white;font-size:13px;font-weight:600;padding:8px 18px;border-radius:8px;text-decoration:none;">前往渠道管理 →</a>
    </div>

    <div style="margin-top:18px;padding-top:14px;border-top:1px solid #e5e7eb;font-size:11.5px;color:#9ca3af;text-align:center;">
      本邮件每个渠道 6 小时内只发一次。问题处理后系统会自动恢复渠道（定时复测机制）<br>
      摆渡人 · 自动健康监控 · 5 分钟级告警
    </div>
  </div>
</div>`,
		ch.Id, ch.Name, ch.Group, channelTypeName(ch), createdStr,
		time.Now().Format("2006-01-02 15:04:05"),
		purchaseBlock,
	)
}

func buildSilenceAlertBody(ch model.Channel) string {
	createdStr := time.Unix(ch.CreatedTime, 0).Format("2006-01-02 15:04")
	isProviderI := strings.Contains(strings.ToLower(ch.Name), "provider-i")
	purchaseBlock := ""
	if isProviderI {
		purchaseBlock = fmt.Sprintf(`
    <div style="margin-top:18px;padding:14px 16px;background:linear-gradient(135deg,#fef3c7,#fed7aa);border-radius:10px;border:1px solid rgba(245,158,11,0.3);">
      <div style="font-size:13px;font-weight:700;color:#9a3412;margin-bottom:6px;">🛒 一键采购补充</div>
      <div style="font-size:12.5px;color:#78350f;margin-bottom:10px;line-height:1.6;">
        provider-i 缺钱专用应急包：<b>%s</b>
      </div>
      <a href="%s" style="display:inline-block;background:linear-gradient(90deg,#f59e0b,#dc2626);color:white;font-size:13.5px;font-weight:700;padding:9px 18px;border-radius:8px;text-decoration:none;">立即去淘宝采购 →</a>
    </div>`, providerIPurchaseDescription, providerIPurchaseURL)
	}

	return fmt.Sprintf(`<div style="font-family:-apple-system,'Helvetica Neue',Arial,sans-serif;line-height:1.7;max-width:640px;margin:0 auto;color:#1f2937;">
  <div style="background:linear-gradient(135deg,#fbbf24,#f59e0b);color:white;padding:18px 22px;border-radius:14px 14px 0 0;">
    <div style="font-size:13px;opacity:0.85;letter-spacing:0.5px;">⚠️ CHANNEL SILENCE ALERT</div>
    <div style="font-size:22px;font-weight:700;margin-top:4px;">渠道连续 12 小时无任何请求</div>
  </div>
  <div style="background:#ffffff;border:1px solid rgba(245,158,11,0.25);border-top:none;border-radius:0 0 14px 14px;padding:20px 22px;">
    <p style="margin:0 0 14px;font-size:14px;">下列渠道在 <b>过去 12 小时</b>内没有收到任何 API 请求，且渠道状态仍为「启用」。可能原因：</p>
    <ul style="margin:0 0 16px;padding-left:22px;font-size:13.5px;color:#475569;">
      <li>上游账号被封 / 订阅过期 / 积分耗尽（但未触发 new-api 自动禁用）</li>
      <li>所有用户都改用了其他分组（流量切走）</li>
      <li>Key 失效或网络异常导致全部请求降级到其他渠道</li>
    </ul>

    <table style="width:100%%;border-collapse:collapse;font-size:13.5px;background:#f9fafb;border-radius:8px;overflow:hidden;">
      <tr><td style="padding:9px 14px;border-bottom:1px solid #e5e7eb;color:#6b7280;width:30%%;">渠道 ID</td><td style="padding:9px 14px;border-bottom:1px solid #e5e7eb;font-weight:600;">#%d</td></tr>
      <tr><td style="padding:9px 14px;border-bottom:1px solid #e5e7eb;color:#6b7280;">渠道名</td><td style="padding:9px 14px;border-bottom:1px solid #e5e7eb;font-weight:600;">%s</td></tr>
      <tr><td style="padding:9px 14px;border-bottom:1px solid #e5e7eb;color:#6b7280;">所属分组</td><td style="padding:9px 14px;border-bottom:1px solid #e5e7eb;"><code style="background:#e5e7eb;padding:1px 6px;border-radius:4px;font-size:12px;">%s</code></td></tr>
      <tr><td style="padding:9px 14px;border-bottom:1px solid #e5e7eb;color:#6b7280;">创建时间</td><td style="padding:9px 14px;border-bottom:1px solid #e5e7eb;">%s</td></tr>
      <tr><td style="padding:9px 14px;color:#6b7280;">检测时间</td><td style="padding:9px 14px;">%s</td></tr>
    </table>
%s
    <div style="margin-top:18px;padding:12px 14px;background:#fef3c7;border-left:3px solid #f59e0b;border-radius:6px;font-size:13px;color:#78350f;">
      <b>建议立即排查：</b><br>
      1. 进控制台手动 Test 这条渠道，看是否返回正常<br>
      2. 登上游官网/provider-i Dashboard 检查账号状态、剩余积分、订阅有效期<br>
      3. 若上游崩了，临时把渠道改成禁用，避免用户调用进来 timeout
    </div>

    <div style="margin-top:14px;text-align:center;">
      <a href="https://zhuanzhuan.pw/console/channels" style="display:inline-block;background:#1f2937;color:white;font-size:13px;font-weight:600;padding:8px 18px;border-radius:8px;text-decoration:none;">前往渠道管理 →</a>
    </div>

    <div style="margin-top:18px;padding-top:14px;border-top:1px solid #e5e7eb;font-size:11.5px;color:#9ca3af;text-align:center;">
      本邮件每个渠道 24 小时内只发一次。已修复或确认正常后可忽略。<br>
      摆渡人 · 自动健康监控 · 12 小时静默兜底
    </div>
  </div>
</div>`,
		ch.Id, ch.Name, ch.Group, createdStr, time.Now().Format("2006-01-02 15:04:05"),
		purchaseBlock,
	)
}

func channelTypeName(ch model.Channel) string {
	// 简化：根据 channel.Type 转可读名（够用即可，不全列举）
	switch ch.Type {
	case 1:
		return "OpenAI 兼容"
	case 14:
		return "Anthropic"
	case 33:
		return "AWS Bedrock"
	default:
		return fmt.Sprintf("type=%d", ch.Type)
	}
}

// ─────────────────────────────────────────────────────────────
// 层 ③ 1h 错误率检查（主告警 — 上游缺钱/上游故障早期信号）
// 近 1 小时 enabled 渠道 error_rate ≥ errorRateThreshold 且 样本 ≥ errorRateMinSamples
// → 立即邮件告警 + Redis dedupe 6h
// ─────────────────────────────────────────────────────────────
type channelErrorRateRow struct {
	ChannelID int   `gorm:"column:channel_id"`
	Successes int64 `gorm:"column:successes"`
	Errors    int64 `gorm:"column:errors"`
	LastError int64 `gorm:"column:last_error"`
}

func runChannelErrorRateCheck() {
	defer func() {
		if r := recover(); r != nil {
			common.SysError(fmt.Sprintf("channel error-rate check panic: %v", r))
		}
	}()

	now := time.Now().Unix()
	cutoff := now - int64(errorRateWindow.Seconds())
	ageGate := now - int64(minChannelAge.Seconds())

	// 1 次聚合查询拿到所有渠道的近 1h 成功/失败计数
	// 用 db_log alias (LOG_DB) — 与 logs 表所在的 connection 一致
	var rows []channelErrorRateRow
	err := model.LOG_DB.Table("logs").
		Select("channel_id, "+
			"SUM(CASE WHEN type = 2 THEN 1 ELSE 0 END) AS successes, "+
			"SUM(CASE WHEN type = 5 THEN 1 ELSE 0 END) AS errors, "+
			"MAX(CASE WHEN type = 5 THEN created_at ELSE 0 END) AS last_error").
		Where("created_at >= ? AND type IN (2, 5) AND channel_id > 0", cutoff).
		Group("channel_id").
		Find(&rows).Error
	if err != nil {
		common.SysError("channel error-rate check: aggregate logs failed: " + err.Error())
		return
	}

	if len(rows) == 0 {
		return
	}

	// 拉所有 enabled 渠道元数据（status / created_time / name / group）
	channelMap := make(map[int]model.Channel)
	var channels []model.Channel
	if err := model.DB.
		Select("id, type, name, status, created_time, \"group\"").
		Where("status = ?", common.ChannelStatusEnabled).
		Find(&channels).Error; err != nil {
		common.SysError("channel error-rate check: list channels failed: " + err.Error())
		return
	}
	for _, ch := range channels {
		channelMap[ch.Id] = ch
	}

	for _, r := range rows {
		ch, ok := channelMap[r.ChannelID]
		if !ok {
			continue // 渠道被禁用 / 已删除
		}
		if ch.CreatedTime > ageGate {
			continue // 新渠道还在养，不告警
		}
		total := r.Successes + r.Errors
		if total < errorRateMinSamples {
			continue
		}
		rate := float64(r.Errors) / float64(total)
		if rate < errorRateThreshold {
			continue
		}

		dedupeKey := fmt.Sprintf("channel_errorrate_alert:%d", ch.Id)
		if common.RedisEnabled {
			existed, _ := common.RedisGet(dedupeKey)
			if existed != "" {
				continue
			}
		}
		receiver := adminAlertEmail()
		if receiver == "" {
			return
		}

		subject := fmt.Sprintf("[转转·错误率告警] #%d %s 近 1h 错误率 %.0f%%（%d/%d）",
			ch.Id, ch.Name, rate*100, r.Errors, total)
		body := buildErrorRateAlertBody(ch, r.Successes, r.Errors, rate, r.LastError)
		if err := common.SendEmail(subject, receiver, body); err == nil {
			if common.RedisEnabled {
				_ = common.RedisSet(dedupeKey, "1", errorRateDedupeWindow)
			}
			common.SysLog(fmt.Sprintf("channel error-rate alert sent: #%d %s rate=%.2f%% (%d/%d)",
				ch.Id, ch.Name, rate*100, r.Errors, total))
		}
	}
}

func buildErrorRateAlertBody(ch model.Channel, successes, errors int64, rate float64, lastError int64) string {
	createdStr := time.Unix(ch.CreatedTime, 0).Format("2006-01-02 15:04")
	lastErrStr := "未知"
	if lastError > 0 {
		lastErrStr = time.Unix(lastError, 0).Format("2006-01-02 15:04:05")
	}
	isProviderI := strings.Contains(strings.ToLower(ch.Name), "provider-i")
	purchaseBlock := ""
	if isProviderI {
		purchaseBlock = fmt.Sprintf(`
    <div style="margin-top:18px;padding:14px 16px;background:linear-gradient(135deg,#fef3c7,#fed7aa);border-radius:10px;border:1px solid rgba(245,158,11,0.3);">
      <div style="font-size:13px;font-weight:700;color:#9a3412;margin-bottom:6px;">🛒 一键采购补充</div>
      <div style="font-size:12.5px;color:#78350f;margin-bottom:10px;line-height:1.6;">
        provider-i 缺钱专用应急包：<b>%s</b>
      </div>
      <a href="%s" style="display:inline-block;background:linear-gradient(90deg,#f59e0b,#dc2626);color:white;font-size:13.5px;font-weight:700;padding:9px 18px;border-radius:8px;text-decoration:none;">立即去淘宝采购 →</a>
    </div>`, providerIPurchaseDescription, providerIPurchaseURL)
	}

	return fmt.Sprintf(`<div style="font-family:-apple-system,'Helvetica Neue',Arial,sans-serif;line-height:1.7;max-width:640px;margin:0 auto;color:#1f2937;">
  <div style="background:linear-gradient(135deg,#ea580c,#dc2626);color:white;padding:18px 22px;border-radius:14px 14px 0 0;">
    <div style="font-size:13px;opacity:0.85;letter-spacing:0.5px;">📊 CHANNEL HIGH ERROR RATE</div>
    <div style="font-size:22px;font-weight:700;margin-top:4px;">渠道近 1 小时错误率 %.0f%%</div>
  </div>
  <div style="background:#ffffff;border:1px solid rgba(234,88,12,0.25);border-top:none;border-radius:0 0 14px 14px;padding:20px 22px;">
    <p style="margin:0 0 14px;font-size:14px;">该渠道在过去 1 小时累计 <b>%d</b> 次请求，其中 <b style="color:#dc2626;">%d</b> 次失败 — 失败占比 <b style="color:#dc2626;">%.1f%%</b>，已超过 %.0f%% 告警阈值。可能的原因：</p>
    <ul style="margin:0 0 16px;padding-left:22px;font-size:13.5px;color:#475569;">
      <li><b>上游余额耗尽</b>（但错误码未命中 ShouldDisable 关键字 → 渠道仍是 enabled）</li>
      <li><b>速率限制</b>（429 / rate limit / quota exceeded）</li>
      <li><b>模型不可用</b>（model_not_found / 配置漂移）</li>
      <li><b>上游断流</b>（5xx / timeout 间歇性）</li>
    </ul>

    <table style="width:100%%;border-collapse:collapse;font-size:13.5px;background:#fff7ed;border-radius:8px;overflow:hidden;">
      <tr><td style="padding:9px 14px;border-bottom:1px solid #fed7aa;color:#9a3412;width:30%%;">渠道 ID</td><td style="padding:9px 14px;border-bottom:1px solid #fed7aa;font-weight:600;">#%d</td></tr>
      <tr><td style="padding:9px 14px;border-bottom:1px solid #fed7aa;color:#9a3412;">渠道名</td><td style="padding:9px 14px;border-bottom:1px solid #fed7aa;font-weight:600;">%s</td></tr>
      <tr><td style="padding:9px 14px;border-bottom:1px solid #fed7aa;color:#9a3412;">所属分组</td><td style="padding:9px 14px;border-bottom:1px solid #fed7aa;"><code style="background:#fed7aa;padding:1px 6px;border-radius:4px;font-size:12px;">%s</code></td></tr>
      <tr><td style="padding:9px 14px;border-bottom:1px solid #fed7aa;color:#9a3412;">渠道类型</td><td style="padding:9px 14px;border-bottom:1px solid #fed7aa;">%s</td></tr>
      <tr><td style="padding:9px 14px;border-bottom:1px solid #fed7aa;color:#9a3412;">创建时间</td><td style="padding:9px 14px;border-bottom:1px solid #fed7aa;">%s</td></tr>
      <tr><td style="padding:9px 14px;border-bottom:1px solid #fed7aa;color:#9a3412;">成功 / 失败</td><td style="padding:9px 14px;border-bottom:1px solid #fed7aa;"><b style="color:#16a34a;">%d</b> / <b style="color:#dc2626;">%d</b></td></tr>
      <tr><td style="padding:9px 14px;border-bottom:1px solid #fed7aa;color:#9a3412;">最近失败时间</td><td style="padding:9px 14px;border-bottom:1px solid #fed7aa;">%s</td></tr>
      <tr><td style="padding:9px 14px;color:#9a3412;">告警时间</td><td style="padding:9px 14px;">%s</td></tr>
    </table>
%s
    <div style="margin-top:18px;padding:12px 14px;background:#fef3c7;border-left:3px solid #ea580c;border-radius:6px;font-size:13px;color:#78350f;">
      <b>建议立即排查：</b><br>
      1. 进控制台「渠道健康度」面板，查看近 24h 完整趋势<br>
      2. 看「日志」筛选该 channel_id + type=error，找原始错误内容<br>
      3. 上游充值 / 换 key / 临时禁用渠道避免拖累全局
    </div>

    <div style="margin-top:14px;display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">
      <a href="https://zhuanzhuan.pw/console/channel-health" style="display:inline-block;background:#ea580c;color:white;font-size:13px;font-weight:600;padding:8px 18px;border-radius:8px;text-decoration:none;">健康度面板 →</a>
      <a href="https://zhuanzhuan.pw/console/channels" style="display:inline-block;background:#1f2937;color:white;font-size:13px;font-weight:600;padding:8px 18px;border-radius:8px;text-decoration:none;">渠道管理 →</a>
    </div>

    <div style="margin-top:18px;padding-top:14px;border-top:1px solid #e5e7eb;font-size:11.5px;color:#9ca3af;text-align:center;">
      本邮件每个渠道 6 小时内只发一次。错误率回落到阈值以下后告警状态自动复位。<br>
      摆渡人 · 自动健康监控 · 1 小时错误率聚合
    </div>
  </div>
</div>`,
		rate*100,
		successes+errors, errors, rate*100, errorRateThreshold*100,
		ch.Id, ch.Name, ch.Group, channelTypeName(ch), createdStr,
		successes, errors, lastErrStr,
		time.Now().Format("2006-01-02 15:04:05"),
		purchaseBlock,
	)
}
