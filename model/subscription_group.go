package model

import (
	"time"

	"gorm.io/gorm"
)

// SubscriptionGroup 订阅分组（参照 sub2api Group 实体）
// 每个分组决定：使用哪些账号池、模型路由策略、限额策略
type SubscriptionGroup struct {
	ID          uint   `gorm:"primaryKey;column:id" json:"id"`
	Name        string `gorm:"uniqueIndex;size:200;column:name" json:"name"`
	Description string `gorm:"size:1000;column:description" json:"description"`
	Platform    string `gorm:"size:50;default:claude;column:platform" json:"platform"` // claude/codex/gemini/antigravity
	Status      string `gorm:"size:20;default:active;column:status" json:"status"`     // active/disabled

	// 模型路由：JSON 对象，key=请求模型，value=实际转发的模型
	// 例：{"claude-3-5-sonnet-20241022":"claude-3-7-sonnet-20250219"}
	ModelRouting string `gorm:"type:text;column:model_routing" json:"model_routing"`

	// 限额控制（单位：美元）
	DailySpendingLimit   float64 `gorm:"default:0;column:daily_spending_limit" json:"daily_spending_limit"`
	WeeklySpendingLimit  float64 `gorm:"default:0;column:weekly_spending_limit" json:"weekly_spending_limit"`
	MonthlySpendingLimit float64 `gorm:"default:0;column:monthly_spending_limit" json:"monthly_spending_limit"`

	// 限速
	RPMLimit      int `gorm:"default:0;column:rpm_limit" json:"rpm_limit"`
	MaxConcurrent int `gorm:"default:0;column:max_concurrent" json:"max_concurrent"`

	// Claude Code 特性
	MCPXMLEnabled    bool `gorm:"default:false;column:mcp_xml_enabled" json:"mcp_xml_enabled"`  // MCP XML 注入
	ClaudeCodeOnly   bool `gorm:"default:false;column:claude_code_only" json:"claude_code_only"` // 仅允许 Claude Code 客户端

	// Antigravity 特性
	AllowAntigravityFallback bool `gorm:"default:false;column:allow_antigravity_fallback" json:"allow_antigravity_fallback"`

	// 图片生成计费倍率
	ImageRateMultiplier1K float64 `gorm:"default:1.0;column:image_rate_1k" json:"image_rate_1k"`
	ImageRateMultiplier2K float64 `gorm:"default:1.5;column:image_rate_2k" json:"image_rate_2k"`
	ImageRateMultiplier4K float64 `gorm:"default:2.0;column:image_rate_4k" json:"image_rate_4k"`

	CreatedAt time.Time      `gorm:"column:created_at" json:"created_at"`
	UpdatedAt time.Time      `gorm:"column:updated_at" json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index;column:deleted_at" json:"-"`
}

func (SubscriptionGroup) TableName() string { return "subscription_groups" }

// SubscriptionAccountGroup 账号-分组多对多关联表
type SubscriptionAccountGroup struct {
	AccountID uint `gorm:"primaryKey;column:account_id"`
	GroupID   uint `gorm:"primaryKey;column:group_id"`
}

func (SubscriptionAccountGroup) TableName() string { return "subscription_account_groups" }

// ─── CRUD ──────────────────────────────────────────────────────────────────

func CreateSubscriptionGroup(g *SubscriptionGroup) error {
	return DB.Create(g).Error
}

func GetSubscriptionGroupByID(id uint) (*SubscriptionGroup, error) {
	var g SubscriptionGroup
	return &g, DB.Where("id = ?", id).First(&g).Error
}

func ListSubscriptionGroups(platform, status string, page, pageSize int) ([]SubscriptionGroup, int64, error) {
	var groups []SubscriptionGroup
	var total int64
	q := DB.Model(&SubscriptionGroup{})
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
		pageSize = 50
	}
	err := q.Order("created_at DESC").Offset((page-1)*pageSize).Limit(pageSize).Find(&groups).Error
	return groups, total, err
}

func UpdateSubscriptionGroup(g *SubscriptionGroup) error {
	return DB.Save(g).Error
}

func DeleteSubscriptionGroup(id uint) error {
	// 先删除关联
	DB.Where("group_id = ?", id).Delete(&SubscriptionAccountGroup{})
	return DB.Delete(&SubscriptionGroup{}, id).Error
}

// AddAccountsToGroup 将账号批量加入分组
func AddAccountsToGroup(groupID uint, accountIDs []uint) error {
	for _, aid := range accountIDs {
		record := SubscriptionAccountGroup{AccountID: aid, GroupID: groupID}
		// INSERT OR IGNORE (兼容三数据库)
		DB.Where(record).FirstOrCreate(&record)
	}
	return nil
}

// RemoveAccountsFromGroup 从分组移除账号
func RemoveAccountsFromGroup(groupID uint, accountIDs []uint) error {
	return DB.Where("group_id = ? AND account_id IN ?", groupID, accountIDs).
		Delete(&SubscriptionAccountGroup{}).Error
}

// GetGroupAccounts 获取分组内的所有账号 ID
func GetGroupAccounts(groupID uint) ([]uint, error) {
	var rows []SubscriptionAccountGroup
	err := DB.Where("group_id = ?", groupID).Find(&rows).Error
	if err != nil {
		return nil, err
	}
	ids := make([]uint, len(rows))
	for i, r := range rows {
		ids[i] = r.AccountID
	}
	return ids, nil
}

// GetAccountGroups 获取账号所属的分组 ID 列表
func GetAccountGroups(accountID uint) ([]uint, error) {
	var rows []SubscriptionAccountGroup
	err := DB.Where("account_id = ?", accountID).Find(&rows).Error
	if err != nil {
		return nil, err
	}
	ids := make([]uint, len(rows))
	for i, r := range rows {
		ids[i] = r.GroupID
	}
	return ids, nil
}
