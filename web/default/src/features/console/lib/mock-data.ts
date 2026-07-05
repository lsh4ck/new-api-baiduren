// ============================================================================
// Mock 数据 — 真实可信的模拟数据
// ============================================================================

import type {
  AccountInfo,
  UsageStats,
  UsageLogEntry,
  ModelPreference,
  PersonalApiKey,
  Workspace,
  WorkspaceMember,
  EnterpriseApiKey,
  AuditLogEntry,
  GroupQuota,
  WorkspaceSettings,
} from './types'

// ─── 个人账户 ───

export const mockAccount: AccountInfo = {
  id: 1024,
  username: 'alex_dev',
  displayName: 'Alex Chen',
  email: 'alex@example.com',
  balance: 156.80,
  totalRecharge: 500,
  totalUsage: 343.20,
  affCode: 'ALEX2024',
  subscription: {
    plan: 'monthly_99',
    status: 'active',
    startDate: '2026-04-15T00:00:00Z',
    endDate: '2026-05-15T00:00:00Z',
    autoRenew: true,
  },
}

// ─── 用量统计 ───

export const mockUsageStats: UsageStats = {
  monthlyQuota: 500,
  usedQuota: 312.45,
  requestCount: 1847,
  tokenUsage: {
    prompt: 2450000,
    completion: 1890000,
    total: 4340000,
  },
  cost: 312.45,
}

// ─── 用量日志 ───

export const MODEL_NAMES = [
  'gpt-4o',
  'claude-sonnet-4-20250514',
  'gemini-2.5-pro',
  'deepseek-v3',
  'qwen-max',
  'claude-opus-4-20250514',
  'gpt-4o-mini',
  'gemini-2.5-flash',
  'deepseek-r1',
  'qwen-plus',
]

export const CHANNEL_NAMES = [
  'OpenAI',
  'Anthropic',
  'Google',
  'DeepSeek',
  '阿里百炼',
  '智谱AI',
]

function randomDate(daysBack: number): string {
  const now = new Date()
  const past = new Date(now.getTime() - daysBack * 24 * 60 * 60 * 1000)
  const random = new Date(past.getTime() + Math.random() * (now.getTime() - past.getTime()))
  return random.toISOString()
}

export function generateMockUsageLogs(count: number): UsageLogEntry[] {
  return Array.from({ length: count }, (_, i) => {
    const model = MODEL_NAMES[Math.floor(Math.random() * MODEL_NAMES.length)]
    const promptTokens = Math.floor(Math.random() * 8000) + 100
    const completionTokens = Math.floor(Math.random() * 4000) + 50
    const cost = (promptTokens * 0.001 + completionTokens * 0.003) / 1000
    const statuses: UsageLogEntry['status'][] = ['success', 'success', 'success', 'success', 'error', 'timeout']
    return {
      id: `log-${i + 1}`,
      timestamp: randomDate(30),
      model,
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
      cost: parseFloat(cost.toFixed(4)),
      status: statuses[Math.floor(Math.random() * statuses.length)],
      channel: CHANNEL_NAMES[Math.floor(Math.random() * CHANNEL_NAMES.length)],
      latency: Math.floor(Math.random() * 3000) + 200,
    }
  }).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
}

export const mockUsageLogs = generateMockUsageLogs(50)

// ─── 模型偏好 ───

export const mockModelPreferences: ModelPreference[] = [
  { id: '1', name: 'gpt-4o', usageCount: 523, isFavorite: true },
  { id: '2', name: 'claude-sonnet-4-20250514', usageCount: 412, isFavorite: true },
  { id: '3', name: 'gemini-2.5-pro', usageCount: 289, isFavorite: true },
  { id: '4', name: 'deepseek-v3', usageCount: 198, isFavorite: false },
  { id: '5', name: 'qwen-max', usageCount: 156, isFavorite: false },
  { id: '6', name: 'gpt-4o-mini', usageCount: 134, isFavorite: false },
  { id: '7', name: 'gemini-2.5-flash', usageCount: 89, isFavorite: false },
  { id: '8', name: 'claude-opus-4-20250514', usageCount: 46, isFavorite: true },
]

// ─── 个人 API Keys ───

export const mockApiKeys: PersonalApiKey[] = [
  {
    id: 1,
    name: '默认 Key',
    key: 'sk-xxxx1a2b3c4d5e6f7g8h9i0j1k2l3m4n5o6p7q8r9s0t',
    prefix: 'sk-xxxx1',
    status: 'active',
    createdAt: '2026-01-15T10:30:00Z',
    lastUsedAt: '2026-05-08T08:15:00Z',
    usageCount: 1234,
    monthlyCost: 156.80,
  },
  {
    id: 2,
    name: 'Claude Code',
    key: 'sk-xxxx2b3c4d5e6f7g8h9i0j1k2l3m4n5o6p7q8r9s0t1u',
    prefix: 'sk-xxxx2',
    status: 'active',
    createdAt: '2026-02-20T14:00:00Z',
    lastUsedAt: '2026-05-07T22:45:00Z',
    usageCount: 412,
    monthlyCost: 89.20,
    modelLimits: ['claude-sonnet-4-20250514', 'claude-opus-4-20250514'],
  },
  {
    id: 3,
    name: '测试 Key',
    key: 'sk-xxxx3c4d5e6f7g8h9i0j1k2l3m4n5o6p7q8r9s0t1u2v',
    prefix: 'sk-xxxx3',
    status: 'disabled',
    createdAt: '2026-03-10T09:00:00Z',
    lastUsedAt: '2026-04-01T11:30:00Z',
    usageCount: 56,
    monthlyCost: 12.40,
  },
  {
    id: 4,
    name: 'Gemini 专用',
    key: 'sk-xxxx4d5e6f7g8h9i0j1k2l3m4n5o6p7q8r9s0t1u2v3w',
    prefix: 'sk-xxxx4',
    status: 'active',
    createdAt: '2026-04-01T16:00:00Z',
    lastUsedAt: '2026-05-08T06:00:00Z',
    usageCount: 289,
    monthlyCost: 54.05,
    modelLimits: ['gemini-2.5-pro', 'gemini-2.5-flash'],
  },
]

// ─── 工作区 ───

export const mockWorkspace: Workspace = {
  id: 'ws-acme-corp',
  name: 'Acme Corp',
  slug: 'acme-corp',
  createdAt: '2025-11-01T00:00:00Z',
  memberCount: 12,
  apiKeyCount: 8,
  monthlyUsage: 2456.78,
  monthlyBudget: 5000,
  timezone: 'Asia/Shanghai',
  dataResidency: 'cn-north-1',
}

// ─── 团队成员 ───

export const mockTeamMembers: WorkspaceMember[] = [
  {
    id: 'm1',
    name: 'Alex Chen',
    email: 'alex@acme.corp',
    role: 'admin',
    joinedAt: '2025-11-01T00:00:00Z',
    monthlyUsage: 312.45,
    lastActiveAt: '2026-05-08T08:15:00Z',
  },
  {
    id: 'm2',
    name: 'Bob Wang',
    email: 'bob@acme.corp',
    role: 'admin',
    joinedAt: '2025-11-05T00:00:00Z',
    monthlyUsage: 567.89,
    lastActiveAt: '2026-05-07T18:30:00Z',
  },
  {
    id: 'm3',
    name: 'Carol Li',
    email: 'carol@acme.corp',
    role: 'member',
    joinedAt: '2025-12-01T00:00:00Z',
    monthlyUsage: 234.56,
    lastActiveAt: '2026-05-08T07:00:00Z',
  },
  {
    id: 'm4',
    name: 'David Zhang',
    email: 'david@acme.corp',
    role: 'member',
    joinedAt: '2026-01-10T00:00:00Z',
    monthlyUsage: 189.32,
  },
  {
    id: 'm5',
    name: 'Eve Liu',
    email: 'eve@acme.corp',
    role: 'billing',
    joinedAt: '2026-01-15T00:00:00Z',
    monthlyUsage: 45.67,
    lastActiveAt: '2026-05-06T14:20:00Z',
  },
  {
    id: 'm6',
    name: 'Frank Wu',
    email: 'frank@acme.corp',
    role: 'readonly',
    joinedAt: '2026-02-01T00:00:00Z',
    monthlyUsage: 12.34,
  },
  {
    id: 'm7',
    name: 'Grace Huang',
    email: 'grace@acme.corp',
    role: 'member',
    joinedAt: '2026-03-01T00:00:00Z',
    monthlyUsage: 456.78,
    lastActiveAt: '2026-05-08T09:45:00Z',
  },
  {
    id: 'm8',
    name: 'Henry Xu',
    email: 'henry@acme.corp',
    role: 'member',
    joinedAt: '2026-03-15T00:00:00Z',
    monthlyUsage: 98.76,
  },
]

// ─── 企业 API Keys ───

export const mockEnterpriseKeys: EnterpriseApiKey[] = [
  {
    id: 'ek1',
    name: '生产环境 Key',
    key: 'sk-ent1aaaa2b3c4d5e6f7g8h9i0j1k2l3m4n5o6p7q8r9s',
    prefix: 'sk-ent1',
    status: 'active',
    createdAt: '2025-11-01T00:00:00Z',
    lastUsedAt: '2026-05-08T09:50:00Z',
    usageCount: 8934,
    monthlyCost: 1245.67,
    monthlyQuota: 5000,
    ipWhitelist: ['203.0.113.0/24', '198.51.100.50'],
    modelWhitelist: [],
    modelBlacklist: [],
    createdBy: 'Alex Chen',
  },
  {
    id: 'ek2',
    name: '开发环境 Key',
    key: 'sk-ent2bbbb3c4d5e6f7g8h9i0j1k2l3m4n5o6p7q8r9s0t',
    prefix: 'sk-ent2',
    status: 'active',
    createdAt: '2025-12-01T00:00:00Z',
    lastUsedAt: '2026-05-08T08:30:00Z',
    usageCount: 3456,
    monthlyCost: 567.89,
    monthlyQuota: 2000,
    ipWhitelist: ['10.0.0.0/8'],
    modelWhitelist: ['gpt-4o-mini', 'deepseek-v3', 'qwen-plus'],
    modelBlacklist: [],
    createdBy: 'Bob Wang',
  },
  {
    id: 'ek3',
    name: '测试 Key (即将过期)',
    key: 'sk-ent3cccc4d5e6f7g8h9i0j1k2l3m4n5o6p7q8r9s0t1u',
    prefix: 'sk-ent3',
    status: 'active',
    createdAt: '2026-02-01T00:00:00Z',
    lastUsedAt: '2026-04-28T16:00:00Z',
    usageCount: 234,
    monthlyCost: 23.45,
    monthlyQuota: 500,
    ipWhitelist: [],
    modelWhitelist: [],
    modelBlacklist: ['claude-opus-4-20250514'],
    expiresAt: '2026-05-15T00:00:00Z',
    createdBy: 'Carol Li',
  },
  {
    id: 'ek4',
    name: '已禁用 Key',
    key: 'sk-ent4dddd5e6f7g8h9i0j1k2l3m4n5o6p7q8r9s0t1u2v',
    prefix: 'sk-ent4',
    status: 'disabled',
    createdAt: '2026-01-01T00:00:00Z',
    usageCount: 12,
    monthlyCost: 0,
    monthlyQuota: 100,
    ipWhitelist: [],
    modelWhitelist: [],
    modelBlacklist: [],
    createdBy: 'Alex Chen',
  },
]

// ─── 审计日志 ───

const AUDIT_EVENT_TYPES = [
  'api_key.created',
  'api_key.deleted',
  'api_key.status_changed',
  'member.invited',
  'member.role_changed',
  'member.removed',
  'workspace.settings_updated',
  'workspace.budget_exceeded',
  'billing.payment_received',
  'auth.login',
  'auth.login_failed',
]

const AUDIT_RESOURCES = [
  'api_key',
  'member',
  'workspace',
  'billing',
  'settings',
]

export function generateMockAuditLogs(count: number): AuditLogEntry[] {
  return Array.from({ length: count }, (_, i) => {
    const eventType = AUDIT_EVENT_TYPES[Math.floor(Math.random() * AUDIT_EVENT_TYPES.length)]
    const resource = AUDIT_RESOURCES[Math.floor(Math.random() * AUDIT_RESOURCES.length)]
    const member = mockTeamMembers[Math.floor(Math.random() * mockTeamMembers.length)]
    const results: AuditLogEntry['result'][] = ['success', 'success', 'success', 'failure', 'denied']
    return {
      id: `audit-${i + 1}`,
      timestamp: randomDate(60),
      actor: member.name,
      actorEmail: member.email,
      eventType,
      resource,
      resourceId: `${resource}-${Math.floor(Math.random() * 100)}`,
      result: results[Math.floor(Math.random() * results.length)],
      ip: `203.0.113.${Math.floor(Math.random() * 255)}`,
    }
  }).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
}

export const mockAuditLogs = generateMockAuditLogs(40)

// ─── 小组配额 ───

export const mockGroupQuotas: GroupQuota[] = [
  {
    id: 'gq1',
    name: '研发团队',
    members: ['m1', 'm2', 'm3', 'm4'],
    monthlyQuota: 3000,
    usedQuota: 1892.45,
  },
  {
    id: 'gq2',
    name: '产品团队',
    members: ['m5', 'm6'],
    monthlyQuota: 1000,
    usedQuota: 456.78,
  },
  {
    id: 'gq3',
    name: '数据科学团队',
    members: ['m7', 'm8'],
    monthlyQuota: 2000,
    usedQuota: 1234.56,
  },
]

// ─── 工作区设置 ───

export const mockWorkspaceSettings: WorkspaceSettings = {
  name: 'Acme Corp',
  slug: 'acme-corp',
  timezone: 'Asia/Shanghai',
  defaultRetry: 2,
  enableFailover: true,
  enablePIIMasking: false,
  dataResidency: 'cn-north-1',
  monthlyBudget: 5000,
  budgetAlertThreshold: [50, 75, 90, 100],
}
