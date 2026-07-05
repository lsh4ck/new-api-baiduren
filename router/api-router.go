package router

import (
	"github.com/QuantumNous/new-api/controller"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/relay"

	// Import oauth package to register providers via init()
	_ "github.com/QuantumNous/new-api/oauth"

	"github.com/gin-contrib/gzip"
	"github.com/gin-gonic/gin"
)

func SetApiRouter(router *gin.Engine) {
	apiRouter := router.Group("/api")
	apiRouter.Use(middleware.RouteTag("api"))
	apiRouter.Use(gzip.Gzip(gzip.DefaultCompression))
	apiRouter.Use(middleware.BodyStorageCleanup()) // 清理请求体存储
	apiRouter.Use(middleware.GlobalAPIRateLimit())
	// 官方 d2f7f9ee(#5244):匿名请求体大小限制,挂在未鉴权敏感接口防打爆内存
	anonymousRequestBodyLimit := middleware.AnonymousRequestBodyLimit()
	{
		apiRouter.GET("/setup", controller.GetSetup)
		apiRouter.POST("/setup", anonymousRequestBodyLimit, controller.PostSetup)
		apiRouter.GET("/status", controller.GetStatus)
		apiRouter.POST("/telemetry/beacon", controller.ReceiveBeacon) // 自托管实例统计探针接收端
		apiRouter.GET("/telemetry", controller.TelemetryPage)         // 公开申明页+部署统计
		apiRouter.GET("/telemetry/deployments", middleware.AdminAuth(), controller.TelemetryDeployments) // 管理员看部署明细
		apiRouter.POST("/smart-admin/chat", middleware.AdminAuth(), controller.SmartAdminChat) // 后台智能管理AI
		apiRouter.GET("/agents", controller.GetAgents) // 智能体超市预设(公开只读)
		apiRouter.GET("/uptime/status", controller.GetUptimeKumaStatus)
		apiRouter.GET("/models", middleware.UserAuth(), controller.DashboardListModels)
		apiRouter.GET("/status/test", middleware.AdminAuth(), controller.TestStatus)
		apiRouter.GET("/admin/channel-audit/latest", middleware.AdminAuth(), controller.GetChannelAuditLatest)
		apiRouter.GET("/admin/channel-audit/history", middleware.AdminAuth(), controller.GetChannelAuditHistory)
		apiRouter.POST("/admin/channel-audit/run", middleware.AdminAuth(), controller.TriggerChannelAudit)
		apiRouter.GET("/notice", controller.GetNotice)
		apiRouter.GET("/user-agreement", controller.GetUserAgreement)
		apiRouter.GET("/privacy-policy", controller.GetPrivacyPolicy)
		apiRouter.GET("/about", controller.GetAbout)
		//apiRouter.GET("/midjourney", controller.GetMidjourney)
		apiRouter.GET("/home_page_content", controller.GetHomePageContent)
		apiRouter.GET("/pricing", middleware.TryUserAuth(), controller.GetPricing)
		perfMetricsRoute := apiRouter.Group("/perf-metrics")
		perfMetricsRoute.Use(middleware.TryUserAuth())
		{
			perfMetricsRoute.GET("/summary", controller.GetPerfMetricsSummary)
			perfMetricsRoute.GET("", controller.GetPerfMetrics)
		}
		apiRouter.GET("/rankings", controller.GetRankings)
		apiRouter.GET("/verification", middleware.EmailVerificationRateLimit(), middleware.TurnstileCheck(), controller.SendEmailVerification)
		apiRouter.GET("/reset_password", middleware.CriticalRateLimit(), middleware.TurnstileCheck(), controller.SendPasswordResetEmail)
		apiRouter.POST("/user/reset", middleware.CriticalRateLimit(), anonymousRequestBodyLimit, controller.ResetPassword)
		// OAuth routes - specific routes must come before :provider wildcard
		apiRouter.GET("/oauth/state", middleware.CriticalRateLimit(), controller.GenerateOAuthCode)
		apiRouter.POST("/oauth/email/bind", middleware.CriticalRateLimit(), controller.EmailBind)
		// Non-standard OAuth (WeChat, Telegram) - keep original routes
		apiRouter.GET("/oauth/wechat", middleware.CriticalRateLimit(), controller.WeChatAuth)
		apiRouter.POST("/oauth/wechat/bind", middleware.CriticalRateLimit(), controller.WeChatBind)
		apiRouter.GET("/oauth/telegram/login", middleware.CriticalRateLimit(), controller.TelegramLogin)
		apiRouter.GET("/oauth/telegram/bind", middleware.CriticalRateLimit(), controller.TelegramBind)
		// Standard OAuth providers (GitHub, Discord, OIDC, LinuxDO) - unified route
		apiRouter.GET("/oauth/:provider", middleware.CriticalRateLimit(), controller.HandleOAuth)
		apiRouter.GET("/ratio_config", middleware.CriticalRateLimit(), controller.GetRatioConfig)
		// SmartRelay 全平台优化节省（公开，落地页用）
		apiRouter.GET("/optimization/global-savings", controller.GetGlobalOptimizationSavings)

		apiRouter.POST("/stripe/webhook", controller.StripeWebhook)
		apiRouter.POST("/creem/webhook", controller.CreemWebhook)
		apiRouter.POST("/waffo/webhook", controller.WaffoWebhook)
		//apiRouter.POST("/waffo-pancake/webhook", controller.WaffoPancakeWebhook)

		// Universal secure verification routes
		apiRouter.POST("/verify", middleware.UserAuth(), middleware.CriticalRateLimit(), controller.UniversalVerify)

		userRoute := apiRouter.Group("/user")
		{
			userRoute.POST("/register", middleware.CriticalRateLimit(), anonymousRequestBodyLimit, middleware.TurnstileCheck(), controller.Register)
			userRoute.POST("/login", middleware.CriticalRateLimit(), anonymousRequestBodyLimit, middleware.TurnstileCheck(), controller.Login)
			userRoute.POST("/login/2fa", middleware.CriticalRateLimit(), controller.Verify2FALogin)
			userRoute.POST("/passkey/login/begin", middleware.CriticalRateLimit(), controller.PasskeyLoginBegin)
			userRoute.POST("/passkey/login/finish", middleware.CriticalRateLimit(), controller.PasskeyLoginFinish)
			//userRoute.POST("/tokenlog", middleware.CriticalRateLimit(), controller.TokenLog)
			userRoute.GET("/logout", controller.Logout)
			userRoute.POST("/epay/notify", controller.EpayNotify)
			userRoute.GET("/epay/notify", controller.EpayNotify)
			// /groups removed: leaked group names+ratios to unauthenticated callers.
			// Use /self/groups (requires UserAuth) instead.

			selfRoute := userRoute.Group("/")
			selfRoute.Use(middleware.UserAuth())
			{
				selfRoute.GET("/self/groups", controller.GetUserGroups)
				selfRoute.GET("/self", controller.GetSelf)
				selfRoute.GET("/models", controller.GetUserModels)
				selfRoute.PUT("/self", controller.UpdateSelf)
				selfRoute.POST("/self/initial-setup", controller.InitialProfileSetup)
				selfRoute.GET("/self/optimization-summary", controller.GetUserOptimizationSummary)
				selfRoute.GET("/self/cache-stats", controller.GetSelfCacheStats)
				selfRoute.POST("/feedback", middleware.CriticalRateLimit(), controller.SubmitFeedback)
				selfRoute.DELETE("/self", controller.DeleteSelf)
				selfRoute.GET("/token", controller.GenerateAccessToken)
				selfRoute.PUT("/token/allow_ips", controller.UpdateAccessTokenAllowIps)
				selfRoute.GET("/passkey", controller.PasskeyStatus)
				selfRoute.POST("/passkey/register/begin", controller.PasskeyRegisterBegin)
				selfRoute.POST("/passkey/register/finish", controller.PasskeyRegisterFinish)
				selfRoute.POST("/passkey/verify/begin", controller.PasskeyVerifyBegin)
				selfRoute.POST("/passkey/verify/finish", controller.PasskeyVerifyFinish)
				selfRoute.DELETE("/passkey", controller.PasskeyDelete)
				selfRoute.GET("/aff", controller.GetAffCode)
				selfRoute.GET("/topup/info", controller.GetTopUpInfo)
				selfRoute.GET("/topup/self", controller.GetUserTopUps)
				selfRoute.GET("/topup/self/trade/:trade_no", controller.GetSelfTopUpByTradeNo)
				selfRoute.DELETE("/topup/self/:id", controller.DeleteUserTopUp)
				selfRoute.POST("/topup", middleware.CriticalRateLimit(), controller.TopUp)
				selfRoute.POST("/pay", middleware.CriticalRateLimit(), controller.RequestEpay)
				selfRoute.POST("/amount", controller.RequestAmount)
				selfRoute.POST("/stripe/pay", middleware.CriticalRateLimit(), controller.RequestStripePay)
				selfRoute.POST("/stripe/amount", controller.RequestStripeAmount)
				selfRoute.POST("/creem/pay", middleware.CriticalRateLimit(), controller.RequestCreemPay)
				selfRoute.POST("/waffo/amount", controller.RequestWaffoAmount)
				selfRoute.POST("/waffo/pay", middleware.CriticalRateLimit(), controller.RequestWaffoPay)
				//selfRoute.POST("/waffo-pancake/amount", controller.RequestWaffoPancakeAmount)
				//selfRoute.POST("/waffo-pancake/pay", middleware.CriticalRateLimit(), controller.RequestWaffoPancakePay)
				selfRoute.POST("/aff_transfer", controller.TransferAffQuota)
				selfRoute.PUT("/setting", controller.UpdateUserSetting)
				selfRoute.PUT("/onboarding-seen", controller.MarkOnboardingSeen)
				selfRoute.GET("/aigc-sso", controller.AigcSso)  // 兼容旧前端
				selfRoute.GET("/sso", controller.Sso)           // 统一多目标 SSO：?target=<注册表 key>

				// 2FA routes
				selfRoute.GET("/2fa/status", controller.Get2FAStatus)
				selfRoute.POST("/2fa/setup", controller.Setup2FA)
				selfRoute.POST("/2fa/enable", controller.Enable2FA)
				selfRoute.POST("/2fa/disable", controller.Disable2FA)
				selfRoute.POST("/2fa/backup_codes", controller.RegenerateBackupCodes)

				// Check-in routes
				selfRoute.GET("/checkin", controller.GetCheckinStatus)
				selfRoute.POST("/checkin", middleware.TurnstileCheck(), controller.DoCheckin)

				// Custom OAuth bindings
				selfRoute.GET("/oauth/bindings", controller.GetUserOAuthBindings)
				selfRoute.DELETE("/oauth/bindings/:provider_id", controller.UnbindCustomOAuth)
			}

			adminRoute := userRoute.Group("/")
			adminRoute.Use(middleware.AdminAuth())
			{
				adminRoute.GET("/", controller.GetAllUsers)
				adminRoute.GET("/topup", controller.GetAllTopUps)
				adminRoute.POST("/topup/complete", controller.AdminCompleteTopUp)
				adminRoute.GET("/search", controller.SearchUsers)
				adminRoute.GET("/:id/oauth/bindings", controller.GetUserOAuthBindingsByAdmin)
				adminRoute.DELETE("/:id/oauth/bindings/:provider_id", controller.UnbindCustomOAuthByAdmin)
				adminRoute.DELETE("/:id/bindings/:binding_type", controller.AdminClearUserBinding)
				adminRoute.GET("/:id", controller.GetUser)
				adminRoute.GET("/:id/usage-summary", controller.GetUserUsageSummary)
				adminRoute.GET("/:id/optimization-summary", controller.GetAdminUserOptimizationSummary)
				adminRoute.POST("/", controller.CreateUser)
				adminRoute.POST("/manage", controller.ManageUser)
				adminRoute.PUT("/", controller.UpdateUser)
				adminRoute.DELETE("/:id", controller.DeleteUser)
				adminRoute.DELETE("/:id/reset_passkey", controller.AdminResetPasskey)

				// Admin 2FA routes
				adminRoute.GET("/2fa/stats", controller.Admin2FAStats)
				adminRoute.DELETE("/:id/2fa", controller.AdminDisable2FA)
			}
		}

		// bijia 中转站续探状态（任何登录用户可查；未登录 401）
		// cron 每天北京时间 04:00 写入 /opt/new-api/data/bijia-status.json
		bijiaRoute := apiRouter.Group("/bijia")
		bijiaRoute.Use(middleware.UserAuth())
		{
			bijiaRoute.GET("/status", controller.GetBijiaStatus)
		}

		// Optional extension routes: pluggable modules register here via init();
		// the list is empty in the core build.
		applyApiRouterExtensions(apiRouter)

		// Subscription billing (plans, purchase, admin management)
		// 公开套餐列表(首页营销展示用,免登录,游客可见,与后端 enabled 套餐一致)
		apiRouter.GET("/subscription/plans/public", controller.GetSubscriptionPlans)
		subscriptionRoute := apiRouter.Group("/subscription")
		subscriptionRoute.Use(middleware.UserAuth())
		{
			subscriptionRoute.GET("/plans", controller.GetSubscriptionPlans)
			subscriptionRoute.GET("/self", controller.GetSubscriptionSelf)
			subscriptionRoute.PUT("/self/preference", controller.UpdateSubscriptionPreference)
			subscriptionRoute.POST("/epay/pay", middleware.CriticalRateLimit(), controller.SubscriptionRequestEpay)
			subscriptionRoute.POST("/stripe/pay", middleware.CriticalRateLimit(), controller.SubscriptionRequestStripePay)
			subscriptionRoute.POST("/creem/pay", middleware.CriticalRateLimit(), controller.SubscriptionRequestCreemPay)
		}
		subscriptionAdminRoute := apiRouter.Group("/subscription/admin")
		subscriptionAdminRoute.Use(middleware.AdminAuth())
		{
			subscriptionAdminRoute.GET("/plans", controller.AdminListSubscriptionPlans)
			subscriptionAdminRoute.POST("/plans", controller.AdminCreateSubscriptionPlan)
			subscriptionAdminRoute.PUT("/plans/:id", controller.AdminUpdateSubscriptionPlan)
			subscriptionAdminRoute.PATCH("/plans/:id", controller.AdminUpdateSubscriptionPlanStatus)
			subscriptionAdminRoute.POST("/bind", controller.AdminBindSubscription)

			// User subscription management (admin)
			subscriptionAdminRoute.GET("/users/:id/subscriptions", controller.AdminListUserSubscriptions)
			subscriptionAdminRoute.POST("/users/:id/subscriptions", controller.AdminCreateUserSubscription)
			subscriptionAdminRoute.POST("/user_subscriptions/:id/invalidate", controller.AdminInvalidateUserSubscription)
			subscriptionAdminRoute.DELETE("/user_subscriptions/:id", controller.AdminDeleteUserSubscription)
		}

		// Subscription payment callbacks (no auth)
		apiRouter.POST("/subscription/epay/notify", controller.SubscriptionEpayNotify)
		apiRouter.GET("/subscription/epay/notify", controller.SubscriptionEpayNotify)
		apiRouter.GET("/subscription/epay/return", controller.SubscriptionEpayReturn)
		apiRouter.POST("/subscription/epay/return", controller.SubscriptionEpayReturn)

		// ===== 订阅账号池管理 (管理员) =====
		subAccountAdminRoute := apiRouter.Group("/admin/subscription/accounts")
		subAccountAdminRoute.Use(middleware.AdminAuth())
		{
			subAccountAdminRoute.GET("/", relay.AdminListSubscriptionAccounts)
			subAccountAdminRoute.POST("/", relay.AdminAddSubscriptionAccount)
			subAccountAdminRoute.PUT("/:id", relay.AdminUpdateSubscriptionAccount)
			subAccountAdminRoute.DELETE("/:id", relay.AdminDeleteSubscriptionAccount)
			subAccountAdminRoute.POST("/:id/refresh", relay.AdminRefreshSubscriptionAccount)
			subAccountAdminRoute.POST("/:id/test", relay.AdminTestSubscriptionAccount)
			subAccountAdminRoute.POST("/:id/reset-rate-limit", relay.AdminResetRateLimit)
		}

		// ===== 订阅分组管理 (管理员) =====
		subGroupAdminRoute := apiRouter.Group("/admin/subscription/groups")
		subGroupAdminRoute.Use(middleware.AdminAuth())
		{
			subGroupAdminRoute.GET("/", controller.AdminListSubscriptionGroups)
			subGroupAdminRoute.POST("/", controller.AdminCreateSubscriptionGroup)
			subGroupAdminRoute.GET("/:id", controller.AdminGetSubscriptionGroup)
			subGroupAdminRoute.PUT("/:id", controller.AdminUpdateSubscriptionGroup)
			subGroupAdminRoute.DELETE("/:id", controller.AdminDeleteSubscriptionGroup)
			subGroupAdminRoute.GET("/:id/accounts", controller.AdminGetGroupAccounts)
			subGroupAdminRoute.POST("/:id/accounts", controller.AdminAddGroupAccounts)
			subGroupAdminRoute.DELETE("/:id/accounts", controller.AdminRemoveGroupAccounts)
		}

		// ===== 代理池管理 (管理员) =====
		subProxyAdminRoute := apiRouter.Group("/admin/subscription/proxies")
		subProxyAdminRoute.Use(middleware.AdminAuth())
		{
			subProxyAdminRoute.GET("/", controller.AdminListSubscriptionProxies)
			subProxyAdminRoute.POST("/", controller.AdminCreateSubscriptionProxy)
			subProxyAdminRoute.GET("/:id", controller.AdminGetSubscriptionProxy)
			subProxyAdminRoute.PUT("/:id", controller.AdminUpdateSubscriptionProxy)
			subProxyAdminRoute.DELETE("/:id", controller.AdminDeleteSubscriptionProxy)
			subProxyAdminRoute.POST("/:id/test", controller.AdminTestSubscriptionProxy)
		}

		// ===== 订阅账号 OAuth 向导 =====
		subOAuthRoute := apiRouter.Group("/admin/subscription/oauth")
		subOAuthRoute.Use(middleware.AdminAuth())
		{
			subOAuthRoute.POST("/init", controller.SubscriptionOAuthInit)
			subOAuthRoute.POST("/exchange", controller.SubscriptionOAuthExchange)
			subOAuthRoute.POST("/refresh-exchange", controller.SubscriptionRefreshTokenExchange)
		}

		// ===== 用户订阅管理 (用户侧) =====
		subUserRoute := apiRouter.Group("/subscription")
		subUserRoute.Use(middleware.UserAuth())
		{
			subUserRoute.GET("/", relay.GetUserSubscriptionInfo)
			subUserRoute.GET("/usage", relay.GetUserSubscriptionUsage)
		}

		// ===== 多租户企业管理（销售/平台管理员/企业管理员） =====
		// 需要登录，权限在 controller 内部按 IsSales / role / EnterpriseAdminOf 分层校验
		entAdminRoute := apiRouter.Group("/enterprise/admin")
		entAdminRoute.Use(middleware.UserAuth())
		{
			entAdminRoute.POST("/enterprises", controller.CreateEnterprise)
			entAdminRoute.GET("/enterprises", controller.ListEnterprises)
			entAdminRoute.GET("/enterprises/:id", controller.GetEnterprise)
			entAdminRoute.PUT("/enterprises/:id", controller.UpdateEnterprise)
			entAdminRoute.DELETE("/enterprises/:id", controller.DeleteEnterprise)
			entAdminRoute.GET("/enterprises/:id/members", controller.ListEnterpriseMembers)
			entAdminRoute.POST("/enterprises/:id/members", controller.AddEnterpriseMember)
			entAdminRoute.POST("/enterprises/:id/members/bulk", controller.BulkAddEnterpriseMembers)
			entAdminRoute.GET("/enterprises/:id/search-candidates", controller.SearchUsersForEnterprise)
			entAdminRoute.DELETE("/enterprises/:id/members/:user_id", controller.RemoveEnterpriseMember)
			entAdminRoute.PUT("/enterprises/:id/admin", controller.SetEnterpriseAdmin)
			// 工作组
			entAdminRoute.GET("/enterprises/:id/workgroups", controller.ListWorkGroups)
			entAdminRoute.POST("/enterprises/:id/workgroups", controller.CreateWorkGroup)
			entAdminRoute.PUT("/enterprises/:id/workgroups/:wg_id", controller.UpdateWorkGroup)
			entAdminRoute.DELETE("/enterprises/:id/workgroups/:wg_id", controller.DeleteWorkGroup)
			entAdminRoute.GET("/enterprises/:id/workgroups/:wg_id/members", controller.ListWorkGroupMembers)
			entAdminRoute.POST("/enterprises/:id/workgroups/:wg_id/members", controller.AddWorkGroupMember)
			entAdminRoute.DELETE("/enterprises/:id/workgroups/:wg_id/members/:user_id", controller.RemoveWorkGroupMember)
			// 限额
			entAdminRoute.GET("/enterprises/:id/limits", controller.ListEnterpriseLimits)
			entAdminRoute.POST("/enterprises/:id/limits", controller.CreateEnterpriseLimit)
			entAdminRoute.PUT("/enterprises/:id/limits/:limit_id", controller.UpdateEnterpriseLimit)
			entAdminRoute.DELETE("/enterprises/:id/limits/:limit_id", controller.DeleteEnterpriseLimit)
		}
		// 平台管理员管理销售身份（is_sales 标志）
		apiRouter.PUT("/user/admin/sales", middleware.AdminAuth(), controller.SetUserSalesFlag)

		// ===== 企业控制台（单租户传统视图，保留） =====
		enterpriseRoute := apiRouter.Group("/enterprise")
		enterpriseRoute.Use(middleware.AdminAuth())
		{
			enterpriseRoute.GET("/overview", controller.EnterpriseGetOverview)
			enterpriseRoute.GET("/members", controller.EnterpriseListMembers)
			enterpriseRoute.PUT("/members/:id", controller.EnterpriseUpdateMemberRole)
			enterpriseRoute.DELETE("/members/:id", controller.EnterpriseDisableMember)
			enterpriseRoute.GET("/keys", controller.EnterpriseListKeys)
			enterpriseRoute.POST("/keys", controller.EnterpriseCreateKey)
			enterpriseRoute.PUT("/keys/:id", controller.EnterpriseUpdateKey)
			enterpriseRoute.DELETE("/keys/:id", controller.EnterpriseDeleteKey)
			enterpriseRoute.PATCH("/keys/:id/status", controller.EnterpriseToggleKeyStatus)
			enterpriseRoute.GET("/audit-logs", controller.EnterpriseGetAuditLogs)
			enterpriseRoute.GET("/settings", controller.EnterpriseGetSettings)
			enterpriseRoute.PUT("/settings", controller.EnterpriseUpdateSettings)
			// Phase 1 insights + CSV exports
			enterpriseRoute.GET("/insights/top-spenders", controller.EnterpriseTopSpenders)
			enterpriseRoute.GET("/insights/model-breakdown", controller.EnterpriseModelBreakdown)
			enterpriseRoute.GET("/export/members", controller.EnterpriseExportMembers)
			enterpriseRoute.GET("/export/audit-logs", controller.EnterpriseExportAuditLogs)
			enterpriseRoute.GET("/export/billing", controller.EnterpriseExportMonthlyBilling)
			// Phase 2 workgroup management
			enterpriseRoute.GET("/workgroups/stats", controller.EnterpriseWorkgroupStats)
			enterpriseRoute.GET("/workgroups", controller.EnterpriseListWorkgroups)
			enterpriseRoute.POST("/workgroups", controller.EnterpriseCreateWorkgroup)
			enterpriseRoute.PUT("/workgroups/:wg_id", controller.EnterpriseUpdateWorkgroup)
			enterpriseRoute.DELETE("/workgroups/:wg_id", controller.EnterpriseDeleteWorkgroup)
			enterpriseRoute.GET("/workgroups/:wg_id/members", controller.EnterpriseListWorkgroupMembers)
			enterpriseRoute.POST("/workgroups/:wg_id/members", controller.EnterpriseAssignWorkgroupMember)
			enterpriseRoute.DELETE("/workgroups/:wg_id/members/:user_id", controller.EnterpriseRemoveWorkgroupMember)
			enterpriseRoute.PUT("/workgroups/:wg_id/limit", controller.EnterpriseSetWorkgroupLimit)
			// Phase 2 member limit + status management
			enterpriseRoute.PUT("/members/:id/limit", controller.EnterpriseSetMemberLimit)
			enterpriseRoute.GET("/members/:id/limits", controller.EnterpriseGetMemberLimits)
			enterpriseRoute.PATCH("/members/:id/status", controller.EnterpriseToggleMemberStatus)
		}

		// ===== 代理销售体系 =====
		agentAdminRoute := apiRouter.Group("/admin/agents")
		agentAdminRoute.Use(middleware.AdminAuth())
		{
			agentAdminRoute.GET("/", controller.AdminListAgents)
			agentAdminRoute.GET("/user-search", controller.AdminSearchUsersForAgent)
			agentAdminRoute.GET("/performance", controller.AdminGetSalesPerformance) // 销售业绩看板（含1/2/3级下属）
			agentAdminRoute.GET("/leaderboard", controller.AdminGetLeaderboard)     // 销售排行榜（按账本佣金）
			agentAdminRoute.POST("/:id/level", controller.AdminSetAgentLevel)
			agentAdminRoute.GET("/:id/customers", controller.AdminGetAgentCustomers)
			agentAdminRoute.GET("/:id/stats", controller.AdminGetAgentStats)
			// 销售身份申请审批
			agentAdminRoute.GET("/applications", controller.AdminListSalesApplications)
			// 佣金账本风控：冻结/解冻、自邀风控审核
			agentAdminRoute.POST("/:id/freeze", controller.AdminFreezeAgent)
			agentAdminRoute.POST("/:id/fraud-review", controller.AdminReviewFraud)
		}
		commissionAdminRoute := apiRouter.Group("/admin/commission")
		commissionAdminRoute.Use(middleware.AdminAuth())
		{
			commissionAdminRoute.GET("/ledger", controller.AdminListLedger)
			commissionAdminRoute.POST("/manual", controller.AdminManualCommission)
			commissionAdminRoute.POST("/:id/void", controller.AdminVoidCommission)
			commissionAdminRoute.POST("/clawback", controller.AdminClawbackCommission)
			commissionAdminRoute.GET("/fraud", controller.AdminListFraudUsers)
			commissionAdminRoute.GET("/audit", controller.AdminListCommissionAudit)
			commissionAdminRoute.POST("/backfill", controller.AdminBackfillCommission)
		}
		withdrawalAdminRoute := apiRouter.Group("/admin/agent-withdrawals")
		withdrawalAdminRoute.Use(middleware.AdminAuth())
		{
			withdrawalAdminRoute.GET("/", controller.AdminListWithdrawals)
			withdrawalAdminRoute.PUT("/:id", controller.AdminProcessWithdrawal)
		}
		agentSelfRoute := apiRouter.Group("/user/agent")
		agentSelfRoute.Use(middleware.UserAuth())
		{
			agentSelfRoute.GET("/info", controller.AgentGetSelfInfo)
			agentSelfRoute.GET("/ledger", controller.AgentGetLedger)
			agentSelfRoute.GET("/customers", controller.AgentGetCustomers)
			agentSelfRoute.POST("/withdrawals", controller.AgentSubmitWithdrawal)
			agentSelfRoute.GET("/withdrawals", controller.AgentGetWithdrawals)
			// 销售身份申请
			agentSelfRoute.POST("/apply", controller.UserApplyForSales)
			agentSelfRoute.GET("/apply/self", controller.UserGetMyApplication)
			agentSelfRoute.GET("/downline-applications", controller.UserListMyDownlineApplications)
		}
		// 销售身份申请审批（双向可见：admin 或 申请人 inviter）
		appReviewRoute := apiRouter.Group("/agent/applications")
		appReviewRoute.Use(middleware.UserAuth())
		{
			appReviewRoute.POST("/:id/review", controller.ReviewSalesApplication)
		}

		optionRoute := apiRouter.Group("/option")
		optionRoute.Use(middleware.RootAuth())
		{
			optionRoute.GET("/", controller.GetOptions)
			optionRoute.PUT("/", controller.UpdateOption)
			optionRoute.GET("/channel_affinity_cache", controller.GetChannelAffinityCacheStats)
			optionRoute.DELETE("/channel_affinity_cache", controller.ClearChannelAffinityCache)
			optionRoute.POST("/rest_model_ratio", controller.ResetModelRatio)
			optionRoute.POST("/migrate_console_setting", controller.MigrateConsoleSetting) // 用于迁移检测的旧键，下个版本会删除
		}

		// Custom OAuth provider management (root only)
		customOAuthRoute := apiRouter.Group("/custom-oauth-provider")
		customOAuthRoute.Use(middleware.RootAuth())
		{
			customOAuthRoute.POST("/discovery", controller.FetchCustomOAuthDiscovery)
			customOAuthRoute.GET("/", controller.GetCustomOAuthProviders)
			customOAuthRoute.GET("/:id", controller.GetCustomOAuthProvider)
			customOAuthRoute.POST("/", controller.CreateCustomOAuthProvider)
			customOAuthRoute.PUT("/:id", controller.UpdateCustomOAuthProvider)
			customOAuthRoute.DELETE("/:id", controller.DeleteCustomOAuthProvider)
		}
		performanceRoute := apiRouter.Group("/performance")
		performanceRoute.Use(middleware.RootAuth())
		{
			performanceRoute.GET("/stats", controller.GetPerformanceStats)
			performanceRoute.DELETE("/disk_cache", controller.ClearDiskCache)
			performanceRoute.POST("/reset_stats", controller.ResetPerformanceStats)
			performanceRoute.POST("/gc", controller.ForceGC)
			performanceRoute.GET("/logs", controller.GetLogFiles)
			performanceRoute.DELETE("/logs", controller.CleanupLogFiles)
		}
		ratioSyncRoute := apiRouter.Group("/ratio_sync")
		ratioSyncRoute.Use(middleware.RootAuth())
		{
			ratioSyncRoute.GET("/channels", controller.GetSyncableChannels)
			ratioSyncRoute.POST("/fetch", controller.FetchUpstreamRatios)
		}
		channelRoute := apiRouter.Group("/channel")
		channelRoute.Use(middleware.AdminAuth())
		{
			channelRoute.GET("/", controller.GetAllChannels)
			channelRoute.GET("/search", controller.SearchChannels)
			channelRoute.GET("/models", controller.ChannelListModels)
			channelRoute.GET("/models_enabled", controller.EnabledListModels)
			channelRoute.GET("/:id", controller.GetChannel)
			channelRoute.POST("/:id/key", middleware.RootAuth(), middleware.CriticalRateLimit(), middleware.DisableCache(), middleware.SecureVerificationRequired(), controller.GetChannelKey)
			channelRoute.GET("/test", controller.TestAllChannels)
			channelRoute.GET("/test/:id", controller.TestChannel)
			channelRoute.POST("/silence_check", controller.RunChannelSilenceCheck)
			channelRoute.GET("/health", controller.GetChannelHealth)
			// 渠道稳定性监控 + 升降档调度
			channelRoute.GET("/stability/list", controller.GetChannelStabilityList)
			channelRoute.GET("/stability/:id/history", controller.GetChannelStabilityHistory)
			channelRoute.GET("/stability/schedule_log", controller.GetChannelScheduleLogs)
			channelRoute.POST("/stability/run_schedule", controller.RunChannelScheduleEvaluation)
			channelRoute.GET("/update_balance", controller.UpdateAllChannelsBalance)
			channelRoute.GET("/update_balance/:id", controller.UpdateChannelBalance)
			channelRoute.POST("/", controller.AddChannel)
			channelRoute.PUT("/", controller.UpdateChannel)
			channelRoute.DELETE("/disabled", controller.DeleteDisabledChannel)
			channelRoute.POST("/tag/disabled", controller.DisableTagChannels)
			channelRoute.POST("/tag/enabled", controller.EnableTagChannels)
			channelRoute.PUT("/tag", controller.EditTagChannels)
			channelRoute.DELETE("/:id", controller.DeleteChannel)
			channelRoute.POST("/batch", controller.DeleteChannelBatch)
			channelRoute.POST("/fix", controller.FixChannelsAbilities)
			channelRoute.GET("/fetch_models/:id", controller.FetchUpstreamModels)
			channelRoute.POST("/fetch_models", middleware.RootAuth(), controller.FetchModels)
			channelRoute.POST("/codex/oauth/start", controller.StartCodexOAuth)
			channelRoute.POST("/codex/oauth/complete", controller.CompleteCodexOAuth)
			channelRoute.POST("/:id/codex/oauth/start", controller.StartCodexOAuthForChannel)
			channelRoute.POST("/:id/codex/oauth/complete", controller.CompleteCodexOAuthForChannel)
			channelRoute.POST("/:id/codex/refresh", controller.RefreshCodexChannelCredential)
			channelRoute.GET("/:id/codex/usage", controller.GetCodexChannelUsage)
			channelRoute.POST("/ollama/pull", controller.OllamaPullModel)
			channelRoute.POST("/ollama/pull/stream", controller.OllamaPullModelStream)
			channelRoute.DELETE("/ollama/delete", controller.OllamaDeleteModel)
			channelRoute.GET("/ollama/version/:id", controller.OllamaVersion)
			channelRoute.POST("/batch/tag", controller.BatchSetChannelTag)
			channelRoute.GET("/tag/models", controller.GetTagModels)
			channelRoute.POST("/copy/:id", controller.CopyChannel)
			channelRoute.POST("/multi_key/manage", controller.ManageMultiKeys)
			channelRoute.POST("/upstream_updates/apply", controller.ApplyChannelUpstreamModelUpdates)
			channelRoute.POST("/upstream_updates/apply_all", controller.ApplyAllChannelUpstreamModelUpdates)
			channelRoute.POST("/upstream_updates/detect", controller.DetectChannelUpstreamModelUpdates)
			channelRoute.POST("/upstream_updates/detect_all", controller.DetectAllChannelUpstreamModelUpdates)
		}
		tokenRoute := apiRouter.Group("/token")
		tokenRoute.Use(middleware.UserAuth())
		{
			tokenRoute.GET("/", controller.GetAllTokens)
			tokenRoute.GET("/search", middleware.SearchRateLimit(), controller.SearchTokens)
			tokenRoute.GET("/:id", controller.GetToken)
			tokenRoute.POST("/:id/key", middleware.CriticalRateLimit(), middleware.DisableCache(), controller.GetTokenKey)
			tokenRoute.POST("/", controller.AddToken)
			tokenRoute.PUT("/", controller.UpdateToken)
			tokenRoute.DELETE("/:id", controller.DeleteToken)
			tokenRoute.POST("/batch", controller.DeleteTokenBatch)
			tokenRoute.POST("/batch/keys", middleware.CriticalRateLimit(), middleware.DisableCache(), controller.GetTokenKeysBatch)
		}

		usageRoute := apiRouter.Group("/usage")
		usageRoute.Use(middleware.CORS(), middleware.CriticalRateLimit())
		{
			tokenUsageRoute := usageRoute.Group("/token")
			tokenUsageRoute.Use(middleware.TokenAuthReadOnly())
			{
				tokenUsageRoute.GET("/", controller.GetTokenUsage)
			}
		}

		redemptionRoute := apiRouter.Group("/redemption")
		redemptionRoute.Use(middleware.AdminAuth())
		{
			redemptionRoute.GET("/", controller.GetAllRedemptions)
			redemptionRoute.GET("/search", controller.SearchRedemptions)
			redemptionRoute.GET("/:id", controller.GetRedemption)
			redemptionRoute.POST("/", controller.AddRedemption)
			redemptionRoute.PUT("/", controller.UpdateRedemption)
			redemptionRoute.DELETE("/invalid", controller.DeleteInvalidRedemption)
			redemptionRoute.DELETE("/:id", controller.DeleteRedemption)
		}
		logRoute := apiRouter.Group("/log")
		logRoute.GET("/", middleware.AdminAuth(), controller.GetAllLogs)
		logRoute.DELETE("/", middleware.AdminAuth(), controller.DeleteHistoryLogs)
		logRoute.GET("/stat", middleware.AdminAuth(), controller.GetLogsStat)
		logRoute.GET("/self/stat", middleware.UserAuth(), controller.GetLogsSelfStat)
		logRoute.GET("/channel_affinity_usage_cache", middleware.AdminAuth(), controller.GetChannelAffinityUsageCacheStats)
		logRoute.GET("/search", middleware.AdminAuth(), controller.SearchAllLogs)
		logRoute.GET("/self", middleware.UserAuth(), controller.GetUserLogs)
		logRoute.GET("/self/search", middleware.UserAuth(), middleware.SearchRateLimit(), controller.SearchUserLogs)

		dataRoute := apiRouter.Group("/data")
		dataRoute.GET("/", middleware.AdminAuth(), controller.GetAllQuotaDates)
		dataRoute.GET("/users", middleware.AdminAuth(), controller.GetQuotaDatesByUser)
		dataRoute.GET("/self", middleware.UserAuth(), controller.GetUserQuotaDates)

		logRoute.Use(middleware.CORS(), middleware.CriticalRateLimit())
		{
			logRoute.GET("/token", middleware.TokenAuthReadOnly(), controller.GetLogByKey)
		}
		groupRoute := apiRouter.Group("/group")
		groupRoute.Use(middleware.AdminAuth())
		{
			groupRoute.GET("/", controller.GetGroups)
		}

		prefillGroupRoute := apiRouter.Group("/prefill_group")
		prefillGroupRoute.Use(middleware.AdminAuth())
		{
			prefillGroupRoute.GET("/", controller.GetPrefillGroups)
			prefillGroupRoute.POST("/", controller.CreatePrefillGroup)
			prefillGroupRoute.PUT("/", controller.UpdatePrefillGroup)
			prefillGroupRoute.DELETE("/:id", controller.DeletePrefillGroup)
		}

		mjRoute := apiRouter.Group("/mj")
		mjRoute.GET("/self", middleware.UserAuth(), controller.GetUserMidjourney)
		mjRoute.GET("/", middleware.AdminAuth(), controller.GetAllMidjourney)

		taskRoute := apiRouter.Group("/task")
		{
			taskRoute.GET("/self", middleware.UserAuth(), controller.GetUserTask)
			taskRoute.GET("/", middleware.AdminAuth(), controller.GetAllTask)
		}

		vendorRoute := apiRouter.Group("/vendors")
		vendorRoute.Use(middleware.AdminAuth())
		{
			vendorRoute.GET("/", controller.GetAllVendors)
			vendorRoute.GET("/search", controller.SearchVendors)
			vendorRoute.GET("/:id", controller.GetVendorMeta)
			vendorRoute.POST("/", controller.CreateVendorMeta)
			vendorRoute.PUT("/", controller.UpdateVendorMeta)
			vendorRoute.DELETE("/:id", controller.DeleteVendorMeta)
		}

		modelsRoute := apiRouter.Group("/models")
		modelsRoute.Use(middleware.AdminAuth())
		{
			modelsRoute.GET("/sync_upstream/preview", controller.SyncUpstreamPreview)
			modelsRoute.POST("/sync_upstream", controller.SyncUpstreamModels)
			modelsRoute.GET("/missing", controller.GetMissingModels)
			modelsRoute.GET("/", controller.GetAllModelsMeta)
			modelsRoute.GET("/search", controller.SearchModelsMeta)
			modelsRoute.GET("/:id", controller.GetModelMeta)
			modelsRoute.POST("/", controller.CreateModelMeta)
			modelsRoute.PUT("/", controller.UpdateModelMeta)
			modelsRoute.DELETE("/:id", controller.DeleteModelMeta)
		}

		// Deployments (model deployment management)
		deploymentsRoute := apiRouter.Group("/deployments")
		deploymentsRoute.Use(middleware.AdminAuth())
		{
			deploymentsRoute.GET("/settings", controller.GetModelDeploymentSettings)
			deploymentsRoute.POST("/settings/test-connection", controller.TestIoNetConnection)
			deploymentsRoute.GET("/", controller.GetAllDeployments)
			deploymentsRoute.GET("/search", controller.SearchDeployments)
			deploymentsRoute.POST("/test-connection", controller.TestIoNetConnection)
			deploymentsRoute.GET("/hardware-types", controller.GetHardwareTypes)
			deploymentsRoute.GET("/locations", controller.GetLocations)
			deploymentsRoute.GET("/available-replicas", controller.GetAvailableReplicas)
			deploymentsRoute.POST("/price-estimation", controller.GetPriceEstimation)
			deploymentsRoute.GET("/check-name", controller.CheckClusterNameAvailability)
			deploymentsRoute.POST("/", controller.CreateDeployment)

			deploymentsRoute.GET("/:id", controller.GetDeployment)
			deploymentsRoute.GET("/:id/logs", controller.GetDeploymentLogs)
			deploymentsRoute.GET("/:id/containers", controller.ListDeploymentContainers)
			deploymentsRoute.GET("/:id/containers/:container_id", controller.GetContainerDetails)
			deploymentsRoute.PUT("/:id", controller.UpdateDeployment)
			deploymentsRoute.PUT("/:id/name", controller.UpdateDeploymentName)
			deploymentsRoute.POST("/:id/extend", controller.ExtendDeployment)
			deploymentsRoute.DELETE("/:id", controller.DeleteDeployment)
		}
	}
}
