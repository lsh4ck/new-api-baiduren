import { z } from 'zod'

// ============================================================================
// 个人控制台类型定义
// ============================================================================

// 订阅计划类型
export type SubscriptionPlan = 'free' | 'monthly_99' | 'monthly_299'

export interface SubscriptionInfo {
  plan: SubscriptionPlan
  status: 'active' | 'expired' | 'canceled'
  startDate: string
  endDate: string
  autoRenew: boolean
}

// 用量统计
export interface UsageStats {
  monthlyQuota: number
  usedQuota: number
  requestCount: number
  tokenUsage: {
    prompt: number
    completion: number
    total: number
  }
  cost: number
}

// 模型偏好
export interface ModelPreference {
  id: string
  name: string
  usageCount: number
  isFavorite: boolean
  channel?: string
}

// 用量日志条目
export interface UsageLogEntry {
  id: string
  timestamp: string
  model: string
  promptTokens: number
  completionTokens: number
  totalTokens: number
  cost: number
  status: 'success' | 'error' | 'timeout'
  channel?: string
  latency?: number
}

// API Key 信息
export interface PersonalApiKey {
  id: number
  name: string
  key: string
  prefix: string
  status: 'active' | 'disabled' | 'expired'
  createdAt: string
  lastUsedAt?: string
  usageCount: number
  monthlyCost: number
  modelLimits?: string[]
  ipWhitelist?: string[]
  expiresAt?: string
}

// 账户信息
export interface AccountInfo {
  id: number
  username: string
  displayName: string
  email: string
  avatar?: string
  balance: number
  totalRecharge: number
  totalUsage: number
  affCode?: string
  subscription?: SubscriptionInfo
}

// ============================================================================
// 企业控制台类型定义
// ============================================================================

// 工作区信息
export interface Workspace {
  id: string
  name: string
  slug: string
  createdAt: string
  memberCount: number
  apiKeyCount: number
  monthlyUsage: number
  monthlyBudget: number
  timezone: string
  dataResidency: string
}

// 工作区成员
export interface WorkspaceMember {
  id: string
  name: string
  email: string
  avatar?: string
  role: 'admin' | 'member' | 'readonly' | 'billing'
  joinedAt: string
  monthlyUsage: number
  lastActiveAt?: string
}

// 企业 API Key
export interface EnterpriseApiKey {
  id: string
  name: string
  key: string
  prefix: string
  status: 'active' | 'disabled' | 'expired'
  createdAt: string
  lastUsedAt?: string
  usageCount: number
  monthlyCost: number
  monthlyQuota: number
  ipWhitelist: string[]
  modelWhitelist: string[]
  modelBlacklist: string[]
  expiresAt?: string
  createdBy: string
}

// 审计日志
export interface AuditLogEntry {
  id: string
  timestamp: string
  actor: string
  actorEmail: string
  eventType: string
  resource: string
  resourceId?: string
  result: 'success' | 'failure' | 'denied'
  ip: string
  details?: Record<string, unknown>
}

// 小组配额
export interface GroupQuota {
  id: string
  name: string
  members: string[]
  monthlyQuota: number
  usedQuota: number
}

// 工作区设置
export interface WorkspaceSettings {
  name: string
  slug: string
  timezone: string
  defaultRetry: number
  enableFailover: boolean
  enablePIIMasking: boolean
  dataResidency: string
  monthlyBudget: number
  budgetAlertThreshold: number[]
}

// ============================================================================
// API 响应类型
// ============================================================================

export interface ApiResponse<T = unknown> {
  success: boolean
  message?: string
  data?: T
}

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}
