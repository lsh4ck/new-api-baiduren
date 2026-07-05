package model

import (
	"errors"
	"time"

	"gorm.io/gorm"
)

// Limit scope types
const (
	LimitScopeEnterprise = "enterprise"
	LimitScopeWorkGroup  = "workgroup"
	LimitScopeMember     = "member"
)

// Limit periods
const (
	LimitPeriodDaily   = "daily"
	LimitPeriodMonthly = "monthly"
	LimitPeriodQuarter = "quarterly"
	LimitPeriodTotal   = "total"
)

// EnterpriseLimit 企业范围内的额度上限（按企业/工作组/成员）
type EnterpriseLimit struct {
	Id           uint   `json:"id" gorm:"primaryKey"`
	EnterpriseId uint   `json:"enterprise_id" gorm:"index;not null"`
	ScopeType    string `json:"scope_type" gorm:"size:20;not null"` // enterprise/workgroup/member
	ScopeId      uint   `json:"scope_id" gorm:"not null;index"`     // 0 表示企业级，其余表示 workgroup_id 或 user_id
	Period       string `json:"period" gorm:"size:20;not null"`     // daily/monthly/quarterly/total
	MaxQuota     int64  `json:"max_quota" gorm:"not null;default:0"` // 上限额度（quota 单位）；0 表示无限制
	EnforceHard  bool   `json:"enforce_hard" gorm:"not null;default:true"` // 硬限制 vs 软告警

	// 计数（消费的滚动周期累计）
	PeriodStartUnix int64 `json:"period_start_unix" gorm:"default:0"`
	UsedQuota       int64 `json:"used_quota" gorm:"default:0"`

	// 软限制触发的事件标记，避免重复发送告警
	LastAlertUnix int64 `json:"last_alert_unix" gorm:"default:0"`
	LastAlertPct  int   `json:"last_alert_pct" gorm:"default:0"` // 上次已发送的告警阈值 %，如 80/90/100

	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`
}

func (EnterpriseLimit) TableName() string { return "enterprise_limits" }

var (
	ErrEnterpriseLimitNotFound = errors.New("限额规则不存在")
	ErrEnterpriseLimitDup      = errors.New("该 scope+period 组合的限额已存在")
)

// === Limit CRUD ===

func CreateEnterpriseLimit(l *EnterpriseLimit) error {
	if l.EnterpriseId == 0 || l.ScopeType == "" || l.Period == "" {
		return errors.New("invalid params")
	}
	// 同一 enterprise + scope_type + scope_id + period 只能有一条
	var count int64
	if err := DB.Model(&EnterpriseLimit{}).Where(
		"enterprise_id = ? AND scope_type = ? AND scope_id = ? AND period = ?",
		l.EnterpriseId, l.ScopeType, l.ScopeId, l.Period,
	).Count(&count).Error; err != nil {
		return err
	}
	if count > 0 {
		return ErrEnterpriseLimitDup
	}
	if l.PeriodStartUnix == 0 {
		l.PeriodStartUnix = computePeriodStart(l.Period)
	}
	return DB.Create(l).Error
}

func GetEnterpriseLimitById(id uint) (*EnterpriseLimit, error) {
	var l EnterpriseLimit
	if err := DB.First(&l, id).Error; err != nil {
		return nil, ErrEnterpriseLimitNotFound
	}
	return &l, nil
}

func ListEnterpriseLimits(enterpriseId uint) ([]EnterpriseLimit, error) {
	rows := make([]EnterpriseLimit, 0)
	err := DB.Where("enterprise_id = ?", enterpriseId).Order("scope_type ASC, scope_id ASC, period ASC").Find(&rows).Error
	return rows, err
}

func UpdateEnterpriseLimit(l *EnterpriseLimit) error {
	return DB.Save(l).Error
}

func DeleteEnterpriseLimit(id uint) error {
	return DB.Delete(&EnterpriseLimit{}, id).Error
}

// computePeriodStart 计算当前周期起点 unix 秒
func computePeriodStart(period string) int64 {
	now := time.Now()
	switch period {
	case LimitPeriodDaily:
		// UTC+8 0 点
		loc, _ := time.LoadLocation("Asia/Shanghai")
		if loc == nil {
			loc = time.Local
		}
		nowLocal := now.In(loc)
		t := time.Date(nowLocal.Year(), nowLocal.Month(), nowLocal.Day(), 0, 0, 0, 0, loc)
		return t.Unix()
	case LimitPeriodMonthly:
		t := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.Local)
		return t.Unix()
	case LimitPeriodQuarter:
		// 季度起点：1/4/7/10 月 1 日
		quarter := (int(now.Month()) - 1) / 3
		startMonth := time.Month(quarter*3 + 1)
		t := time.Date(now.Year(), startMonth, 1, 0, 0, 0, 0, time.Local)
		return t.Unix()
	case LimitPeriodTotal:
		return 0 // 不滚动
	default:
		return now.Unix()
	}
}

// MaybeResetPeriod 检查 limit 是否跨越了周期边界，需要清零
func MaybeResetPeriod(l *EnterpriseLimit) bool {
	if l.Period == LimitPeriodTotal {
		return false
	}
	newStart := computePeriodStart(l.Period)
	if newStart > l.PeriodStartUnix {
		l.PeriodStartUnix = newStart
		l.UsedQuota = 0
		l.LastAlertUnix = 0
		l.LastAlertPct = 0
		return true
	}
	return false
}

// GetActiveLimitsForUser 返回对该用户生效的所有限额（企业 + 工作组 + 个人三层）
func GetActiveLimitsForUser(userId int) ([]EnterpriseLimit, error) {
	if userId <= 0 {
		return nil, nil
	}

	var entId uint
	var entMember EnterpriseMember
	if err := DB.Where("user_id = ?", userId).First(&entMember).Error; err == nil {
		entId = entMember.EnterpriseId
	}
	if entId == 0 {
		// 该用户不属于任何企业
		return nil, nil
	}

	var wgId uint
	var wgMember WorkGroupMember
	if err := DB.Where("user_id = ?", userId).First(&wgMember).Error; err == nil {
		wgId = wgMember.WorkGroupId
	}

	var rows []EnterpriseLimit
	q := DB.Where("enterprise_id = ?", entId).
		Where("(scope_type = ? AND scope_id = 0) OR (scope_type = ? AND scope_id = ?) OR (scope_type = ? AND scope_id = ?)",
			LimitScopeEnterprise,
			LimitScopeMember, uint(userId),
			LimitScopeWorkGroup, wgId,
		)
	err := q.Find(&rows).Error
	return rows, err
}

// AccumulateLimitsForUser 用户消费后，更新所有 active limits 的 used_quota。
// 该调用应在 PostConsumeQuota 之后立即执行。
func AccumulateLimitsForUser(userId int, deltaQuota int64) error {
	if userId <= 0 || deltaQuota <= 0 {
		return nil
	}
	limits, err := GetActiveLimitsForUser(userId)
	if err != nil {
		return err
	}
	for i := range limits {
		l := &limits[i]
		if MaybeResetPeriod(l) {
			_ = UpdateEnterpriseLimit(l)
		}
		// 增量更新
		if err := DB.Model(&EnterpriseLimit{}).Where("id = ?", l.Id).
			UpdateColumn("used_quota", gorm.Expr("used_quota + ?", deltaQuota)).Error; err != nil {
			return err
		}
	}
	return nil
}

// CheckHardLimitsForUser 在请求前调用：返回 (block bool, blocker *Limit)
// 仅检查 enforce_hard=true 的限额；软限制由别处单独处理
func CheckHardLimitsForUser(userId int, projectedQuota int64) (*EnterpriseLimit, error) {
	limits, err := GetActiveLimitsForUser(userId)
	if err != nil {
		return nil, err
	}
	for i := range limits {
		l := &limits[i]
		if !l.EnforceHard {
			continue
		}
		if l.MaxQuota <= 0 {
			continue
		}
		MaybeResetPeriod(l)
		if l.UsedQuota+projectedQuota > l.MaxQuota {
			return l, nil
		}
	}
	return nil, nil
}
