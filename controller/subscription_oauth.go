package controller

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
)

type pendingOAuthSession struct {
	Verifier  string
	Platform  string
	ProxyURL  string
	ExpiresAt time.Time
}

var (
	pendingOAuthMu       sync.Mutex
	pendingOAuthSessions = make(map[string]*pendingOAuthSession)
)

func cleanPendingOAuthSessions() {
	pendingOAuthMu.Lock()
	defer pendingOAuthMu.Unlock()
	now := time.Now()
	for k, v := range pendingOAuthSessions {
		if v.ExpiresAt.Before(now) {
			delete(pendingOAuthSessions, k)
		}
	}
}

// SubscriptionOAuthInit 生成 OAuth 授权 URL（PKCE flow）
// POST /api/admin/subscription/oauth/init
func SubscriptionOAuthInit(c *gin.Context) {
	var req struct {
		Platform string `json:"platform" binding:"required"`
		ProxyURL string `json:"proxy_url"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiErrorMsg(c, "参数错误")
		return
	}

	flow, err := service.CreateCodexOAuthAuthorizationFlow()
	if err != nil {
		common.ApiError(c, err)
		return
	}

	pendingOAuthMu.Lock()
	pendingOAuthSessions[flow.State] = &pendingOAuthSession{
		Verifier:  flow.Verifier,
		Platform:  req.Platform,
		ProxyURL:  req.ProxyURL,
		ExpiresAt: time.Now().Add(10 * time.Minute),
	}
	pendingOAuthMu.Unlock()

	go cleanPendingOAuthSessions()

	common.ApiSuccess(c, gin.H{
		"state":         flow.State,
		"authorize_url": flow.AuthorizeURL,
	})
}

// SubscriptionOAuthExchange 用 code 换取 token 并创建账号
// POST /api/admin/subscription/oauth/exchange
func SubscriptionOAuthExchange(c *gin.Context) {
	var req struct {
		State         string  `json:"state" binding:"required"`
		Code          string  `json:"code" binding:"required"`
		AccountName   string  `json:"account_name" binding:"required"`
		GroupID       uint    `json:"group_id"`
		UsageLimit    float64 `json:"usage_limit"`
		RPM           int     `json:"rpm"`
		MaxConcurrent int     `json:"max_concurrent"`
		Disabled      bool    `json:"disabled"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiErrorMsg(c, "参数错误")
		return
	}

	pendingOAuthMu.Lock()
	session, ok := pendingOAuthSessions[req.State]
	if ok {
		delete(pendingOAuthSessions, req.State)
	}
	pendingOAuthMu.Unlock()

	if !ok || session.ExpiresAt.Before(time.Now()) {
		common.ApiErrorMsg(c, "OAuth 会话已过期，请重新发起授权")
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 30*time.Second)
	defer cancel()

	var result *service.CodexOAuthTokenResult
	var exchangeErr error
	if strings.TrimSpace(session.ProxyURL) != "" {
		result, exchangeErr = service.ExchangeCodexAuthorizationCodeWithProxy(ctx, req.Code, session.Verifier, session.ProxyURL)
	} else {
		result, exchangeErr = service.ExchangeCodexAuthorizationCode(ctx, req.Code, session.Verifier)
	}
	if exchangeErr != nil {
		common.ApiError(c, fmt.Errorf("code 兑换失败: %w", exchangeErr))
		return
	}

	email, _ := service.ExtractEmailFromJWT(result.AccessToken)

	status := "active"
	if req.Disabled {
		status = "disabled"
	}

	account := &model.SubscriptionAccount{
		Platform:      session.Platform,
		AccountType:   model.SubAccountTypeOAuth,
		AccountName:   req.AccountName,
		Email:         email,
		AccessToken:   result.AccessToken,
		RefreshToken:  result.RefreshToken,
		ExpiresAt:     result.ExpiresAt,
		Status:        status,
		Schedulable:   true,
		RateMultiplier: 1.0,
		UsageLimit:    req.UsageLimit,
		ProxyURL:      session.ProxyURL,
		RPM:           req.RPM,
		MaxConcurrent: req.MaxConcurrent,
	}
	if err := model.CreateSubscriptionAccount(account); err != nil {
		common.ApiError(c, err)
		return
	}
	if req.GroupID > 0 {
		_ = model.AddAccountsToGroup(req.GroupID, []uint{account.ID})
	}
	common.ApiSuccess(c, account.ToPublicResponse())
}

// SubscriptionRefreshTokenExchange 用 refresh_token 直接换 access_token 并创建账号
// POST /api/admin/subscription/oauth/refresh-exchange
func SubscriptionRefreshTokenExchange(c *gin.Context) {
	var req struct {
		Platform      string  `json:"platform" binding:"required"`
		RefreshToken  string  `json:"refresh_token" binding:"required"`
		AccountName   string  `json:"account_name" binding:"required"`
		ProxyURL      string  `json:"proxy_url"`
		GroupID       uint    `json:"group_id"`
		UsageLimit    float64 `json:"usage_limit"`
		RPM           int     `json:"rpm"`
		MaxConcurrent int     `json:"max_concurrent"`
		Disabled      bool    `json:"disabled"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiErrorMsg(c, "参数错误")
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 30*time.Second)
	defer cancel()

	// 创建一个临时的账号对象用于刷新
	tmp := &model.SubscriptionAccount{
		Platform:     req.Platform,
		RefreshToken: req.RefreshToken,
		ProxyURL:     req.ProxyURL,
	}

	// 先尝试刷新，获取 access_token
	if err := service.RefreshAccountToken(tmp, req.ProxyURL); err != nil {
		// 刷新失败，尝试直接把 refresh_token 当 access_token 使用（某些平台）
		_ = ctx
		tmp.AccessToken = req.RefreshToken
		tmp.RefreshToken = ""
		tmp.ExpiresAt = time.Now().Add(365 * 24 * time.Hour)
	}

	email, _ := service.ExtractEmailFromJWT(tmp.AccessToken)

	status := "active"
	if req.Disabled {
		status = "disabled"
	}

	account := &model.SubscriptionAccount{
		Platform:       req.Platform,
		AccountType:    model.SubAccountTypeOAuth,
		AccountName:    req.AccountName,
		Email:          email,
		AccessToken:    tmp.AccessToken,
		RefreshToken:   tmp.RefreshToken,
		ExpiresAt:      tmp.ExpiresAt,
		Status:         status,
		Schedulable:    true,
		RateMultiplier: 1.0,
		UsageLimit:     req.UsageLimit,
		ProxyURL:       req.ProxyURL,
		RPM:            req.RPM,
		MaxConcurrent:  req.MaxConcurrent,
	}
	if err := model.CreateSubscriptionAccount(account); err != nil {
		common.ApiError(c, err)
		return
	}
	if req.GroupID > 0 {
		_ = model.AddAccountsToGroup(req.GroupID, []uint{account.ID})
	}
	common.ApiSuccess(c, account.ToPublicResponse())
}
