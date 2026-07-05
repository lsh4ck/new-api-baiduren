package model

import (
	"errors"
	"time"

	"gorm.io/gorm"
)

// Enterprise 一个独立的企业租户
type Enterprise struct {
	Id uint `json:"id" gorm:"primaryKey"`
	// Name 不声明 uniqueIndex —— GORM 默认生成的索引会包含软删行，导致同名企业删了之后没法重建。
	// 唯一性由 application-level CreateEnterprise 检查 +
	// 数据库 partial unique index (uniq_enterprises_name_active WHERE deleted_at IS NULL) 保证。
	// 该索引名以 "uniq_" 前缀避开 GORM 的 idx_<table>_<field> 命名规则，AutoMigrate 不会触碰。
	Name        string         `json:"name" gorm:"size:128;not null"`
	Description string         `json:"description" gorm:"size:512;default:''"`
	Status      string         `json:"status" gorm:"size:20;default:'active'"` // active / suspended
	OwnerId     int            `json:"owner_id" gorm:"index"`                  // 创建者 user_id（销售或平台管理员）
	AdminId     int            `json:"admin_id" gorm:"index;default:0"`        // 当前企业管理员 user_id；0 表示尚未指派
	CreatedAt   time.Time      `json:"created_at"`
	UpdatedAt   time.Time      `json:"updated_at"`
	DeletedAt   gorm.DeletedAt `gorm:"index" json:"-"`
}

func (Enterprise) TableName() string { return "enterprises" }

// EnterpriseMember 企业成员（用户与企业的 1:1 关系）
type EnterpriseMember struct {
	Id           uint `json:"id" gorm:"primaryKey"`
	EnterpriseId uint `json:"enterprise_id" gorm:"index;not null"`
	// UserId 唯一性由数据库 partial unique index (uniq_enterprise_members_user_active WHERE deleted_at IS NULL) 保证
	// 不在此声明 uniqueIndex —— 否则 GORM 会创建包含软删行的全表唯一索引，导致软删后无法重新加入
	UserId    int            `json:"user_id" gorm:"not null;index"`
	JoinedAt  time.Time      `json:"joined_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`
}

func (EnterpriseMember) TableName() string { return "enterprise_members" }

var (
	ErrEnterpriseNotFound      = errors.New("企业不存在")
	ErrEnterpriseNameTaken     = errors.New("企业名称已被占用")
	ErrEnterpriseUserHasOther  = errors.New("用户已属于其他企业，请先移除")
	ErrEnterpriseUserNotMember = errors.New("用户不在该企业中")
)

// === Enterprise CRUD ===

func CreateEnterprise(e *Enterprise) error {
	if e.Name == "" {
		return errors.New("企业名称不能为空")
	}
	// 唯一性预检：只看未软删的行；与 DB 的 partial unique index 行为一致
	var count int64
	if err := DB.Model(&Enterprise{}).Where("name = ?", e.Name).Count(&count).Error; err != nil {
		return err
	}
	if count > 0 {
		return ErrEnterpriseNameTaken
	}
	if e.Status == "" {
		e.Status = "active"
	}
	return DB.Create(e).Error
}

func GetEnterpriseById(id uint) (*Enterprise, error) {
	var e Enterprise
	if err := DB.First(&e, id).Error; err != nil {
		return nil, ErrEnterpriseNotFound
	}
	return &e, nil
}

func ListEnterprises(keyword string, page, pageSize int) ([]Enterprise, int64, error) {
	rows := make([]Enterprise, 0)
	var total int64
	q := DB.Model(&Enterprise{})
	if keyword != "" {
		q = q.Where("name LIKE ?", "%"+keyword+"%")
	}
	if err := q.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 200 {
		pageSize = 20
	}
	err := q.Order("id DESC").Offset((page - 1) * pageSize).Limit(pageSize).Find(&rows).Error
	return rows, total, err
}

func UpdateEnterprise(e *Enterprise) error {
	return DB.Save(e).Error
}

func DeleteEnterprise(id uint) error {
	return DB.Transaction(func(tx *gorm.DB) error {
		// 撤销企业管理员
		if err := tx.Model(&User{}).Where("enterprise_admin_of = ?", id).Update("enterprise_admin_of", 0).Error; err != nil {
			return err
		}
		// 清空成员
		if err := tx.Where("enterprise_id = ?", id).Delete(&EnterpriseMember{}).Error; err != nil {
			return err
		}
		// 软删企业
		return tx.Delete(&Enterprise{}, id).Error
	})
}

// === EnterpriseMember CRUD ===

// AddEnterpriseMember 加入企业。一个用户同一时刻只能在一个企业（partial unique 保证）。
// 软删历史记录不会挡新插入。
func AddEnterpriseMember(enterpriseId uint, userId int) error {
	if enterpriseId == 0 || userId <= 0 {
		return errors.New("invalid params")
	}

	// 先查 active record（scoped 默认排除软删）
	var existing EnterpriseMember
	err := DB.Where("user_id = ?", userId).First(&existing).Error
	if err == nil && existing.Id != 0 {
		// 已经是某企业的 active 成员
		if existing.EnterpriseId == enterpriseId {
			return nil // 已经在目标企业
		}
		return ErrEnterpriseUserHasOther // 在别的企业，按 1:1 规则拒绝
	}

	// 没有 active 记录。看看是否有同 user_id 的软删行；有的话先硬删避免与新 INSERT 冲突
	// （虽然有 partial unique，但旧的 enterprise_id 引用可能过期）
	_ = DB.Unscoped().Where("user_id = ? AND deleted_at IS NOT NULL", userId).Delete(&EnterpriseMember{}).Error

	return DB.Create(&EnterpriseMember{
		EnterpriseId: enterpriseId,
		UserId:       userId,
		JoinedAt:     time.Now(),
	}).Error
}

// RemoveEnterpriseMember 把用户从企业中移除。如果该用户同时是企业管理员，自动撤销管理员身份。
func RemoveEnterpriseMember(enterpriseId uint, userId int) error {
	if enterpriseId == 0 || userId <= 0 {
		return errors.New("invalid params")
	}
	return DB.Transaction(func(tx *gorm.DB) error {
		res := tx.Where("enterprise_id = ? AND user_id = ?", enterpriseId, userId).Delete(&EnterpriseMember{})
		if res.Error != nil {
			return res.Error
		}
		if res.RowsAffected == 0 {
			return ErrEnterpriseUserNotMember
		}
		// 若该用户是当前企业的管理员，撤销
		if err := tx.Model(&User{}).Where("id = ? AND enterprise_admin_of = ?", userId, enterpriseId).Update("enterprise_admin_of", 0).Error; err != nil {
			return err
		}
		return nil
	})
}

func ListEnterpriseMembers(enterpriseId uint, keyword string, page, pageSize int) ([]User, int64, error) {
	if enterpriseId == 0 {
		return nil, 0, errors.New("invalid enterprise id")
	}
	// 用 join 取用户全字段
	q := DB.Table("enterprise_members em").
		Joins("INNER JOIN users u ON u.id = em.user_id").
		Where("em.enterprise_id = ? AND em.deleted_at IS NULL", enterpriseId)
	if keyword != "" {
		q = q.Where("u.username LIKE ? OR u.email LIKE ? OR u.display_name LIKE ?",
			"%"+keyword+"%", "%"+keyword+"%", "%"+keyword+"%")
	}
	var total int64
	if err := q.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 200 {
		pageSize = 20
	}
	users := make([]User, 0)
	err := q.Select("u.*").Order("em.joined_at DESC").
		Offset((page - 1) * pageSize).Limit(pageSize).
		Scan(&users).Error
	return users, total, err
}

// SetEnterpriseAdmin 把指定用户设为企业管理员（需先是该企业的成员），并撤销该企业其它管理员
func SetEnterpriseAdmin(enterpriseId uint, userId int) error {
	if enterpriseId == 0 || userId <= 0 {
		return errors.New("invalid params")
	}
	return DB.Transaction(func(tx *gorm.DB) error {
		// 校验用户是该企业成员
		var memberCount int64
		if err := tx.Model(&EnterpriseMember{}).Where("enterprise_id = ? AND user_id = ?", enterpriseId, userId).Count(&memberCount).Error; err != nil {
			return err
		}
		if memberCount == 0 {
			return ErrEnterpriseUserNotMember
		}
		// 撤销该企业其他管理员
		if err := tx.Model(&User{}).Where("enterprise_admin_of = ? AND id != ?", enterpriseId, userId).Update("enterprise_admin_of", 0).Error; err != nil {
			return err
		}
		// 指派
		if err := tx.Model(&User{}).Where("id = ?", userId).Update("enterprise_admin_of", enterpriseId).Error; err != nil {
			return err
		}
		// 更新 enterprises.admin_id
		return tx.Model(&Enterprise{}).Where("id = ?", enterpriseId).Update("admin_id", userId).Error
	})
}

// GetUserEnterprise 查询用户所在的企业（若有）
func GetUserEnterprise(userId int) (*Enterprise, error) {
	if userId <= 0 {
		return nil, nil
	}
	var member EnterpriseMember
	if err := DB.Where("user_id = ?", userId).First(&member).Error; err != nil {
		return nil, nil
	}
	return GetEnterpriseById(member.EnterpriseId)
}
