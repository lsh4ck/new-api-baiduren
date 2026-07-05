package relay

import (
	"bytes"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"

	"github.com/gin-gonic/gin"
)

const (
	ClaudeAPIURL = "https://api.anthropic.com/v1/messages"
	CodexAPIURL  = "https://api.openai.com/v1/responses"
	GeminiAPIURL = "https://generativelanguage.googleapis.com/v1beta/models"

	tokenRefreshBuffer = 5 * time.Minute
)

// RelayClaude POST /v1/subscription/claude/messages
func RelayClaude(c *gin.Context) {
	relaySubscriptionRequest(c, model.SubPlatformClaude, ClaudeAPIURL)
}

// RelayCodex POST /v1/subscription/codex/completions
func RelayCodex(c *gin.Context) {
	relaySubscriptionRequest(c, model.SubPlatformCodex, CodexAPIURL)
}

// RelayGemini POST /v1/subscription/gemini/generateContent
func RelayGemini(c *gin.Context) {
	relaySubscriptionRequest(c, model.SubPlatformGemini, GeminiAPIURL)
}

func relaySubscriptionRequest(c *gin.Context, platform string, upstreamURL string) {
	tokenKey := c.GetString("key")
	if tokenKey == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": gin.H{
			"message": "缺少有效的 API Key",
			"type":    "subscription_auth_error",
		}})
		return
	}

	userID := c.GetInt("id")

	// Determine group from subscription
	var groupID uint
	if userSubs, err := model.GetAllActiveUserSubscriptions(userID); err == nil && len(userSubs) > 0 {
		groupID = 0 // default group; extend here when sub→group mapping is added
	}

	// Read body once; keep for retries
	reqBody, err := io.ReadAll(c.Request.Body)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{
			"message": "读取请求体失败",
			"type":    "subscription_request_error",
		}})
		return
	}

	// Apply model routing and MCP XML injection for Claude
	if platform == model.SubPlatformClaude {
		reqBody = service.InjectMCPXML(reqBody, groupID)
	}

	// -- Sub2api-style smart dispatch with failover --
	var triedIDs []uint
	const maxRetries = 3

	for attempt := 0; attempt < maxRetries; attempt++ {
		var account *model.SubscriptionAccount

		if attempt == 0 {
			account, err = service.GetStickyAccount(uint(userID), platform, tokenKey, groupID)
		} else {
			account, err = service.SelectNextAccount(platform, groupID, triedIDs)
		}

		if err != nil {
			c.JSON(http.StatusBadGateway, gin.H{"error": gin.H{
				"message": fmt.Sprintf("获取上游账号失败: %s", err.Error()),
				"type":    "subscription_account_error",
			}})
			return
		}

		triedIDs = append(triedIDs, account.ID)

		// Rate limit / concurrency check
		if status, msg := service.CheckAndLimitSubscriptionRequest(userID, account.ID, platform, account.RPM, account.MaxConcurrent); status != 0 {
			c.JSON(status, gin.H{"error": gin.H{
				"message": msg,
				"type":    "subscription_rate_limit",
			}})
			return
		}

		// Auto-refresh token if near expiry
		if account.AccountType != model.SubAccountTypeAPIKey &&
			account.AccountType != model.SubAccountTypeBedrock &&
			account.ExpiresAt.Before(time.Now().Add(tokenRefreshBuffer)) {
			logger.LogInfo(c, fmt.Sprintf("sub2api: token near expiry, refreshing account_id=%d", account.ID))
			proxyURL := account.GetEffectiveProxyURL()
			if refreshErr := service.RefreshAccountToken(account, proxyURL); refreshErr != nil {
				logger.LogError(c, fmt.Sprintf("sub2api: refresh failed account_id=%d err=%s", account.ID, refreshErr))
			} else {
				if updated, fetchErr := model.GetSubscriptionAccountByID(account.ID); fetchErr == nil {
					account = updated
				}
			}
		}

		statusCode, respBody, contentType := doUpstreamRequest(c, platform, upstreamURL, reqBody, account)

		service.ReleaseSubscriptionRequestResources(account.ID, platform, account.MaxConcurrent)

		// Handle upstream errors with sub2api semantics
		if statusCode == http.StatusTooManyRequests || statusCode == 529 {
			service.HandleUpstreamError(account.ID, statusCode)
			logger.LogInfo(c, fmt.Sprintf("sub2api: account %d got %d, trying next", account.ID, statusCode))
			continue // failover
		}

		if statusCode == http.StatusUnauthorized {
			// Try token refresh once, then failover
			proxyURL := account.GetEffectiveProxyURL()
			if refreshErr := service.RefreshAccountToken(account, proxyURL); refreshErr == nil {
				if updated, fetchErr := model.GetSubscriptionAccountByID(account.ID); fetchErr == nil {
					account = updated
					statusCode, respBody, contentType = doUpstreamRequest(c, platform, upstreamURL, reqBody, account)
				}
			}
			if statusCode == http.StatusUnauthorized {
				service.HandleUpstreamError(account.ID, statusCode)
				continue
			}
		}

		// Success or non-retryable error — write response
		_ = model.UpdateAccountUsage(account.ID, 1.0)
		c.Header("Content-Type", contentType)
		c.Status(statusCode)
		c.Writer.Write(respBody)
		return
	}

	c.JSON(http.StatusBadGateway, gin.H{"error": gin.H{
		"message": "所有上游账号均不可用，请稍后重试",
		"type":    "subscription_all_accounts_failed",
	}})
}

// doUpstreamRequest performs the HTTP call and returns (statusCode, body, contentType).
func doUpstreamRequest(c *gin.Context, platform, upstreamURL string, body []byte, account *model.SubscriptionAccount) (int, []byte, string) {
	proxyURL := account.GetEffectiveProxyURL()
	client, err := service.GetHttpClientWithProxy(proxyURL)
	if err != nil || client == nil {
		client = &http.Client{Timeout: 5 * time.Minute}
	}

	req, err := http.NewRequestWithContext(c.Request.Context(), http.MethodPost, upstreamURL, bytes.NewReader(body))
	if err != nil {
		return http.StatusInternalServerError, nil, "application/json"
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json, text/event-stream")

	switch strings.ToLower(platform) {
	case model.SubPlatformClaude:
		req.Header.Set("x-api-key", account.AccessToken)
		req.Header.Set("anthropic-version", "2023-06-01")
	case model.SubPlatformCodex:
		req.Header.Set("Authorization", "Bearer "+account.AccessToken)
	case model.SubPlatformGemini:
		if account.AccessToken != "" {
			if req.URL.RawQuery != "" {
				req.URL.RawQuery += "&key=" + account.AccessToken
			} else {
				req.URL.RawQuery = "key=" + account.AccessToken
			}
		}
	}

	resp, err := client.Do(req)
	if err != nil {
		return http.StatusBadGateway, []byte(`{"error":{"message":"upstream request failed","type":"network_error"}}`), "application/json"
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	return resp.StatusCode, respBody, resp.Header.Get("Content-Type")
}

// BindStickyAccount POST /v1/subscription/bind
func BindStickyAccount(c *gin.Context) {
	type BindRequest struct {
		Platform string `json:"platform" binding:"required"`
		GroupID  uint   `json:"group_id"`
	}
	var req BindRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiErrorMsg(c, "参数错误: platform 不能为空")
		return
	}
	tokenKey := c.GetString("key")
	if tokenKey == "" {
		common.ApiErrorMsg(c, "缺少有效的 API Key")
		return
	}
	userID := c.GetInt("id")
	account, err := service.GetStickyAccount(uint(userID), req.Platform, tokenKey, req.GroupID)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{
		"account_id":   account.ID,
		"platform":     account.Platform,
		"account_name": account.AccountName,
		"status":       account.Status,
	})
}

// ResetStickyAccount POST /v1/subscription/reset
func ResetStickyAccount(c *gin.Context) {
	type ResetRequest struct {
		Platform string `json:"platform" binding:"required"`
	}
	var req ResetRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiErrorMsg(c, "参数错误: platform 不能为空")
		return
	}
	tokenKey := c.GetString("key")
	if tokenKey == "" {
		common.ApiErrorMsg(c, "缺少有效的 API Key")
		return
	}
	if err := service.ResetStickyAccount(tokenKey, req.Platform); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{"message": "粘性账号已重置，下次请求将重新分配"})
}

// GetSubscriptionAccountStatus GET /v1/subscription/status
func GetSubscriptionAccountStatus(c *gin.Context) {
	platform := c.Query("platform")
	if platform == "" {
		common.ApiErrorMsg(c, "参数错误: platform 不能为空")
		return
	}
	tokenKey := c.GetString("key")
	if tokenKey == "" {
		common.ApiErrorMsg(c, "缺少有效的 API Key")
		return
	}
	userID := c.GetInt("id")

	var sticky model.StickySession
	if err := model.DB.Where("api_key = ? AND platform = ?", tokenKey, platform).First(&sticky).Error; err != nil {
		common.ApiErrorMsg(c, "未绑定粘性账号")
		return
	}
	account, err := model.GetSubscriptionAccountByID(sticky.AccountID)
	if err != nil {
		common.ApiErrorMsg(c, "账号不存在")
		return
	}

	var quotaUsed, quotaTotal float64
	if userSubs, subErr := model.GetAllActiveUserSubscriptions(userID); subErr == nil {
		for _, sub := range userSubs {
			quotaUsed += float64(sub.Subscription.AmountUsed)
			quotaTotal += float64(sub.Subscription.AmountTotal)
		}
	}

	common.ApiSuccess(c, gin.H{
		"account_id":       account.ID,
		"account_name":     account.AccountName,
		"platform":         account.Platform,
		"status":           account.Status,
		"account_usage":    account.UsedThisMonth,
		"account_limit":    account.UsageLimit,
		"quota_used":       quotaUsed,
		"quota_total":      quotaTotal,
		"token_expires_at": account.ExpiresAt,
	})
}

// AdminListSubscriptionAccounts GET /api/admin/subscription/accounts
func AdminListSubscriptionAccounts(c *gin.Context) {
	platform := c.Query("platform")
	status := c.Query("status")
	groupID := uint(0)
	if gidStr := c.Query("group_id"); gidStr != "" {
		if gidVal, err := strconv.ParseUint(gidStr, 10, 64); err == nil {
			groupID = uint(gidVal)
		}
	}
	page := common.GetPageQuery(c)

	var accounts []model.SubscriptionAccount
	var total int64

	if groupID > 0 {
		// Filter by group membership via join table
		accountIDs, err := model.GetGroupAccounts(groupID)
		if err != nil {
			common.ApiError(c, err)
			return
		}
		if len(accountIDs) == 0 {
			common.ApiSuccess(c, gin.H{"accounts": []interface{}{}, "total": 0, "page": page.Page, "size": page.PageSize})
			return
		}
		q := model.DB.Model(&model.SubscriptionAccount{}).Where("id IN ?", accountIDs)
		if platform != "" {
			q = q.Where("platform = ?", platform)
		}
		if status != "" {
			q = q.Where("status = ?", status)
		}
		q.Count(&total)
		q.Order("priority ASC, created_at DESC").Offset((page.Page - 1) * page.PageSize).Limit(page.PageSize).Find(&accounts)
	} else {
		accounts2, total2, err := model.ListSubscriptionAccounts(platform, status, page.Page, page.PageSize)
		if err != nil {
			common.ApiError(c, err)
			return
		}
		accounts = accounts2
		total = total2
	}

	publicAccounts := make([]model.SubscriptionAccountPublicResponse, 0, len(accounts))
	for _, acc := range accounts {
		publicAccounts = append(publicAccounts, acc.ToPublicResponse())
	}
	common.ApiSuccess(c, gin.H{
		"accounts": publicAccounts,
		"total":    total,
		"page":     page.Page,
		"size":     page.PageSize,
	})
}

// AdminAddSubscriptionAccount POST /api/admin/subscription/accounts
func AdminAddSubscriptionAccount(c *gin.Context) {
	type AddAccountRequest struct {
		Platform      string    `json:"platform" binding:"required"`
		AccountType   string    `json:"account_type"`
		AccountName   string    `json:"account_name" binding:"required"`
		Email         string    `json:"email"`
		AccessToken   string    `json:"access_token"`
		RefreshToken  string    `json:"refresh_token"`
		Credentials   string    `json:"credentials"`
		ExpiresAt     time.Time `json:"expires_at"`
		Status        string    `json:"status"`
		Priority      int       `json:"priority"`
		Schedulable   *bool     `json:"schedulable"`
		UsageLimit    float64   `json:"usage_limit"`
		RateMultiplier float64  `json:"rate_multiplier"`
		GroupID       uint      `json:"group_id"`
		ProxyID       uint      `json:"proxy_id"`
		ProxyURL      string    `json:"proxy_url"`
		RPM           int       `json:"rpm"`
		MaxConcurrent int       `json:"max_concurrent"`
	}

	var req AddAccountRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiErrorMsg(c, "参数错误")
		return
	}
	if req.Status == "" {
		req.Status = model.SubAccountStatusActive
	}
	if req.AccountType == "" {
		req.AccountType = model.SubAccountTypeOAuth
	}
	schedulable := true
	if req.Schedulable != nil {
		schedulable = *req.Schedulable
	}
	rateMultiplier := 1.0
	if req.RateMultiplier > 0 {
		rateMultiplier = req.RateMultiplier
	}

	account := &model.SubscriptionAccount{
		Platform:       req.Platform,
		AccountType:    req.AccountType,
		AccountName:    req.AccountName,
		Email:          req.Email,
		AccessToken:    req.AccessToken,
		RefreshToken:   req.RefreshToken,
		Credentials:    req.Credentials,
		ExpiresAt:      req.ExpiresAt,
		Status:         req.Status,
		Priority:       req.Priority,
		Schedulable:    schedulable,
		UsageLimit:     req.UsageLimit,
		RateMultiplier: rateMultiplier,
		ProxyID:        req.ProxyID,
		ProxyURL:       req.ProxyURL,
		RPM:            req.RPM,
		MaxConcurrent:  req.MaxConcurrent,
	}

	if err := model.CreateSubscriptionAccount(account); err != nil {
		common.ApiError(c, err)
		return
	}

	// Add to group if specified
	if req.GroupID > 0 {
		_ = model.AddAccountsToGroup(req.GroupID, []uint{account.ID})
	}

	common.ApiSuccess(c, account.ToPublicResponse())
}

// AdminRefreshSubscriptionAccount POST /api/admin/subscription/accounts/:id/refresh
func AdminRefreshSubscriptionAccount(c *gin.Context) {
	id, ok := parseIDParam(c)
	if !ok {
		return
	}
	account, err := model.GetSubscriptionAccountByID(id)
	if err != nil {
		common.ApiErrorMsg(c, "账号不存在")
		return
	}
	proxyURL := account.GetEffectiveProxyURL()
	if proxyURL == "" {
		proxyURL = c.Query("proxy_url")
	}
	if refreshErr := service.RefreshAccountToken(account, proxyURL); refreshErr != nil {
		common.ApiError(c, refreshErr)
		return
	}
	common.ApiSuccess(c, gin.H{
		"message":    "token 刷新成功",
		"account_id": account.ID,
		"expires_at": account.ExpiresAt,
	})
}

// AdminUpdateSubscriptionAccount PUT /api/admin/subscription/accounts/:id
func AdminUpdateSubscriptionAccount(c *gin.Context) {
	id, ok := parseIDParam(c)
	if !ok {
		return
	}
	account, err := model.GetSubscriptionAccountByID(id)
	if err != nil {
		common.ApiErrorMsg(c, "账号不存在")
		return
	}

	type UpdateAccountRequest struct {
		AccountName    string   `json:"account_name"`
		Email          string   `json:"email"`
		Status         string   `json:"status"`
		Priority       *int     `json:"priority"`
		Schedulable    *bool    `json:"schedulable"`
		UsageLimit     *float64 `json:"usage_limit"`
		RateMultiplier *float64 `json:"rate_multiplier"`
		GroupID        uint     `json:"group_id"`
		ProxyID        uint     `json:"proxy_id"`
		ProxyURL       string   `json:"proxy_url"`
		RPM            *int     `json:"rpm"`
		MaxConcurrent  *int     `json:"max_concurrent"`
	}

	var req UpdateAccountRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiErrorMsg(c, "参数错误")
		return
	}

	if req.AccountName != "" {
		account.AccountName = req.AccountName
	}
	if req.Email != "" {
		account.Email = req.Email
	}
	if req.Status != "" {
		account.Status = req.Status
	}
	if req.Priority != nil {
		account.Priority = *req.Priority
	}
	if req.Schedulable != nil {
		account.Schedulable = *req.Schedulable
	}
	if req.UsageLimit != nil {
		account.UsageLimit = *req.UsageLimit
	}
	if req.RateMultiplier != nil {
		account.RateMultiplier = *req.RateMultiplier
	}
	account.ProxyID = req.ProxyID
	account.ProxyURL = req.ProxyURL
	if req.RPM != nil {
		account.RPM = *req.RPM
	}
	if req.MaxConcurrent != nil {
		account.MaxConcurrent = *req.MaxConcurrent
	}

	if err := model.UpdateSubscriptionAccount(account); err != nil {
		common.ApiError(c, err)
		return
	}

	// Update group membership if provided
	if req.GroupID > 0 {
		// Clear old group memberships and add to new group
		model.DB.Where("account_id = ?", account.ID).Delete(&model.SubscriptionAccountGroup{})
		_ = model.AddAccountsToGroup(req.GroupID, []uint{account.ID})
	}

	common.ApiSuccess(c, account.ToPublicResponse())
}

// AdminDeleteSubscriptionAccount DELETE /api/admin/subscription/accounts/:id
func AdminDeleteSubscriptionAccount(c *gin.Context) {
	id, ok := parseIDParam(c)
	if !ok {
		return
	}
	if err := model.DeleteSubscriptionAccount(id); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, nil)
}

// AdminTestSubscriptionAccount POST /api/admin/subscription/accounts/:id/test
func AdminTestSubscriptionAccount(c *gin.Context) {
	id, ok := parseIDParam(c)
	if !ok {
		return
	}
	account, err := model.GetSubscriptionAccountByID(id)
	if err != nil {
		common.ApiErrorMsg(c, "账号不存在")
		return
	}
	ok2, msg := service.TestAccount(account)
	common.ApiSuccess(c, gin.H{"ok": ok2, "message": msg})
}

// AdminResetRateLimit POST /api/admin/subscription/accounts/:id/reset-rate-limit
func AdminResetRateLimit(c *gin.Context) {
	id, ok := parseIDParam(c)
	if !ok {
		return
	}
	if err := model.ClearAccountRateLimit(id); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{"message": "限流状态已清除"})
}

// GetUserSubscriptionUsage GET /api/subscription/usage
func GetUserSubscriptionUsage(c *gin.Context) {
	userID := c.GetInt("id")
	userSubs, err := model.GetAllActiveUserSubscriptions(userID)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	var stickies []model.StickySession
	model.DB.Where("user_id = ?", userID).Find(&stickies)

	accountUsages := make([]gin.H, 0, len(stickies))
	for _, sticky := range stickies {
		if account, err := model.GetSubscriptionAccountByID(sticky.AccountID); err == nil {
			accountUsages = append(accountUsages, gin.H{
				"account_id":   account.ID,
				"account_name": account.AccountName,
				"platform":     account.Platform,
				"used":         account.UsedThisMonth,
				"limit":        account.UsageLimit,
			})
		}
	}

	totalUsed, totalTotal := int64(0), int64(0)
	for _, sub := range userSubs {
		totalUsed += sub.Subscription.AmountUsed
		totalTotal += sub.Subscription.AmountTotal
	}

	common.ApiSuccess(c, gin.H{
		"quota_used":      totalUsed,
		"quota_total":     totalTotal,
		"quota_remain":    totalTotal - totalUsed,
		"subscriptions":   userSubs,
		"account_usages":  accountUsages,
	})
}

// GetUserSubscriptionInfo GET /api/subscription
func GetUserSubscriptionInfo(c *gin.Context) {
	userID := c.GetInt("id")
	userSubs, err := model.GetAllActiveUserSubscriptions(userID)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{"subscriptions": userSubs})
}

// SubscriptionHealthCheck GET /v1/subscription/health
func SubscriptionHealthCheck(c *gin.Context) {
	platforms := []string{model.SubPlatformClaude, model.SubPlatformCodex, model.SubPlatformGemini}
	health := make(map[string]gin.H)
	for _, platform := range platforms {
		count, err := model.GetActiveAccountCount(platform, 0)
		status := "healthy"
		if err != nil || count == 0 {
			status = "unhealthy"
		}
		health[platform] = gin.H{"status": status, "count": count}
	}
	common.ApiSuccess(c, gin.H{"status": "ok", "platforms": health})
}

func parseIDParam(c *gin.Context) (uint, bool) {
	idVal, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil || idVal == 0 {
		common.ApiErrorMsg(c, "无效的 ID")
		return 0, false
	}
	return uint(idVal), true
}
