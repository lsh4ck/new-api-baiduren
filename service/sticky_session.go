package service

import (
	"fmt"

	"github.com/QuantumNous/new-api/model"
)

// GetStickyAccountForRequest 根据 API Key 和平台获取粘性账号
// 这是 subscription_pool.go 中 GetStickyAccount 的简化版本，
// 专用于中继请求场景 (通过 token 的 key 来识别用户)
func GetStickyAccountForRequest(apiKey string, platform string) (*model.SubscriptionAccount, error) {
	// 1. 查找已有的粘性会话
	var sticky model.StickySession
	err := model.DB.Where("api_key = ? AND platform = ?", apiKey, platform).First(&sticky).Error
	if err == nil {
		// 找到已有记录
		account, err := model.GetSubscriptionAccountByID(sticky.AccountID)
		if err != nil {
			// 账号已被删除，清除记录
			_ = model.DB.Delete(&sticky).Error
			return nil, fmt.Errorf("粘性账号已失效")
		}
		if account.Status != "active" {
			// 账号不可用
			return nil, fmt.Errorf("粘性账号状态异常: %s", account.Status)
		}
		// 更新最后分配时间
		_ = model.DB.Model(&sticky).Update("last_assigned", model.DB.NowFunc())
		return account, nil
	}

	return nil, fmt.Errorf("未找到粘性会话记录，请先通过 /v1/subscription/bind 绑定账号")
}

// AssignStickyAccountForRequest 为请求分配粘性账号 (不存在则创建)
func AssignStickyAccountForRequest(userID uint, apiKey string, platform string, groupID uint) (*model.SubscriptionAccount, error) {
	return GetStickyAccount(userID, platform, apiKey, groupID)
}
