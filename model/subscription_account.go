package model

import (
	"time"

	"gorm.io/gorm"
)

// 账号类型
const (
	SubAccountTypeOAuth      = "oauth"
	SubAccountTypeSetupToken = "setup_token"
	SubAccountTypeAPIKey     = "api_key"
	SubAccountTypeCookie     = "cookie"
	SubAccountTypeBedrock    = "bedrock"
)

// 平台
const (
	SubPlatformClaude      = "claude"
	SubPlatformCodex       = "codex"
	SubPlatformGemini      = "gemini"
	SubPlatformAntigravity = "antigravity"
)

// 账号状态
const (
	SubAccountStatusActive   = "active"
	SubAccountStatusDisabled = "disabled"
	SubAccountStatusError    = "error"
	SubAccountStatusExpired  = "expired"
)

// SubscriptionAccount 订阅账号池
type SubscriptionAccount struct {
	ID          uint   `gorm:"primaryKey;column:id" json:"id"`
	Platform    string `gorm:"size:50;index;column:platform" json:"platform"`
	AccountType string `gorm:"size:50;default:oauth;column:account_type" json:"account_type"`
	AccountName string `gorm:"size:200;column:account_name" json:"account_name"`
	Email       string `gorm:"size:200;column:email" json:"email"`

	// 凭据（敏感，不对外）
	AccessToken  string `gorm:"size:4096;column:access_token" json:"-"`
	RefreshToken string `gorm:"size:4096;column:refresh_token" json:"-"`
	Credentials  string `gorm:"type:text;column:credentials" json:"-"` // JSON，存 cookie/bedrock 等凭据
	ExpiresAt    time.Time `gorm:"column:expires_at" json:"expires_at"`

	Status string `gorm:"size:20;default:active;column:status" json:"status"`

	// 调度控制
	Priority    int  `gorm:"default:0;column:priority" json:"priority"`       // 越小越优先
	Schedulable bool `gorm:"default:true;column:schedulable" json:"schedulable"`

	// 429/529 限流追踪（sub2api 核心）
	RateLimitedAt    *time.Time `gorm:"column:rate_limited_at" json:"rate_limited_at,omitempty"`
	RateLimitResetAt *time.Time `gorm:"column:rate_limit_reset_at" json:"rate_limit_reset_at,omitempty"`
	OverloadUntil    *time.Time `gorm:"column:overload_until" json:"overload_until,omitempty"`

	// 临时不可调度
	UnschedulableUntil  *time.Time `gorm:"column:unschedulable_until" json:"unschedulable_until,omitempty"`
	UnschedulableReason string     `gorm:"size:500;column:unschedulable_reason" json:"unschedulable_reason,omitempty"`

	// 用量
	RateMultiplier float64   `gorm:"default:1.0;column:rate_multiplier" json:"rate_multiplier"`
	UsageLimit     float64   `gorm:"column:usage_limit" json:"usage_limit"`
	UsedThisMonth  float64   `gorm:"column:used_this_month" json:"used_this_month"`
	TotalUsed      float64   `gorm:"default:0;column:total_used" json:"total_used"`
	LastUsedAt     time.Time `gorm:"column:last_used_at" json:"last_used_at"`

	// 代理
	ProxyID  uint   `gorm:"default:0;column:proxy_id" json:"proxy_id"`
	ProxyURL string `gorm:"size:512;column:proxy_url" json:"proxy_url"`

	// 限速
	RPM           int `gorm:"default:0;column:rpm" json:"rpm"`
	MaxConcurrent int `gorm:"default:0;column:max_concurrent" json:"max_concurrent"`

	CreatedAt time.Time      `gorm:"column:created_at" json:"created_at"`
	UpdatedAt time.Time      `gorm:"column:updated_at" json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index;column:deleted_at" json:"-"`
}

func (SubscriptionAccount) TableName() string { return "subscription_accounts" }

// IsSchedulable 综合检查是否可调度
func (sa *SubscriptionAccount) IsSchedulable() bool {
	if !sa.Schedulable || sa.Status != SubAccountStatusActive {
		return false
	}
	now := time.Now()
	if !sa.ExpiresAt.IsZero() && sa.ExpiresAt.Before(now) &&
		sa.AccountType != SubAccountTypeAPIKey && sa.AccountType != SubAccountTypeBedrock {
		return false
	}
	if sa.UnschedulableUntil != nil && sa.UnschedulableUntil.After(now) {
		return false
	}
	if sa.OverloadUntil != nil && sa.OverloadUntil.After(now) {
		return false
	}
	if sa.UsageLimit > 0 && sa.UsedThisMonth >= sa.UsageLimit {
		return false
	}
	return true
}

// IsRateLimited 是否处于 429 限流中
func (sa *SubscriptionAccount) IsRateLimited() bool {
	if sa.RateLimitResetAt == nil {
		return false
	}
	return sa.RateLimitResetAt.After(time.Now())
}

// GetEffectiveProxyURL 优先使用 ProxyID 对应的代理
func (sa *SubscriptionAccount) GetEffectiveProxyURL() string {
	if sa.ProxyID > 0 {
		if p, err := GetSubscriptionProxyByID(sa.ProxyID); err == nil && p.Status == "active" {
			return p.URL
		}
	}
	return sa.ProxyURL
}

// SubscriptionAccountPublicResponse 前端可见字段
type SubscriptionAccountPublicResponse struct {
	ID                  uint       `json:"id"`
	Platform            string     `json:"platform"`
	AccountType         string     `json:"account_type"`
	AccountName         string     `json:"account_name"`
	Email               string     `json:"email"`
	ExpiresAt           time.Time  `json:"expires_at"`
	Status              string     `json:"status"`
	Priority            int        `json:"priority"`
	Schedulable         bool       `json:"schedulable"`
	RateLimitedAt       *time.Time `json:"rate_limited_at,omitempty"`
	RateLimitResetAt    *time.Time `json:"rate_limit_reset_at,omitempty"`
	OverloadUntil       *time.Time `json:"overload_until,omitempty"`
	UnschedulableUntil  *time.Time `json:"unschedulable_until,omitempty"`
	UnschedulableReason string     `json:"unschedulable_reason,omitempty"`
	RateMultiplier      float64    `json:"rate_multiplier"`
	UsageLimit          float64    `json:"usage_limit"`
	UsedThisMonth       float64    `json:"used_this_month"`
	TotalUsed           float64    `json:"total_used"`
	LastUsedAt          time.Time  `json:"last_used_at"`
	ProxyID             uint       `json:"proxy_id"`
	ProxyURL            string     `json:"proxy_url"`
	RPM                 int        `json:"rpm"`
	MaxConcurrent       int        `json:"max_concurrent"`
	CreatedAt           time.Time  `json:"created_at"`
	UpdatedAt           time.Time  `json:"updated_at"`
}

func (sa *SubscriptionAccount) ToPublicResponse() SubscriptionAccountPublicResponse {
	return SubscriptionAccountPublicResponse{
		ID: sa.ID, Platform: sa.Platform, AccountType: sa.AccountType,
		AccountName: sa.AccountName, Email: sa.Email, ExpiresAt: sa.ExpiresAt,
		Status: sa.Status, Priority: sa.Priority, Schedulable: sa.Schedulable,
		RateLimitedAt: sa.RateLimitedAt, RateLimitResetAt: sa.RateLimitResetAt,
		OverloadUntil: sa.OverloadUntil, UnschedulableUntil: sa.UnschedulableUntil,
		UnschedulableReason: sa.UnschedulableReason,
		RateMultiplier: sa.RateMultiplier, UsageLimit: sa.UsageLimit,
		UsedThisMonth: sa.UsedThisMonth, TotalUsed: sa.TotalUsed,
		LastUsedAt: sa.LastUsedAt, ProxyID: sa.ProxyID, ProxyURL: sa.ProxyURL,
		RPM: sa.RPM, MaxConcurrent: sa.MaxConcurrent,
		CreatedAt: sa.CreatedAt, UpdatedAt: sa.UpdatedAt,
	}
}

// StickySession 粘性会话
type StickySession struct {
	ID           uint      `gorm:"primaryKey;column:id" json:"id"`
	UserID       uint      `gorm:"index;column:user_id" json:"user_id"`
	APIKey       string    `gorm:"uniqueIndex;size:255;column:api_key" json:"api_key"`
	AccountID    uint      `gorm:"column:account_id" json:"account_id"`
	Platform     string    `gorm:"size:50;column:platform" json:"platform"`
	GroupID      uint      `gorm:"default:0;column:group_id" json:"group_id"`
	LastAssigned time.Time `gorm:"column:last_assigned" json:"last_assigned"`
	CreatedAt    time.Time `gorm:"column:created_at" json:"created_at"`
	UpdatedAt    time.Time `gorm:"column:updated_at" json:"updated_at"`
}

func (StickySession) TableName() string { return "sticky_sessions" }

// ─── CRUD ──────────────────────────────────────────────────────────────────

func CreateSubscriptionAccount(account *SubscriptionAccount) error {
	return DB.Create(account).Error
}

func GetSubscriptionAccountByID(id uint) (*SubscriptionAccount, error) {
	var a SubscriptionAccount
	return &a, DB.Where("id = ?", id).First(&a).Error
}

func ListSubscriptionAccounts(platform, status string, page, pageSize int) ([]SubscriptionAccount, int64, error) {
	var accounts []SubscriptionAccount
	var total int64
	q := DB.Model(&SubscriptionAccount{})
	if platform != "" {
		q = q.Where("platform = ?", platform)
	}
	if status != "" {
		q = q.Where("status = ?", status)
	}
	if err := q.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	if page < 1 {
		page = 1
	}
	if pageSize < 1 {
		pageSize = 20
	}
	err := q.Order("priority ASC, created_at DESC").
		Offset((page-1)*pageSize).Limit(pageSize).Find(&accounts).Error
	return accounts, total, err
}

func UpdateSubscriptionAccount(account *SubscriptionAccount) error {
	return DB.Save(account).Error
}

func DeleteSubscriptionAccount(id uint) error {
	return DB.Delete(&SubscriptionAccount{}, id).Error
}

func UpdateAccountToken(id uint, accessToken, refreshToken string, expiresAt time.Time) error {
	return DB.Model(&SubscriptionAccount{}).Where("id = ?", id).Updates(map[string]interface{}{
		"access_token":  accessToken,
		"refresh_token": refreshToken,
		"expires_at":    expiresAt,
		"updated_at":    time.Now(),
	}).Error
}

func UpdateAccountUsage(id uint, usage float64) error {
	return DB.Model(&SubscriptionAccount{}).Where("id = ?", id).Updates(map[string]interface{}{
		"used_this_month": gorm.Expr("used_this_month + ?", usage),
		"total_used":      gorm.Expr("total_used + ?", usage),
		"last_used_at":    time.Now(),
	}).Error
}

func MarkAccountRateLimited(id uint, resetAt time.Time) error {
	now := time.Now()
	return DB.Model(&SubscriptionAccount{}).Where("id = ?", id).Updates(map[string]interface{}{
		"rate_limited_at":     now,
		"rate_limit_reset_at": resetAt,
	}).Error
}

func MarkAccountOverloaded(id uint, until time.Time) error {
	return DB.Model(&SubscriptionAccount{}).Where("id = ?", id).Update("overload_until", until).Error
}

func ClearAccountRateLimit(id uint) error {
	return DB.Model(&SubscriptionAccount{}).Where("id = ?", id).Updates(map[string]interface{}{
		"rate_limited_at":     nil,
		"rate_limit_reset_at": nil,
	}).Error
}

// GetSchedulableAccounts 获取可调度账号（已过滤过载/禁用）
func GetSchedulableAccounts(platform string, groupID uint) ([]SubscriptionAccount, error) {
	var accounts []SubscriptionAccount
	now := time.Now()

	q := DB.Where("platform = ? AND status = ? AND schedulable = ?", platform, SubAccountStatusActive, true).
		Where("unschedulable_until IS NULL OR unschedulable_until < ?", now).
		Where("overload_until IS NULL OR overload_until < ?", now)

	if groupID > 0 {
		q = q.Joins("JOIN subscription_account_groups sag ON sag.account_id = subscription_accounts.id AND sag.group_id = ?", groupID)
	}

	q = q.Order("priority ASC, used_this_month ASC")
	if err := q.Find(&accounts).Error; err != nil {
		return nil, err
	}

	// Go 层过滤 token 过期和额度
	result := make([]SubscriptionAccount, 0, len(accounts))
	for i := range accounts {
		if accounts[i].IsSchedulable() {
			result = append(result, accounts[i])
		}
	}
	return result, nil
}

// GetActiveAccountsByPlatformAndGroup 兼容旧接口
func GetActiveAccountsByPlatformAndGroup(platform string, groupID uint) ([]SubscriptionAccount, error) {
	return GetSchedulableAccounts(platform, groupID)
}

func GetActiveAccountCount(platform string, groupID uint) (int64, error) {
	var count int64
	q := DB.Model(&SubscriptionAccount{}).Where("platform = ? AND status = ?", platform, SubAccountStatusActive)
	if groupID > 0 {
		q = q.Where("group_id = ?", groupID)
	}
	return count, q.Count(&count).Error
}
