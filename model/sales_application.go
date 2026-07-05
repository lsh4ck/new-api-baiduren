package model

const (
	SalesAppStatusPending  = "pending"
	SalesAppStatusApproved = "approved"
	SalesAppStatusRejected = "rejected"
)

// SalesApplication 销售代理身份申请记录
// - 已归属 L1 的用户申请：inviter_id 指向 L1 销售（双向可见，admin + L1 可审批）
// - 新账号无归属：inviter_id 为 0（仅 admin 可审批）
// - 自动按邀请链算 proposed_level（无邀请 → 1, L1 邀请 → 2, L2 邀请 → 3, L3 邀请 → 拒绝）
type SalesApplication struct {
	Id            int    `json:"id" gorm:"primaryKey"`
	UserId        int    `json:"user_id" gorm:"type:int;index;column:user_id"`
	InviterId     int    `json:"inviter_id" gorm:"type:int;index;default:0;column:inviter_id"` // 申请时 snapshot
	ProposedLevel int    `json:"proposed_level" gorm:"type:int;default:0;column:proposed_level"`

	// 申请信息（仅文字资料 — 销售返佣靠客户实际充值，不需要严格 KYC）
	RealName     string `json:"real_name" gorm:"type:varchar(64);column:real_name"`             // 姓名
	Phone        string `json:"phone" gorm:"type:varchar(20);column:phone"`                    // 手机
	WechatId     string `json:"wechat_id" gorm:"type:varchar(64);column:wechat_id"`            // 微信
	SalesChannel string `json:"sales_channel" gorm:"type:varchar(200);column:sales_channel"`  // 主推平台
	Reason       string `json:"reason" gorm:"type:varchar(1000);column:reason"`                // 申请话术

	// 审批
	Status         string `json:"status" gorm:"type:varchar(20);default:pending;column:status;index"`
	ReviewedBy     int    `json:"reviewed_by" gorm:"type:int;default:0;column:reviewed_by"`
	ReviewedByName string `json:"reviewed_by_name" gorm:"type:varchar(64);column:reviewed_by_name"`
	ReviewedAt     int64  `json:"reviewed_at" gorm:"default:0;column:reviewed_at"`
	AdminRemark    string `json:"admin_remark" gorm:"type:varchar(500);column:admin_remark"`

	CreatedAt int64 `json:"created_at" gorm:"autoCreateTime;column:created_at"`

	// 关联字段（不存库，由 controller 填充用于展示）
	UserName        string `json:"user_name" gorm:"-"`
	UserEmail       string `json:"user_email" gorm:"-"`
	UserDisplayName string `json:"user_display_name" gorm:"-"`
	InviterName     string `json:"inviter_name,omitempty" gorm:"-"`
}

func CreateSalesApplication(app *SalesApplication) error {
	return DB.Create(app).Error
}

func GetSalesApplicationById(id int) (*SalesApplication, error) {
	var app SalesApplication
	if err := DB.Where("id = ?", id).First(&app).Error; err != nil {
		return nil, err
	}
	return &app, nil
}

func GetPendingApplicationByUser(userId int) (*SalesApplication, error) {
	var app SalesApplication
	err := DB.Where("user_id = ? AND status = ?", userId, SalesAppStatusPending).
		Order("id DESC").First(&app).Error
	if err != nil {
		return nil, err
	}
	return &app, nil
}

// ListAllSalesApplications admin 看全部
func ListAllSalesApplications(status string, page, size int) ([]*SalesApplication, int64, error) {
	var apps []*SalesApplication
	var total int64
	query := DB.Model(&SalesApplication{})
	if status != "" {
		query = query.Where("status = ?", status)
	}
	query.Count(&total)
	err := query.Order("id DESC").Offset((page - 1) * size).Limit(size).Find(&apps).Error
	return apps, total, err
}

// ListDownlineApplications 某个 L1/L2 销售看自己下线的申请
func ListDownlineApplications(inviterId int, status string) ([]*SalesApplication, error) {
	var apps []*SalesApplication
	query := DB.Where("inviter_id = ?", inviterId)
	if status != "" {
		query = query.Where("status = ?", status)
	}
	err := query.Order("id DESC").Find(&apps).Error
	return apps, err
}

func UpdateSalesApplication(app *SalesApplication) error {
	return DB.Save(app).Error
}
