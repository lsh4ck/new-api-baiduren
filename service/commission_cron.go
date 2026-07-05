package service

import (
	"fmt"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
)

// RunConsumeCommissionDaily 按消费计佣的日聚合任务：每天把"昨日"每个客户的消费(logs type=2)折美元，
// 调 AccrueConsumeCommissionDaily 沿 inviter 链入账。幂等(consume:{cust}:{day}:agent)，重复跑安全。
// 仅 mode=consume/both 生效；mode=topup 时整体跳过(零开销)。每 2 小时检查一次(重复处理昨日靠幂等去重)。
func RunConsumeCommissionDaily() {
	for {
		time.Sleep(2 * time.Hour)
		func() {
			defer func() {
				if r := recover(); r != nil {
					common.SysError(fmt.Sprintf("RunConsumeCommissionDaily panic: %v", r))
				}
			}()
			if common.SalesCommissionMode == "topup" {
				return
			}
			now := time.Now()
			y := now.AddDate(0, 0, -1)
			dayKey := y.Format("20060102")
			start := time.Date(y.Year(), y.Month(), y.Day(), 0, 0, 0, 0, now.Location()).Unix()
			end := start + 86400
			type row struct {
				UserId int
				Q      int64
			}
			var rows []row
			model.LOG_DB.Model(&model.Log{}).
				Select("user_id, COALESCE(SUM(quota),0) as q").
				Where("type = ? AND created_at >= ? AND created_at < ?", 2, start, end).
				Group("user_id").Scan(&rows)
			n := 0
			for _, r := range rows {
				if r.Q <= 0 || common.QuotaPerUnit <= 0 {
					continue
				}
				usd := float64(r.Q) / common.QuotaPerUnit
				AccrueConsumeCommissionDaily(r.UserId, dayKey, usd)
				n++
			}
			if n > 0 {
				common.SysLog(fmt.Sprintf("consume commission daily(%s): 处理 %d 个客户消费", dayKey, n))
			}
		}()
	}
}

// RunCommissionMaturer 锁定期到期任务：pending 满锁定期且(客户非待审fraud + 销售非冻结)→ approved。
// 仅主节点启动，每小时跑一次足矣。
func RunCommissionMaturer() {
	for {
		time.Sleep(time.Hour)
		func() {
			defer func() {
				if r := recover(); r != nil {
					common.SysError(fmt.Sprintf("RunCommissionMaturer panic: %v", r))
				}
			}()
			now := time.Now().Unix()
			fraudCustomers := model.DB.Model(&model.User{}).Select("id").Where("fraud_flag = ?", 1)
			frozenAgents := model.DB.Model(&model.User{}).Select("id").Where("commission_frozen = ?", true)
			res := model.DB.Model(&model.CommissionLedger{}).
				Where("status = ? AND lock_until > 0 AND lock_until <= ?", model.CommissionStatusPending, now).
				Where("customer_id NOT IN (?)", fraudCustomers).
				Where("agent_id NOT IN (?)", frozenAgents).
				Updates(map[string]any{"status": model.CommissionStatusApproved, "approved_at": now})
			if res.Error != nil {
				common.SysError("RunCommissionMaturer update err: " + res.Error.Error())
			} else if res.RowsAffected > 0 {
				common.SysLog(fmt.Sprintf("commission maturer: %d 条佣金转 approved", res.RowsAffected))
			}
		}()
	}
}
