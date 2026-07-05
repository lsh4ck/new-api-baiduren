export type SubscriptionAccount = {
  id: number
  platform: string
  account_type: string
  account_name: string
  email: string
  expires_at: string
  status: string
  priority: number
  schedulable: boolean
  rate_limited_at?: string
  rate_limit_reset_at?: string
  overload_until?: string
  unschedulable_until?: string
  unschedulable_reason?: string
  rate_multiplier: number
  usage_limit: number
  used_this_month: number
  total_used: number
  last_used_at: string
  proxy_id: number
  proxy_url: string
  rpm: number
  max_concurrent: number
  created_at: string
  updated_at: string
}

export type SubscriptionAccountListResponse = {
  accounts: SubscriptionAccount[]
  total: number
  page: number
  size: number
}

export type SubscriptionAccountPayload = {
  platform: string
  account_type?: string
  account_name: string
  email?: string
  access_token?: string
  refresh_token?: string
  credentials?: string
  expires_at?: string
  status?: string
  priority?: number
  schedulable?: boolean
  usage_limit?: number
  rate_multiplier?: number
  group_id?: number
  proxy_id?: number
  proxy_url?: string
  rpm?: number
  max_concurrent?: number
}

export type SubscriptionAccountUpdatePayload = {
  account_name?: string
  email?: string
  status?: string
  priority?: number
  schedulable?: boolean
  usage_limit?: number
  rate_multiplier?: number
  group_id?: number
  proxy_id?: number
  proxy_url?: string
  rpm?: number
  max_concurrent?: number
}

export type SubscriptionAccountsDialogType =
  | 'create'
  | 'update'
  | 'delete'
  | 'refresh'
  | 'test'
  | 'resetRateLimit'

// ─── 订阅分组 ──────────────────────────────────────────────────────────────

export type SubscriptionGroup = {
  id: number
  name: string
  description: string
  platform: string
  status: string
  model_routing: string
  daily_spending_limit: number
  weekly_spending_limit: number
  monthly_spending_limit: number
  rpm_limit: number
  max_concurrent: number
  mcp_xml_enabled: boolean
  claude_code_only: boolean
  allow_antigravity_fallback: boolean
  image_rate_1k: number
  image_rate_2k: number
  image_rate_4k: number
  created_at: string
  updated_at: string
}

export type SubscriptionGroupListResponse = {
  groups: SubscriptionGroup[]
  total: number
  page: number
  size: number
}

export type SubscriptionGroupPayload = {
  name: string
  description?: string
  platform?: string
  status?: string
  model_routing?: string
  daily_spending_limit?: number
  weekly_spending_limit?: number
  monthly_spending_limit?: number
  rpm_limit?: number
  max_concurrent?: number
  mcp_xml_enabled?: boolean
  claude_code_only?: boolean
  allow_antigravity_fallback?: boolean
  image_rate_1k?: number
  image_rate_2k?: number
  image_rate_4k?: number
}

export type SubscriptionGroupsDialogType = 'create' | 'update' | 'delete'

// ─── 代理池 ────────────────────────────────────────────────────────────────

export type SubscriptionProxy = {
  id: number
  name: string
  url: string
  status: string
  description: string
  last_checked_at?: string
  is_healthy: boolean
  fail_count: number
  created_at: string
  updated_at: string
}

export type SubscriptionProxyListResponse = {
  proxies: SubscriptionProxy[]
  total: number
  page: number
  size: number
}

export type SubscriptionProxyPayload = {
  name: string
  url: string
  status?: string
  description?: string
}

export type SubscriptionProxiesDialogType = 'create' | 'update' | 'delete' | 'test'
