package model

import (
	"errors"
	"time"

	"gorm.io/gorm"
)

// WorkGroup 一个企业内的工作组
type WorkGroup struct {
	Id           uint           `json:"id" gorm:"primaryKey"`
	EnterpriseId uint           `json:"enterprise_id" gorm:"index;not null"`
	Name         string         `json:"name" gorm:"size:128;not null"`
	Description  string         `json:"description" gorm:"size:512;default:''"`
	CreatedAt    time.Time      `json:"created_at"`
	UpdatedAt    time.Time      `json:"updated_at"`
	DeletedAt    gorm.DeletedAt `gorm:"index" json:"-"`
}

func (WorkGroup) TableName() string { return "work_groups" }

// WorkGroupMember 工作组成员（一个用户只能在一个工作组）
type WorkGroupMember struct {
	Id          uint `json:"id" gorm:"primaryKey"`
	WorkGroupId uint `json:"workgroup_id" gorm:"index;not null"`
	// UserId 唯一性由 partial unique index (uniq_work_group_members_user_active WHERE deleted_at IS NULL) 保证
	UserId    int            `json:"user_id" gorm:"not null;index"`
	JoinedAt  time.Time      `json:"joined_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`
}

func (WorkGroupMember) TableName() string { return "work_group_members" }

var (
	ErrWorkGroupNotFound       = errors.New("工作组不存在")
	ErrWorkGroupNotInThisEnt   = errors.New("工作组不属于该企业")
	ErrWorkGroupUserHasOther   = errors.New("用户已在其他工作组")
	ErrWorkGroupMemberNotFound = errors.New("用户不在该工作组")
	ErrWorkGroupMemberNotInEnt = errors.New("用户不在该企业中")
)

// === WorkGroup CRUD ===

func CreateWorkGroup(g *WorkGroup) error {
	if g.EnterpriseId == 0 || g.Name == "" {
		return errors.New("invalid params")
	}
	return DB.Create(g).Error
}

func GetWorkGroupById(id uint) (*WorkGroup, error) {
	var g WorkGroup
	if err := DB.First(&g, id).Error; err != nil {
		return nil, ErrWorkGroupNotFound
	}
	return &g, nil
}

func ListWorkGroupsByEnterprise(enterpriseId uint) ([]WorkGroup, error) {
	rows := make([]WorkGroup, 0)
	err := DB.Where("enterprise_id = ?", enterpriseId).Order("id ASC").Find(&rows).Error
	return rows, err
}

func UpdateWorkGroup(g *WorkGroup) error {
	return DB.Save(g).Error
}

func DeleteWorkGroup(id uint) error {
	return DB.Transaction(func(tx *gorm.DB) error {
		// 清空成员
		if err := tx.Where("work_group_id = ?", id).Delete(&WorkGroupMember{}).Error; err != nil {
			return err
		}
		// 删除该工作组的限额
		if err := tx.Where("scope_type = ? AND scope_id = ?", LimitScopeWorkGroup, id).Delete(&EnterpriseLimit{}).Error; err != nil {
			return err
		}
		return tx.Delete(&WorkGroup{}, id).Error
	})
}

// === WorkGroupMember CRUD ===

// AddWorkGroupMember 把用户加入工作组。前提：用户必须是该工作组所属企业的成员。
// 一个用户只能在一个工作组（partial unique 保证）。软删历史记录不挡新插入。
func AddWorkGroupMember(workgroupId uint, userId int) error {
	if workgroupId == 0 || userId <= 0 {
		return errors.New("invalid params")
	}
	wg, err := GetWorkGroupById(workgroupId)
	if err != nil {
		return err
	}
	// 校验用户是该企业的成员
	var entMember EnterpriseMember
	if err := DB.Where("user_id = ? AND enterprise_id = ?", userId, wg.EnterpriseId).First(&entMember).Error; err != nil {
		return ErrWorkGroupMemberNotInEnt
	}
	// active 记录检查
	var existing WorkGroupMember
	err = DB.Where("user_id = ?", userId).First(&existing).Error
	if err == nil && existing.Id != 0 {
		if existing.WorkGroupId == workgroupId {
			return nil
		}
		return ErrWorkGroupUserHasOther
	}
	// 清理软删历史避免 partial unique 之外其他冲突
	_ = DB.Unscoped().Where("user_id = ? AND deleted_at IS NOT NULL", userId).Delete(&WorkGroupMember{}).Error

	return DB.Create(&WorkGroupMember{
		WorkGroupId: workgroupId,
		UserId:      userId,
		JoinedAt:    time.Now(),
	}).Error
}

func RemoveWorkGroupMember(workgroupId uint, userId int) error {
	if workgroupId == 0 || userId <= 0 {
		return errors.New("invalid params")
	}
	res := DB.Where("work_group_id = ? AND user_id = ?", workgroupId, userId).Delete(&WorkGroupMember{})
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return ErrWorkGroupMemberNotFound
	}
	return nil
}

// ListWorkGroupMembers 列出某工作组的用户
func ListWorkGroupMembers(workgroupId uint) ([]User, error) {
	users := make([]User, 0)
	err := DB.Table("work_group_members wm").
		Joins("INNER JOIN users u ON u.id = wm.user_id").
		Where("wm.work_group_id = ? AND wm.deleted_at IS NULL", workgroupId).
		Select("u.*").
		Order("wm.joined_at DESC").
		Scan(&users).Error
	return users, err
}

// GetUserWorkGroup 查询用户所在的工作组（若有）
func GetUserWorkGroup(userId int) (*WorkGroup, error) {
	var member WorkGroupMember
	if err := DB.Where("user_id = ?", userId).First(&member).Error; err != nil {
		return nil, nil
	}
	return GetWorkGroupById(member.WorkGroupId)
}
