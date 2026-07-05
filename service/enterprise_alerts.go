package service

import (
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/model"
)

var digestOnce sync.Once

// StartEnterpriseDailyDigestTask 每天 08:00 UTC+8 发送企业消费日报
func StartEnterpriseDailyDigestTask() {
	if !common.IsMasterNode {
		return
	}
	digestOnce.Do(func() {
		go func() {
			loc, _ := time.LoadLocation("Asia/Shanghai")
			if loc == nil {
				loc = time.Local
			}
			for {
				now := time.Now().In(loc)
				next := time.Date(now.Year(), now.Month(), now.Day(), 8, 0, 0, 0, loc)
				if !next.After(now) {
					next = next.Add(24 * time.Hour)
				}
				time.Sleep(time.Until(next))
				SendEnterpriseDailyDigest()
			}
		}()
	})
}

// defaultAlertThresholds returns the configured thresholds from options, fallback [80,90,100].
func defaultAlertThresholds() []int {
	if v, ok := common.OptionMap["WorkspaceBudgetAlerts"]; ok && v != "" {
		parts := strings.Split(v, ",")
		thresholds := make([]int, 0, len(parts))
		for _, p := range parts {
			p = strings.TrimSpace(p)
			n := 0
			fmt.Sscanf(p, "%d", &n)
			if n > 0 && n <= 100 {
				thresholds = append(thresholds, n)
			}
		}
		if len(thresholds) > 0 {
			return thresholds
		}
	}
	return []int{80, 90, 100}
}

// TriggerSoftAlertsForUser checks soft-limit thresholds for the user and sends email alerts
// when a new threshold is crossed. Should be called asynchronously after AccumulateLimitsForUser.
func TriggerSoftAlertsForUser(userId int) {
	limits, err := model.GetActiveLimitsForUser(userId)
	if err != nil || len(limits) == 0 {
		return
	}

	thresholds := defaultAlertThresholds()
	// sort descending so we send the highest first (in case multiple crossed at once)
	for i, j := 0, len(thresholds)-1; i < j; i, j = i+1, j-1 {
		thresholds[i], thresholds[j] = thresholds[j], thresholds[i]
	}

	for i := range limits {
		l := &limits[i]
		if l.EnforceHard || l.MaxQuota <= 0 {
			continue
		}
		pct := int(float64(l.UsedQuota) / float64(l.MaxQuota) * 100)
		for _, thr := range thresholds {
			if pct >= thr && l.LastAlertPct < thr {
				sendLimitThresholdAlert(l, pct, thr)
				model.DB.Model(&model.EnterpriseLimit{}).Where("id = ?", l.Id).Updates(map[string]interface{}{
					"last_alert_pct":  thr,
					"last_alert_unix": time.Now().Unix(),
				})
				break // only send one level per check
			}
		}
	}
}

// sendLimitThresholdAlert sends an email to the enterprise admin when a threshold is crossed.
func sendLimitThresholdAlert(l *model.EnterpriseLimit, usedPct, threshold int) {
	// Resolve enterprise
	ent, err := model.GetEnterpriseById(l.EnterpriseId)
	if err != nil || ent == nil {
		return
	}

	// Get admin email
	if ent.AdminId <= 0 {
		return
	}
	var admin model.User
	if err := model.DB.Select("id, email, display_name, username, setting").
		Where("id = ?", ent.AdminId).First(&admin).Error; err != nil {
		return
	}
	email := admin.Email
	if email == "" {
		return
	}

	// Compose scope label
	scopeLabel := "企业"
	switch l.ScopeType {
	case model.LimitScopeWorkGroup:
		var wg model.WorkGroup
		if err := model.DB.Select("name").Where("id = ?", l.ScopeId).First(&wg).Error; err == nil {
			scopeLabel = fmt.Sprintf("工作组「%s」", wg.Name)
		} else {
			scopeLabel = "工作组"
		}
	case model.LimitScopeMember:
		var u model.User
		if err := model.DB.Select("username, display_name").Where("id = ?", l.ScopeId).First(&u).Error; err == nil {
			name := u.DisplayName
			if name == "" {
				name = u.Username
			}
			scopeLabel = fmt.Sprintf("成员「%s」", name)
		}
	}

	usedUSD := fmt.Sprintf("%.2f", float64(l.UsedQuota)/500000.0)
	maxUSD := fmt.Sprintf("%.2f", float64(l.MaxQuota)/500000.0)
	periodLabel := periodName(l.Period)

	subject := fmt.Sprintf("【%s】%s额度已使用 %d%%", ent.Name, scopeLabel, threshold)

	content := fmt.Sprintf(`<div style="font-family:sans-serif;max-width:520px;margin:auto">
<h2 style="color:#1a1a1a">额度告警通知</h2>
<p>您好，<b>%s</b> 的 <b>%s</b> <b>%s额度</b>已达到使用阈值。</p>
<table style="width:100%%;border-collapse:collapse;margin:16px 0">
<tr><td style="padding:8px 0;color:#666">工作区</td><td><b>%s</b></td></tr>
<tr><td style="padding:8px 0;color:#666">范围</td><td><b>%s</b></td></tr>
<tr><td style="padding:8px 0;color:#666">周期</td><td>%s</td></tr>
<tr><td style="padding:8px 0;color:#666">已使用</td><td><b>$%s / $%s</b>（%d%%）</td></tr>
<tr><td style="padding:8px 0;color:#666">告警阈值</td><td><b>%d%%</b></td></tr>
</table>
<div style="background:#fff3cd;border:1px solid #ffc107;border-radius:6px;padding:12px 16px;margin:16px 0">
<b>建议：</b>请前往企业控制台查看详细消费分布，适当调整预算或限额设置。
</div>
<p style="color:#888;font-size:12px">此邮件由系统自动发送，请勿直接回复。</p>
</div>`,
		admin.DisplayName, ent.Name, scopeLabel, periodLabel,
		ent.Name, scopeLabel, periodLabel,
		usedUSD, maxUSD, usedPct, threshold,
	)

	if err := common.SendEmail(subject, email, content); err != nil {
		common.SysError(fmt.Sprintf("enterprise alert email failed (ent=%d thr=%d): %v", l.EnterpriseId, threshold, err))
	}
}

// SendEnterpriseDailyDigest sends a daily usage summary to each enterprise admin.
// Should be called once per day by the scheduler.
func SendEnterpriseDailyDigest() {
	enterprises, _, err := model.ListEnterprises("", 1, 200)
	if err != nil {
		return
	}

	yesterday := time.Now().AddDate(0, 0, -1)
	dayStart := time.Date(yesterday.Year(), yesterday.Month(), yesterday.Day(), 0, 0, 0, 0, time.Local)
	dayEnd := dayStart.Add(24 * time.Hour)
	monthStart := time.Date(time.Now().Year(), time.Now().Month(), 1, 0, 0, 0, 0, time.Local)

	for _, ent := range enterprises {
		if ent.Status != "active" || ent.AdminId <= 0 {
			continue
		}
		var admin model.User
		if err := model.DB.Select("id, email, display_name, username, setting").
			Where("id = ?", ent.AdminId).First(&admin).Error; err != nil || admin.Email == "" {
			continue
		}

		// Get member ids
		var memberIds []int
		model.DB.Table("enterprise_members").
			Where("enterprise_id = ? AND deleted_at IS NULL", ent.Id).
			Pluck("user_id", &memberIds)
		if len(memberIds) == 0 {
			continue
		}

		// Yesterday usage
		var yesterdayQuota int64
		model.DB.Model(&model.QuotaData{}).
			Where("user_id IN ? AND created_at >= ? AND created_at < ?", memberIds, dayStart.Unix(), dayEnd.Unix()).
			Select("COALESCE(SUM(quota), 0)").Scan(&yesterdayQuota)

		// Month-to-date
		var monthQuota int64
		model.DB.Model(&model.QuotaData{}).
			Where("user_id IN ? AND created_at >= ?", memberIds, monthStart.Unix()).
			Select("COALESCE(SUM(quota), 0)").Scan(&monthQuota)

		// Monthly limit
		maxBudgetQuota, _ := monthlyBudgetForEntHelper(ent.Id)

		yesterdayUSD := float64(yesterdayQuota) / 500000.0
		monthUSD := float64(monthQuota) / 500000.0

		budgetSection := ""
		if maxBudgetQuota > 0 {
			maxUSD := float64(maxBudgetQuota) / 500000.0
			pct := int(monthUSD / maxUSD * 100)
			remaining := maxUSD - monthUSD
			budgetSection = fmt.Sprintf(`<tr><td style="padding:8px 0;color:#666">月度预算</td><td><b>$%.2f / $%.2f</b>（已用 %d%%，剩余 $%.2f）</td></tr>`,
				monthUSD, maxUSD, pct, remaining)
		}

		subject := fmt.Sprintf("【%s】昨日 AI 消费日报 · %s", ent.Name, yesterday.Format("01月02日"))
		adminName := admin.DisplayName
		if adminName == "" {
			adminName = admin.Username
		}

		content := fmt.Sprintf(`<div style="font-family:sans-serif;max-width:560px;margin:auto">
<h2 style="color:#1a1a1a">每日消费日报</h2>
<p>您好 <b>%s</b>，以下是 <b>%s</b> 昨日（%s）的 AI 使用概况：</p>
<table style="width:100%%;border-collapse:collapse;margin:16px 0">
<tr><td style="padding:8px 0;color:#666">昨日消费</td><td><b>$%.4f</b></td></tr>
<tr><td style="padding:8px 0;color:#666">本月累计</td><td><b>$%.4f</b></td></tr>
%s
</table>
<p>如需查看详细分布，请登录<b>企业控制台</b>查看成员消费排行榜与模型分布图。</p>
<p style="color:#888;font-size:12px">此邮件由系统每日自动发送，请勿直接回复。</p>
</div>`,
			adminName, ent.Name, yesterday.Format("2006-01-02"),
			yesterdayUSD, monthUSD, budgetSection,
		)

		userSetting := admin.GetSetting()
		notify := dto.NewNotify(dto.NotifyTypeEmail, subject, content, nil)
		if err := NotifyUser(admin.Id, admin.Email, userSetting, notify); err != nil {
			common.SysError(fmt.Sprintf("daily digest failed (ent=%d): %v", ent.Id, err))
		}
	}
}

// monthlyBudgetForEntHelper is a package-level helper (same logic as controller)
func monthlyBudgetForEntHelper(entId uint) (int64, int64) {
	var l model.EnterpriseLimit
	err := model.DB.Where(
		"enterprise_id = ? AND scope_type = ? AND scope_id = 0 AND period = ?",
		entId, model.LimitScopeEnterprise, model.LimitPeriodMonthly,
	).First(&l).Error
	if err != nil {
		return 0, 0
	}
	model.MaybeResetPeriod(&l)
	return l.MaxQuota, l.UsedQuota
}

func periodName(p string) string {
	switch p {
	case model.LimitPeriodDaily:
		return "日"
	case model.LimitPeriodMonthly:
		return "月"
	case model.LimitPeriodQuarter:
		return "季度"
	case model.LimitPeriodTotal:
		return "总量"
	}
	return p
}
