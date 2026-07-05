package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
)

// ─── 调度器 ─────────────────────────────────────────────────────────────────

// SelectAccount 智能账号选择（优先级 + 跳过限流/过载 + 回退限流账号）
func SelectAccount(platform string, groupID uint) (*model.SubscriptionAccount, error) {
	accounts, err := model.GetSchedulableAccounts(platform, groupID)
	if err != nil {
		return nil, fmt.Errorf("获取账号列表失败: %w", err)
	}
	if len(accounts) == 0 {
		return nil, fmt.Errorf("平台 %s 分组 %d 暂无可用账号", platform, groupID)
	}

	// 分两组：非限流 / 限流中（限流中的作为备用）
	var normal, rateLimited []model.SubscriptionAccount
	for _, a := range accounts {
		if a.IsRateLimited() {
			rateLimited = append(rateLimited, a)
		} else {
			normal = append(normal, a)
		}
	}

	// 选非限流组中优先级最高（priority 最小）、用量最少的
	candidates := normal
	if len(candidates) == 0 {
		candidates = rateLimited // 全被限流时只能用限流账号
	}
	if len(candidates) == 0 {
		return nil, fmt.Errorf("平台 %s 所有账号均不可用", platform)
	}

	sort.Slice(candidates, func(i, j int) bool {
		if candidates[i].Priority != candidates[j].Priority {
			return candidates[i].Priority < candidates[j].Priority
		}
		return candidates[i].UsedThisMonth < candidates[j].UsedThisMonth
	})

	selected := &candidates[0]
	// 额度检查
	if selected.UsageLimit > 0 && selected.UsedThisMonth >= selected.UsageLimit {
		return nil, errors.New("所有账号额度已用完")
	}
	return selected, nil
}

// GetAccountForPlatform 兼容旧调用
func GetAccountForPlatform(platform string, groupID uint) (*model.SubscriptionAccount, error) {
	return SelectAccount(platform, groupID)
}

// SelectNextAccount 故障转移：排除指定账号，选下一个
func SelectNextAccount(platform string, groupID uint, excludeIDs []uint) (*model.SubscriptionAccount, error) {
	accounts, err := model.GetSchedulableAccounts(platform, groupID)
	if err != nil {
		return nil, err
	}

	excludeSet := make(map[uint]bool, len(excludeIDs))
	for _, id := range excludeIDs {
		excludeSet[id] = true
	}

	var candidates []model.SubscriptionAccount
	for _, a := range accounts {
		if !excludeSet[a.ID] && !a.IsRateLimited() {
			candidates = append(candidates, a)
		}
	}
	if len(candidates) == 0 {
		return nil, errors.New("故障转移：无更多可用账号")
	}
	sort.Slice(candidates, func(i, j int) bool {
		if candidates[i].Priority != candidates[j].Priority {
			return candidates[i].Priority < candidates[j].Priority
		}
		return candidates[i].UsedThisMonth < candidates[j].UsedThisMonth
	})
	return &candidates[0], nil
}

// HandleUpstreamError 处理上游错误码，记录限流/过载状态
func HandleUpstreamError(accountID uint, statusCode int) {
	bg := context.Background()
	switch statusCode {
	case http.StatusTooManyRequests: // 429 - 限流，默认 1 分钟后恢复
		resetAt := time.Now().Add(60 * time.Second)
		_ = model.MarkAccountRateLimited(accountID, resetAt)
		logger.LogInfo(bg, fmt.Sprintf("sub2api: account %d rate limited (429), reset at %v", accountID, resetAt))
	case 529: // 529 - 过载，默认 5 分钟后恢复
		until := time.Now().Add(5 * time.Minute)
		_ = model.MarkAccountOverloaded(accountID, until)
		logger.LogInfo(bg, fmt.Sprintf("sub2api: account %d overloaded (529), until %v", accountID, until))
	case http.StatusUnauthorized, http.StatusForbidden: // 401/403 - 凭据失效
		_ = model.DB.Model(&model.SubscriptionAccount{}).Where("id = ?", accountID).
			Update("status", model.SubAccountStatusError).Error
		logger.LogInfo(bg, fmt.Sprintf("sub2api: account %d credential error (%d)", accountID, statusCode))
	}
}

// ─── 粘性会话 ─────────────────────────────────────────────────────────────

// GetStickyAccount 获取粘性会话对应的账号，不存在则分配新的
func GetStickyAccount(userID uint, platform string, apiKey string, groupID uint) (*model.SubscriptionAccount, error) {
	var sticky model.StickySession
	err := model.DB.Where("api_key = ? AND platform = ?", apiKey, platform).First(&sticky).Error
	if err == nil {
		account, err := model.GetSubscriptionAccountByID(sticky.AccountID)
		if err != nil || !account.IsSchedulable() {
			// 账号失效，清除粘性记录
			_ = model.DB.Delete(&sticky)
			return assignNewStickyAccount(userID, platform, apiKey, groupID)
		}
		_ = model.DB.Model(&sticky).Update("last_assigned", time.Now())
		return account, nil
	}
	return assignNewStickyAccount(userID, platform, apiKey, groupID)
}

func assignNewStickyAccount(userID uint, platform, apiKey string, groupID uint) (*model.SubscriptionAccount, error) {
	account, err := SelectAccount(platform, groupID)
	if err != nil {
		return nil, err
	}
	sticky := model.StickySession{
		UserID: userID, APIKey: apiKey, AccountID: account.ID,
		Platform: platform, GroupID: groupID, LastAssigned: time.Now(),
	}
	if err := model.DB.Create(&sticky).Error; err != nil {
		if strings.Contains(err.Error(), "unique") || strings.Contains(err.Error(), "duplicate") {
			return GetStickyAccount(userID, platform, apiKey, groupID)
		}
		return nil, err
	}
	return account, nil
}

// ResetStickyAccount 重置粘性会话
func ResetStickyAccount(apiKey, platform string) error {
	return model.DB.Where("api_key = ? AND platform = ?", apiKey, platform).
		Delete(&model.StickySession{}).Error
}

// ─── Token 刷新 ──────────────────────────────────────────────────────────

// RefreshAccountToken 刷新账号 token
func RefreshAccountToken(account *model.SubscriptionAccount, proxyURL string) error {
	if account.RefreshToken == "" {
		return errors.New("refresh_token 为空，无法刷新")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	var result *CodexOAuthTokenResult
	var refreshErr error

	switch strings.ToLower(account.Platform) {
	case model.SubPlatformCodex, model.SubPlatformClaude:
		result, refreshErr = RefreshCodexOAuthTokenWithProxy(ctx, account.RefreshToken, proxyURL)
	case model.SubPlatformGemini:
		result, refreshErr = refreshGeminiTokenWithProxy(ctx, account.RefreshToken, proxyURL)
	default:
		return fmt.Errorf("不支持的平台: %s", account.Platform)
	}

	if refreshErr != nil {
		return fmt.Errorf("刷新 token 失败: %w", refreshErr)
	}

	if err := model.UpdateAccountToken(account.ID, result.AccessToken, result.RefreshToken, result.ExpiresAt); err != nil {
		return fmt.Errorf("更新 token 失败: %w", err)
	}
	account.AccessToken = result.AccessToken
	account.RefreshToken = result.RefreshToken
	account.ExpiresAt = result.ExpiresAt
	return nil
}

// ─── 模型路由 ────────────────────────────────────────────────────────────

// RouteModel 根据分组配置做模型路由
func RouteModel(groupID uint, requestedModel string) string {
	if groupID == 0 || requestedModel == "" {
		return requestedModel
	}
	group, err := model.GetSubscriptionGroupByID(groupID)
	if err != nil || group.ModelRouting == "" {
		return requestedModel
	}
	var routing map[string]string
	if err := json.Unmarshal([]byte(group.ModelRouting), &routing); err != nil {
		return requestedModel
	}
	if mapped, ok := routing[requestedModel]; ok && mapped != "" {
		return mapped
	}
	return requestedModel
}

// ─── MCP XML 注入 ────────────────────────────────────────────────────────

const mcpXMLSystemPrompt = `<mcp_tools_available>
You have access to MCP (Model Context Protocol) tools. Use them when appropriate.
</mcp_tools_available>`

// InjectMCPXML 向 Claude 请求的 system prompt 注入 MCP XML
func InjectMCPXML(body []byte, groupID uint) []byte {
	if groupID == 0 {
		return body
	}
	group, err := model.GetSubscriptionGroupByID(groupID)
	if err != nil || !group.MCPXMLEnabled {
		return body
	}

	var req map[string]interface{}
	if err := json.Unmarshal(body, &req); err != nil {
		return body
	}

	switch s := req["system"].(type) {
	case string:
		req["system"] = mcpXMLSystemPrompt + "\n" + s
	case nil:
		req["system"] = mcpXMLSystemPrompt
	}

	modified, err := json.Marshal(req)
	if err != nil {
		return body
	}
	return modified
}

// ─── Gemini OAuth ────────────────────────────────────────────────────────

func refreshGeminiTokenWithProxy(ctx context.Context, refreshToken string, proxyURL string) (*CodexOAuthTokenResult, error) {
	client, err := GetHttpClientWithProxy(strings.TrimSpace(proxyURL))
	if err != nil {
		return nil, err
	}
	if client == nil {
		client = &http.Client{Timeout: defaultHTTPTimeout}
	}

	tokenURL := "https://oauth2.googleapis.com/token"
	clientID := "937054031557-vu0n1s3i9ckk2l8s07f75a0v8q4vq7q8.apps.googleusercontent.com"

	form := url.Values{}
	form.Set("grant_type", "refresh_token")
	form.Set("refresh_token", refreshToken)
	form.Set("client_id", clientID)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, tokenURL, strings.NewReader(form.Encode()))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var payload struct {
		AccessToken  string `json:"access_token"`
		RefreshToken string `json:"refresh_token"`
		ExpiresIn    int    `json:"expires_in"`
	}
	if err := common.DecodeJson(resp.Body, &payload); err != nil {
		return nil, err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("gemini oauth refresh failed: status=%d", resp.StatusCode)
	}
	if payload.AccessToken == "" {
		return nil, errors.New("gemini oauth: empty access_token")
	}

	rt := payload.RefreshToken
	if rt == "" {
		rt = refreshToken // Google 有时不返回新的 refresh_token
	}
	return &CodexOAuthTokenResult{
		AccessToken:  payload.AccessToken,
		RefreshToken: rt,
		ExpiresAt:    time.Now().Add(time.Duration(payload.ExpiresIn) * time.Second),
	}, nil
}

// ─── 账号测试 ─────────────────────────────────────────────────────────────

// TestAccount 发送一个最小请求验证账号是否有效
func TestAccount(account *model.SubscriptionAccount) (bool, string) {
	proxyURL := account.GetEffectiveProxyURL()
	client, err := GetHttpClientWithProxy(proxyURL)
	if err != nil {
		return false, fmt.Sprintf("代理连接失败: %v", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	var testURL string
	var reqBody string
	var headers map[string]string

	switch account.Platform {
	case model.SubPlatformClaude, model.SubPlatformCodex:
		testURL = "https://api.anthropic.com/v1/messages"
		reqBody = `{"model":"claude-3-haiku-20240307","max_tokens":1,"messages":[{"role":"user","content":"hi"}]}`
		headers = map[string]string{
			"x-api-key":         account.AccessToken,
			"anthropic-version": "2023-06-01",
			"content-type":      "application/json",
		}
	case model.SubPlatformGemini:
		testURL = fmt.Sprintf("https://generativelanguage.googleapis.com/v1beta/models?key=%s", account.AccessToken)
		reqBody = ""
		headers = map[string]string{"content-type": "application/json"}
	default:
		return false, "不支持的平台测试"
	}

	var req *http.Request
	if reqBody != "" {
		req, err = http.NewRequestWithContext(ctx, "POST", testURL, strings.NewReader(reqBody))
	} else {
		req, err = http.NewRequestWithContext(ctx, "GET", testURL, nil)
	}
	if err != nil {
		return false, err.Error()
	}
	for k, v := range headers {
		req.Header.Set(k, v)
	}

	resp, err := client.Do(req)
	if err != nil {
		return false, fmt.Sprintf("请求失败: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusOK || resp.StatusCode == http.StatusCreated {
		return true, "账号验证通过"
	}
	return false, fmt.Sprintf("上游返回 %d", resp.StatusCode)
}

// ─── 月度重置任务 ─────────────────────────────────────────────────────────

// ResetMonthlyUsage 重置所有账号的本月用量（每月1日0时执行）
func ResetMonthlyUsage() error {
	return model.DB.Model(&model.SubscriptionAccount{}).
		Where("1 = 1").
		Update("used_this_month", 0).Error
}
