package model

import (
	"errors"

	"gorm.io/gorm"
)

// 佣金账本：每笔佣金一条，挂到具体充值/消费来源，支持 pending→approved→paid 状态机与 clawback 冲正。
// 余额永远 = SUM(amount)，冲正用负向对冲条目实现，天然支持负数，三库通吃。

const (
	CommissionStatusPending  = "pending"  // 锁定期内
	CommissionStatusApproved = "approved" // 过锁定期，可提现
	CommissionStatusPaid     = "paid"     // 已随提现核销
	CommissionStatusClawback = "clawback" // 已冲正（退款/扣费回滚）
	CommissionStatusVoided   = "voided"   // admin 手动作废

	CommissionSourceTopup    = "topup"          // 按充值计佣
	CommissionSourceConsume  = "consume"        // 按消费计佣（日聚合）
	CommissionSourceManual   = "manual"         // admin 手动补单
	CommissionSourceClawback = "clawback_entry" // 负向冲正条目
)

type CommissionLedger struct {
	Id             int     `json:"id" gorm:"primaryKey"`
	AgentId        int     `json:"agent_id" gorm:"type:int;index:idx_cl_agent_status;column:agent_id"`
	CustomerId     int     `json:"customer_id" gorm:"type:int;index;column:customer_id"`
	Level          int     `json:"level" gorm:"type:int;default:1;column:level"`
	SourceType     string  `json:"source_type" gorm:"type:varchar(20);index;column:source_type"`
	SourceId       int64   `json:"source_id" gorm:"type:bigint;index;column:source_id"` // top_ups.id 或 logs.id（弱引用，跨库不 JOIN）
	BaseAmount     float64 `json:"base_amount" gorm:"column:base_amount"`               // 计佣基数（美元）
	Rate           float64 `json:"rate" gorm:"column:rate"`                             // 当时锁定的费率快照
	Amount         float64 `json:"amount" gorm:"column:amount"`                         // 佣金额=base*rate（冲正为负）
	Status         string  `json:"status" gorm:"type:varchar(20);default:pending;index:idx_cl_agent_status;column:status"`
	LockUntil      int64   `json:"lock_until" gorm:"type:bigint;default:0;index;column:lock_until"`
	ApprovedAt     int64   `json:"approved_at" gorm:"default:0;column:approved_at"`
	PaidAt         int64   `json:"paid_at" gorm:"default:0;column:paid_at"`
	WithdrawalId   int     `json:"withdrawal_id" gorm:"type:int;default:0;index;column:withdrawal_id"`
	ClawbackOf     int     `json:"clawback_of" gorm:"type:int;default:0;index;column:clawback_of"`
	IdempotencyKey string  `json:"idempotency_key" gorm:"type:varchar(160);uniqueIndex;column:idempotency_key"`
	Remark         string  `json:"remark" gorm:"type:varchar(500);column:remark"`
	CreatedAt      int64   `json:"created_at" gorm:"autoCreateTime;index;column:created_at"`
	UpdatedAt      int64   `json:"updated_at" gorm:"autoUpdateTime;column:updated_at"`
}

// CommissionAuditLog 记录手动补单/作废/冻结/核销等敏感操作，便于追溯。
type CommissionAuditLog struct {
	Id            int     `json:"id" gorm:"primaryKey"`
	ActorId       int     `json:"actor_id" gorm:"type:int;index;column:actor_id"`
	ActorName     string  `json:"actor_name" gorm:"type:varchar(64);column:actor_name"`
	Action        string  `json:"action" gorm:"type:varchar(40);index;column:action"`
	TargetAgentId int     `json:"target_agent_id" gorm:"type:int;index;column:target_agent_id"`
	LedgerId      int     `json:"ledger_id" gorm:"type:int;default:0;column:ledger_id"`
	AmountDelta   float64 `json:"amount_delta" gorm:"column:amount_delta"`
	Detail        string  `json:"detail" gorm:"type:varchar(500);column:detail"`
	Ip            string  `json:"ip" gorm:"type:varchar(64);column:ip"`
	CreatedAt     int64   `json:"created_at" gorm:"autoCreateTime;index;column:created_at"`
}

// ---- 插入/幂等 ----

// InsertCommissionLedgerIdempotent 幂等插入；若 idempotency_key 已存在则视为已处理返回 nil。
func InsertCommissionLedgerIdempotent(cl *CommissionLedger) error {
	err := DB.Create(cl).Error
	if err != nil {
		// 唯一键冲突（已入账）视为成功幂等
		if errors.Is(err, gorm.ErrDuplicatedKey) {
			return nil
		}
		// 兼容未映射成 ErrDuplicatedKey 的驱动：按错误文本判断
		msg := err.Error()
		if containsAny(msg, "duplicate", "Duplicate", "UNIQUE", "unique", "1062", "23505") {
			return nil
		}
		return err
	}
	return nil
}

func containsAny(s string, subs ...string) bool {
	for _, sub := range subs {
		if sub != "" && len(sub) <= len(s) && indexOf(s, sub) >= 0 {
			return true
		}
	}
	return false
}

func indexOf(s, sub string) int {
	for i := 0; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			return i
		}
	}
	return -1
}

// ---- 余额查询（ledger 为权威）----

func SumCommissionByStatus(agentId int, status string) (float64, error) {
	var sum float64
	err := DB.Model(&CommissionLedger{}).
		Where("agent_id = ? AND status = ?", agentId, status).
		Select("COALESCE(SUM(amount),0)").Scan(&sum).Error
	return sum, err
}

// GetAgentBalances 返回三态余额：pending（锁定中）、approved（可提）、paid（已提）。
func GetAgentBalances(agentId int) (pending float64, approved float64, paid float64) {
	pending, _ = SumCommissionByStatus(agentId, CommissionStatusPending)
	approved, _ = SumCommissionByStatus(agentId, CommissionStatusApproved)
	paid, _ = SumCommissionByStatus(agentId, CommissionStatusPaid)
	return
}

func GetLedgerEntries(agentId int, status string, page, size int) ([]CommissionLedger, int64, error) {
	if page < 1 {
		page = 1
	}
	if size <= 0 || size > 200 {
		size = 20
	}
	q := DB.Model(&CommissionLedger{}).Where("agent_id = ?", agentId)
	if status != "" {
		q = q.Where("status = ?", status)
	}
	var total int64
	q.Count(&total)
	var rows []CommissionLedger
	err := q.Order("id DESC").Offset((page - 1) * size).Limit(size).Find(&rows).Error
	return rows, total, err
}

func RecordCommissionAudit(a *CommissionAuditLog) {
	_ = DB.Create(a).Error
}

// OnTopupSuccessHook 充值成功回调；在 main.go 注册为 service.AccrueTopupCommission 的异步包装，
// 避免 model→service 循环依赖。所有充值成功路径(Stripe/Creem/Manual/易支付)统一调用 FireTopupSuccess。
var OnTopupSuccessHook func(topupId int64, customerId int, moneyUSD float64)

func FireTopupSuccess(topupId int64, customerId int, moneyUSD float64) {
	if OnTopupSuccessHook != nil {
		OnTopupSuccessHook(topupId, customerId, moneyUSD)
	}
}
