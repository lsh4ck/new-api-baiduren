package service

import (
	"fmt"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
)

// 销售佣金账本服务：充值/消费时沿 inviter 链生成佣金条目(ledger)，支持锁定期、clawback、自邀检测。
// 计佣模型【叠加全返】：客户每笔业务沿 inviter 链上溯最多 3 层销售，每层销售按【自己的档位率】全额计佣：
//   - 1档(admin直接指派) = 5% / 2档(1档发展) = 3% / 3档(2档发展) = 3%（commission_rate>0 则个性化覆盖）
//   - 3 档封顶，3档销售不能再发展下级销售(AdminSetAgentLevel/computeAgentLevelByInviter 已硬限)
//   - 例:客户(3档直接发展)消费$100 → 3档+$3、2档+$3、1档+$5，共$11
// 口径与 controller/agent.go 的 computeEstimatedCommission 保持一致(全部下游业务 × 自己档位率)。

// selfRate 返回销售本人对直接客户的提成率(与 controller/agent.go computeSelfRate 同口径)。
func selfRate(agentLevel int, commissionRate float64) float64 {
	if commissionRate > 0 {
		return commissionRate
	}
	switch agentLevel {
	case 1:
		return common.SalesL1CommissionRate
	case 2:
		return common.SalesL2CommissionRate
	case 3:
		return common.SalesL3CommissionRate
	}
	return 0
}

// isAgent 是否视为销售(可计佣)。agent_level>0 或 is_sales 均算。
func isAgent(u *model.User) bool {
	return u != nil && (u.AgentLevel > 0 || u.IsSales)
}

// AccrueTopupCommission 充值成功后入账：沿 customer 的 inviter 链上溯最多 3 层，
// 为每层的销售生成一条 pending 佣金。幂等(idempotency_key 唯一)。失败仅记日志，不影响主流程。
func AccrueTopupCommission(topupId int64, customerId int, moneyUSD float64) {
	defer func() {
		if r := recover(); r != nil {
			common.SysError(fmt.Sprintf("AccrueTopupCommission panic: %v", r))
		}
	}()
	if common.SalesCommissionMode == "consume" {
		return // 纯消费计佣模式不按充值计
	}
	if moneyUSD <= 0 || customerId <= 0 {
		return
	}
	lockUntil := time.Now().Unix() + int64(common.SalesLockDays)*86400
	curId := customerId
	for level := 1; level <= 3; level++ {
		cur, err := model.GetUserById(curId, false)
		if err != nil || cur == nil || cur.InviterId <= 0 {
			break
		}
		inviter, err := model.GetUserById(cur.InviterId, false)
		if err != nil || inviter == nil {
			break
		}
		curId = inviter.Id
		if !isAgent(inviter) {
			continue // 该层不是销售，继续上溯
		}
		if inviter.CommissionFrozen {
			continue // 黑名单冻结：不入账
		}
		// 叠加全返：每级销售按自己档位率(1档5%/2档3%/3档3%，或个性化覆盖)全额计佣
		rate := applyTierReward(inviter.Id, selfRate(inviter.AgentLevel, inviter.CommissionRate))
		if rate <= 0 {
			continue
		}
		cl := &model.CommissionLedger{
			AgentId:        inviter.Id,
			CustomerId:     customerId,
			Level:          level,
			SourceType:     model.CommissionSourceTopup,
			SourceId:       topupId,
			BaseAmount:     moneyUSD,
			Rate:           rate,
			Amount:         moneyUSD * rate,
			Status:         model.CommissionStatusPending,
			LockUntil:      lockUntil,
			IdempotencyKey: fmt.Sprintf("topup:%d:agent:%d", topupId, inviter.Id),
		}
		if err := model.InsertCommissionLedgerIdempotent(cl); err != nil {
			common.SysError(fmt.Sprintf("AccrueTopupCommission insert err agent=%d topup=%d: %s", inviter.Id, topupId, err.Error()))
		}
	}
}

// AccrueConsumeCommissionDaily 按客户×日聚合的消费计佣(consume/both 模式)。由定时任务调用，避免逐条爆量。
// dayKey 形如 20260601，consumeUSD 为该客户当日消费折美元。
func AccrueConsumeCommissionDaily(customerId int, dayKey string, consumeUSD float64) {
	if common.SalesCommissionMode == "topup" {
		return
	}
	if consumeUSD <= 0 || customerId <= 0 {
		return
	}
	lockUntil := time.Now().Unix() + int64(common.SalesLockDays)*86400
	curId := customerId
	for level := 1; level <= 3; level++ {
		cur, err := model.GetUserById(curId, false)
		if err != nil || cur == nil || cur.InviterId <= 0 {
			break
		}
		inviter, err := model.GetUserById(cur.InviterId, false)
		if err != nil || inviter == nil {
			break
		}
		curId = inviter.Id
		if !isAgent(inviter) || inviter.CommissionFrozen {
			continue
		}
		// 叠加全返：每级销售按自己档位率(1档5%/2档3%/3档3%，或个性化覆盖)全额计佣
		rate := applyTierReward(inviter.Id, selfRate(inviter.AgentLevel, inviter.CommissionRate))
		if rate <= 0 {
			continue
		}
		cl := &model.CommissionLedger{
			AgentId:        inviter.Id,
			CustomerId:     customerId,
			Level:          level,
			SourceType:     model.CommissionSourceConsume,
			BaseAmount:     consumeUSD,
			Rate:           rate,
			Amount:         consumeUSD * rate,
			Status:         model.CommissionStatusPending,
			LockUntil:      lockUntil,
			IdempotencyKey: fmt.Sprintf("consume:%d:%s:agent:%d", customerId, dayKey, inviter.Id),
		}
		if err := model.InsertCommissionLedgerIdempotent(cl); err != nil {
			common.SysError(fmt.Sprintf("AccrueConsumeCommissionDaily insert err: %s", err.Error()))
		}
	}
}

// ClawbackBySource 退款/扣费回滚时，对来源对应的 pending/approved 佣金冲正(插入负向对冲条目)。
func ClawbackBySource(sourceType string, sourceId int64, reason string) {
	var rows []model.CommissionLedger
	model.DB.Where("source_type = ? AND source_id = ? AND status IN ?",
		sourceType, sourceId, []string{model.CommissionStatusPending, model.CommissionStatusApproved, model.CommissionStatusPaid}).
		Find(&rows)
	now := time.Now().Unix()
	for _, r := range rows {
		neg := &model.CommissionLedger{
			AgentId:        r.AgentId,
			CustomerId:     r.CustomerId,
			Level:          r.Level,
			SourceType:     model.CommissionSourceClawback,
			SourceId:       sourceId,
			BaseAmount:     -r.BaseAmount,
			Rate:           r.Rate,
			Amount:         -r.Amount,
			Status:         model.CommissionStatusClawback,
			ClawbackOf:     r.Id,
			Remark:         "clawback: " + reason,
			IdempotencyKey: fmt.Sprintf("clawback:%d", r.Id),
		}
		_ = model.InsertCommissionLedgerIdempotent(neg)
		// 原条目置 clawback(已 paid 的也标记，负余额从后续佣金扣回)
		model.DB.Model(&model.CommissionLedger{}).Where("id = ?", r.Id).
			Updates(map[string]any{"status": model.CommissionStatusClawback, "updated_at": now})
		if r.Status == model.CommissionStatusPaid {
			model.RecordCommissionAudit(&model.CommissionAuditLog{
				Action: "clawback_paid", TargetAgentId: r.AgentId, LedgerId: r.Id,
				AmountDelta: -r.Amount, Detail: "已提现佣金被冲正,产生应收回款: " + reason,
			})
		}
	}
}

// CheckSelfInvite 注册后比对新用户与邀请人的注册指纹，命中(同IP/设备)则标记 fraud_flag=1(不自动封)。
func CheckSelfInvite(newUserId, inviterId int, regIp, regDevice, email string) {
	if !common.SalesFraudCheckEnabled || inviterId <= 0 {
		return
	}
	inviter, err := model.GetUserById(inviterId, false)
	if err != nil || inviter == nil {
		return
	}
	suspicious := false
	if regIp != "" && inviter.RegisterIp == regIp {
		suspicious = true
	}
	if regDevice != "" && inviter.RegisterDevice == regDevice {
		suspicious = true
	}
	if email != "" && inviter.Email != "" && strings.EqualFold(email, inviter.Email) {
		suspicious = true
	}
	if suspicious {
		model.DB.Model(&model.User{}).Where("id = ?", newUserId).Update("fraud_flag", 1)
		model.RecordCommissionAudit(&model.CommissionAuditLog{
			Action: "fraud_flag_self_invite", TargetAgentId: inviterId,
			Detail: fmt.Sprintf("疑似自邀: 新用户#%d 与邀请人#%d 注册指纹相同(IP/设备/邮箱)", newUserId, inviterId),
			Ip:     regIp,
		})
	}
}

// BackfillTopupCommissions 从历史成功充值回填账本：生成 approved 条目(幂等)，并把已提现额核销为 paid。
// 仅在切 ledger 读取(SalesLedgerReadEnabled)前跑一次。返回新增条目数。
func BackfillTopupCommissions() int {
	defer func() {
		if r := recover(); r != nil {
			common.SysError(fmt.Sprintf("BackfillTopupCommissions panic: %v", r))
		}
	}()
	now := time.Now().Unix()
	created := 0
	// 分批扫历史成功充值
	var lastId int = 0
	for {
		var tops []model.TopUp
		if err := model.DB.Where("id > ? AND status = ?", lastId, common.TopUpStatusSuccess).
			Order("id ASC").Limit(500).Find(&tops).Error; err != nil || len(tops) == 0 {
			break
		}
		for _, t := range tops {
			lastId = t.Id
			if t.Money <= 0 {
				continue
			}
			curId := t.UserId
			for level := 1; level <= 3; level++ {
				cur, err := model.GetUserById(curId, false)
				if err != nil || cur == nil || cur.InviterId <= 0 {
					break
				}
				inviter, err := model.GetUserById(cur.InviterId, false)
				if err != nil || inviter == nil {
					break
				}
				curId = inviter.Id
				if !isAgent(inviter) || inviter.CommissionFrozen {
					continue
				}
				rate := selfRate(inviter.AgentLevel, inviter.CommissionRate)
				if rate <= 0 {
					continue
				}
				cl := &model.CommissionLedger{
					AgentId: inviter.Id, CustomerId: t.UserId, Level: level,
					SourceType: model.CommissionSourceTopup, SourceId: int64(t.Id),
					BaseAmount: t.Money, Rate: rate, Amount: t.Money * rate,
					Status: model.CommissionStatusApproved, ApprovedAt: now, LockUntil: now,
					Remark:         "backfill",
					IdempotencyKey: fmt.Sprintf("topup:%d:agent:%d", t.Id, inviter.Id),
				}
				// Create 直接用(幂等靠唯一键)；已存在(被 live accrual 抢先)则跳过
				if err := model.DB.Create(cl).Error; err == nil {
					created++
				}
			}
		}
		if len(tops) < 500 {
			break
		}
	}
	// 核销已提现：每个销售已 approved 的提现额，从其 approved 账本 FIFO 标 paid，避免可用额虚高
	var agentIds []int
	model.DB.Model(&model.CommissionLedger{}).Distinct("agent_id").Pluck("agent_id", &agentIds)
	for _, aid := range agentIds {
		withdrawn, _ := model.SumApprovedWithdrawals(aid)
		if withdrawn <= 0 {
			continue
		}
		var entries []model.CommissionLedger
		model.DB.Where("agent_id = ? AND status = ?", aid, model.CommissionStatusApproved).
			Order("id ASC").Find(&entries)
		remaining := withdrawn
		for _, e := range entries {
			if remaining <= 0 {
				break
			}
			model.DB.Model(&model.CommissionLedger{}).Where("id = ?", e.Id).
				Updates(map[string]any{"status": model.CommissionStatusPaid, "paid_at": now})
			remaining -= e.Amount
		}
	}
	common.SysLog(fmt.Sprintf("BackfillTopupCommissions done: created=%d", created))
	return created
}

// applyTierReward 阶梯冲量奖励：销售累计已确认佣金达阈值则费率升档。SalesTierRewardJSON 空则原样返回。
func applyTierReward(agentId int, baseRate float64) float64 {
	cfg := strings.TrimSpace(common.SalesTierRewardJSON)
	if cfg == "" || cfg == "[]" {
		return baseRate
	}
	var tiers []struct {
		Threshold float64 `json:"threshold"`
		Rate      float64 `json:"rate"`
	}
	if err := common.Unmarshal([]byte(cfg), &tiers); err != nil || len(tiers) == 0 {
		return baseRate
	}
	// 销售累计 approved+paid 佣金作为冲量基数
	approved, _ := model.SumCommissionByStatus(agentId, model.CommissionStatusApproved)
	paid, _ := model.SumCommissionByStatus(agentId, model.CommissionStatusPaid)
	cum := approved + paid
	best := baseRate
	for _, t := range tiers {
		if cum >= t.Threshold && t.Rate > best {
			best = t.Rate
		}
	}
	return best
}
