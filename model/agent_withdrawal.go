package model

const (
	WithdrawalStatusPending  = "pending"
	WithdrawalStatusApproved = "approved"
	WithdrawalStatusRejected = "rejected"
)

// AgentWithdrawal 代理提现申请
type AgentWithdrawal struct {
	Id          int     `json:"id" gorm:"primaryKey"`
	AgentId     int     `json:"agent_id" gorm:"type:int;index;column:agent_id"`
	Amount      float64 `json:"amount" gorm:"type:real;column:amount"`                  // 申请金额
	Status      string  `json:"status" gorm:"type:varchar(20);default:pending;column:status"` // pending/approved/rejected
	Remark      string  `json:"remark" gorm:"type:varchar(500);column:remark"`          // 代理备注（收款信息等）
	AdminRemark string  `json:"admin_remark" gorm:"type:varchar(500);column:admin_remark"` // 管理员审核备注
	CreatedAt   int64   `json:"created_at" gorm:"autoCreateTime;column:created_at"`
	ProcessedAt int64   `json:"processed_at" gorm:"default:0;column:processed_at"`
	PaidAt      int64   `json:"paid_at" gorm:"default:0;column:paid_at"`              // 标记 paid/核销时间
	Cycle       string  `json:"cycle" gorm:"type:varchar(20);default:'';column:cycle"` // 结算周期标识

	// 关联字段（不存库）
	AgentName  string `json:"agent_name" gorm:"-"`
	AgentEmail string `json:"agent_email" gorm:"-"`
}

func CreateWithdrawal(w *AgentWithdrawal) error {
	return DB.Create(w).Error
}

func GetWithdrawalById(id int) (*AgentWithdrawal, error) {
	var w AgentWithdrawal
	err := DB.Where("id = ?", id).First(&w).Error
	return &w, err
}

func GetWithdrawalsByAgent(agentId, page, pageSize int) ([]AgentWithdrawal, int64, error) {
	var list []AgentWithdrawal
	var total int64
	query := DB.Model(&AgentWithdrawal{}).Where("agent_id = ?", agentId)
	query.Count(&total)
	offset := (page - 1) * pageSize
	err := query.Order("created_at DESC").Offset(offset).Limit(pageSize).Find(&list).Error
	return list, total, err
}

func GetAllWithdrawals(status string, page, pageSize int) ([]AgentWithdrawal, int64, error) {
	var list []AgentWithdrawal
	var total int64
	query := DB.Model(&AgentWithdrawal{})
	if status != "" {
		query = query.Where("status = ?", status)
	}
	query.Count(&total)
	offset := (page - 1) * pageSize
	err := query.Order("created_at DESC").Offset(offset).Limit(pageSize).Find(&list).Error
	if err != nil {
		return nil, 0, err
	}
	// 填充代理信息
	agentIds := make([]int, 0, len(list))
	for _, w := range list {
		agentIds = append(agentIds, w.AgentId)
	}
	var agents []User
	DB.Select("id, username, email").Where("id IN ?", agentIds).Find(&agents)
	agentMap := make(map[int]User, len(agents))
	for _, a := range agents {
		agentMap[a.Id] = a
	}
	for i := range list {
		if a, ok := agentMap[list[i].AgentId]; ok {
			list[i].AgentName = a.Username
			list[i].AgentEmail = a.Email
		}
	}
	return list, total, nil
}

func UpdateWithdrawalStatus(id int, status, adminRemark string, processedAt int64) error {
	return DB.Model(&AgentWithdrawal{}).Where("id = ?", id).Updates(map[string]interface{}{
		"status":       status,
		"admin_remark": adminRemark,
		"processed_at": processedAt,
	}).Error
}

// SumApprovedWithdrawals 已通过的提现总额
func SumApprovedWithdrawals(agentId int) (float64, error) {
	var total float64
	err := DB.Model(&AgentWithdrawal{}).
		Where("agent_id = ? AND status = ?", agentId, WithdrawalStatusApproved).
		Select("COALESCE(SUM(amount), 0)").Scan(&total).Error
	return total, err
}
