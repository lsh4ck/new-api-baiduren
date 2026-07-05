package model

const (
	AuditResultSuccess = "success"
	AuditResultFailure = "failure"
	AuditResultDenied  = "denied"
)

// EnterpriseAuditLog 企业操作审计日志
type EnterpriseAuditLog struct {
	Id           int    `json:"id" gorm:"primaryKey"`
	EnterpriseId uint   `json:"enterprise_id" gorm:"index;column:enterprise_id;default:0"`
	ActorId      int    `json:"actor_id" gorm:"index;column:actor_id"`
	ActorName    string `json:"actor_name" gorm:"size:100;column:actor_name"`
	ActorEmail   string `json:"actor_email" gorm:"size:200;column:actor_email"`
	EventType    string `json:"event_type" gorm:"size:60;index;column:event_type"`
	Resource     string `json:"resource" gorm:"size:50;column:resource"`
	ResourceId   string `json:"resource_id" gorm:"size:100;column:resource_id"`
	Result       string `json:"result" gorm:"size:20;column:result"`
	Ip           string `json:"ip" gorm:"size:50;column:ip"`
	Detail       string `json:"detail" gorm:"type:text;column:detail"`
	CreatedAt    int64  `json:"created_at" gorm:"autoCreateTime;index;column:created_at"`
}

func InsertAuditLog(log *EnterpriseAuditLog) {
	DB.Create(log)
}

// GetAuditLogs 按企业 ID 过滤查询审计日志（enterpriseId=0 时返回全部，仅 root 内部用）
func GetAuditLogs(enterpriseId uint, eventType, result string, page, pageSize int) ([]EnterpriseAuditLog, int64, error) {
	var list []EnterpriseAuditLog
	var total int64
	q := DB.Model(&EnterpriseAuditLog{})
	if enterpriseId > 0 {
		q = q.Where("enterprise_id = ?", enterpriseId)
	}
	if eventType != "" {
		q = q.Where("event_type LIKE ?", eventType+"%")
	}
	if result != "" {
		q = q.Where("result = ?", result)
	}
	q.Count(&total)
	offset := (page - 1) * pageSize
	err := q.Order("created_at DESC").Offset(offset).Limit(pageSize).Find(&list).Error
	return list, total, err
}
