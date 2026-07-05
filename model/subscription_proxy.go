package model

import (
	"time"

	"gorm.io/gorm"
)

// SubscriptionProxy 代理池（参照 sub2api Proxy 实体）
type SubscriptionProxy struct {
	ID          uint   `gorm:"primaryKey;column:id" json:"id"`
	Name        string `gorm:"size:200;column:name" json:"name"`
	URL         string `gorm:"size:512;column:url" json:"url"`
	Status      string `gorm:"size:20;default:active;column:status" json:"status"` // active/disabled
	Description string `gorm:"size:500;column:description" json:"description"`

	// 健康检查
	LastCheckedAt *time.Time `gorm:"column:last_checked_at" json:"last_checked_at,omitempty"`
	IsHealthy     bool       `gorm:"default:true;column:is_healthy" json:"is_healthy"`
	FailCount     int        `gorm:"default:0;column:fail_count" json:"fail_count"`

	CreatedAt time.Time      `gorm:"column:created_at" json:"created_at"`
	UpdatedAt time.Time      `gorm:"column:updated_at" json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index;column:deleted_at" json:"-"`
}

func (SubscriptionProxy) TableName() string { return "subscription_proxies" }

func CreateSubscriptionProxy(p *SubscriptionProxy) error {
	return DB.Create(p).Error
}

func GetSubscriptionProxyByID(id uint) (*SubscriptionProxy, error) {
	var p SubscriptionProxy
	return &p, DB.Where("id = ?", id).First(&p).Error
}

func ListSubscriptionProxies(status string, page, pageSize int) ([]SubscriptionProxy, int64, error) {
	var proxies []SubscriptionProxy
	var total int64
	q := DB.Model(&SubscriptionProxy{})
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
	err := q.Order("created_at DESC").Offset((page-1)*pageSize).Limit(pageSize).Find(&proxies).Error
	return proxies, total, err
}

func UpdateSubscriptionProxy(p *SubscriptionProxy) error {
	return DB.Save(p).Error
}

func DeleteSubscriptionProxy(id uint) error {
	return DB.Delete(&SubscriptionProxy{}, id).Error
}

func GetAllActiveProxies() ([]SubscriptionProxy, error) {
	var proxies []SubscriptionProxy
	return proxies, DB.Where("status = ?", "active").Find(&proxies).Error
}
