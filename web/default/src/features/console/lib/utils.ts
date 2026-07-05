// ============================================================================
// 工具函数
// ============================================================================

import dayjs from 'dayjs'

// 格式化 Token 数量 (显示为 K/M)
export function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(1)}M`
  }
  if (tokens >= 1_000) {
    return `${(tokens / 1_000).toFixed(1)}K`
  }
  return tokens.toLocaleString()
}

// 格式化成本
export function formatCost(cost: number): string {
  return `$${cost.toFixed(2)}`
}

// 格式化日期
export function formatDate(dateStr: string): string {
  return dayjs(dateStr).format('YYYY-MM-DD HH:mm')
}

// 格式化相对时间
export function formatRelativeTime(dateStr: string): string {
  return dayjs(dateStr).fromNow()
}

// 获取 Key 的掩码版本
export function maskKey(key: string): string {
  if (key.length <= 12) return key
  return `${key.slice(0, 6)}...${key.slice(-4)}`
}

// 获取订阅计划显示名称
export function getPlanDisplayName(plan: string): string {
  switch (plan) {
    case 'free':
      return '免费版'
    case 'monthly_99':
      return '月度 99'
    case 'monthly_299':
      return '月度 299'
    default:
      return plan
  }
}

// 获取订阅计划颜色
export function getPlanColor(plan: string): string {
  switch (plan) {
    case 'free':
      return 'text-muted-foreground'
    case 'monthly_99':
      return 'text-blue-500'
    case 'monthly_299':
      return 'text-violet-500'
    default:
      return 'text-foreground'
  }
}

// 获取角色显示名称
export function getRoleDisplayName(role: string): string {
  switch (role) {
    case 'admin':
      return '管理员'
    case 'member':
      return '成员'
    case 'readonly':
      return '只读'
    case 'billing':
      return '财务'
    default:
      return role
  }
}

// 获取事件类型显示名称
export function getEventTypeDisplayName(eventType: string): string {
  const map: Record<string, string> = {
    'api_key.created': '创建 API Key',
    'api_key.deleted': '删除 API Key',
    'api_key.status_changed': '更改 Key 状态',
    'member.invited': '邀请成员',
    'member.role_changed': '更改成员角色',
    'member.removed': '移除成员',
    'workspace.settings_updated': '更新工作区设置',
    'workspace.budget_exceeded': '预算超限',
    'billing.payment_received': '收到付款',
    'auth.login': '登录',
    'auth.login_failed': '登录失败',
  }
  return map[eventType] || eventType
}
