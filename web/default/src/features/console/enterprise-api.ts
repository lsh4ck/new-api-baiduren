import { api } from '@/lib/api'

export interface OverviewData {
  member_count: number
  token_count: number
  monthly_quota: number
  monthly_budget: number
  monthly_used?: number
  workspace_name: string
  enterprise_id?: number
  group_stats: { group: string; member_count: number; used_quota: number }[]
}

export interface TopSpenderRow {
  user_id: number
  username: string
  email: string
  display_name: string
  used_quota: number
  req_count: number
}

export interface ModelBreakdownRow {
  model_name: string
  used_quota: number
  req_count: number
}

export interface WorkgroupStat {
  id: number
  name: string
  member_count: number
  used_quota: number
  used_usd: number
  max_quota: number
  max_usd: number
  pct: number
}

export interface WorkGroup {
  id: number
  enterprise_id: number
  name: string
  description: string
  created_at: string
}

export interface MemberLimit {
  budget_usd: number
  enforce_hard: boolean
  used_usd: number
  pct: number
}

export interface Member {
  id: number
  username: string
  email: string
  display_name: string
  role: number
  status: number
  group: string
  used_quota: number
  created_at: number
  last_login_at: number
}

export interface EnterpriseToken {
  id: number
  user_id: number
  name: string
  key: string
  status: number
  created_time: number
  accessed_time: number
  expired_time: number
  remain_quota: number
  unlimited_quota: boolean
  model_limits_enabled: boolean
  model_limits: string
  allow_ips: string
  used_quota: number
  creator_name: string
}

export interface AuditLog {
  id: number
  actor_id: number
  actor_name: string
  actor_email: string
  event_type: string
  resource: string
  resource_id: string
  result: string
  ip: string
  detail: string
  created_at: number
}

export interface WorkspaceSettings {
  workspace_name: string
  monthly_budget: number
  budget_alert_thresholds: number[]
}

type Resp<T> = { success: boolean; message?: string; data?: T; total?: number }

export const enterpriseApi = {
  getOverview: () => api.get<Resp<OverviewData>>('/api/enterprise/overview').then(r => r.data),

  getMembers: (page = 1, pageSize = 20, search = '') =>
    api.get<Resp<Member[]>>('/api/enterprise/members', { params: { page, page_size: pageSize, search } }).then(r => r.data),

  updateMember: (id: number, data: { role?: number; group?: string; status?: number }) =>
    api.put<Resp>(`/api/enterprise/members/${id}`, data).then(r => r.data),

  disableMember: (id: number) =>
    api.delete<Resp>(`/api/enterprise/members/${id}`).then(r => r.data),

  getKeys: (page = 1, pageSize = 20) =>
    api.get<Resp<EnterpriseToken[]>>('/api/enterprise/keys', { params: { page, page_size: pageSize } }).then(r => r.data),

  createKey: (data: {
    name: string
    user_id?: number
    remain_quota?: number
    unlimited_quota?: boolean
    expired_time?: number
    model_limits?: string[]
    allow_ips?: string
  }) => api.post<Resp<{ id: number; key: string; name: string }>>('/api/enterprise/keys', data).then(r => r.data),

  updateKey: (id: number, data: {
    name?: string
    remain_quota?: number
    unlimited_quota?: boolean
    expired_time?: number
    model_limits?: string[]
    allow_ips?: string
  }) => api.put<Resp>(`/api/enterprise/keys/${id}`, data).then(r => r.data),

  deleteKey: (id: number) =>
    api.delete<Resp>(`/api/enterprise/keys/${id}`).then(r => r.data),

  toggleKeyStatus: (id: number, status: 1 | 2) =>
    api.patch<Resp>(`/api/enterprise/keys/${id}/status`, { status }).then(r => r.data),

  getAuditLogs: (page = 1, pageSize = 20, eventType = '', result = '') =>
    api.get<Resp<AuditLog[]>>('/api/enterprise/audit-logs', {
      params: { page, page_size: pageSize, event_type: eventType, result },
    }).then(r => r.data),

  getSettings: () =>
    api.get<Resp<WorkspaceSettings>>('/api/enterprise/settings').then(r => r.data),

  updateSettings: (data: WorkspaceSettings) =>
    api.put<Resp>('/api/enterprise/settings', data).then(r => r.data),

  // Phase 1 insights
  getTopSpenders: (limit = 10) =>
    api.get<Resp<TopSpenderRow[]>>('/api/enterprise/insights/top-spenders', {
      params: { limit },
    }).then(r => r.data),

  getModelBreakdown: () =>
    api.get<Resp<ModelBreakdownRow[]>>('/api/enterprise/insights/model-breakdown').then(r => r.data),

  getWorkgroupStats: () =>
    api.get<Resp<WorkgroupStat[]>>('/api/enterprise/workgroups/stats').then(r => r.data),

  // Workgroup CRUD
  listWorkgroups: () =>
    api.get<Resp<WorkGroup[]>>('/api/enterprise/workgroups').then(r => r.data),
  createWorkgroup: (data: { name: string; description?: string }) =>
    api.post<Resp<WorkGroup>>('/api/enterprise/workgroups', data).then(r => r.data),
  updateWorkgroup: (id: number, data: { name?: string; description?: string }) =>
    api.put<Resp>(`/api/enterprise/workgroups/${id}`, data).then(r => r.data),
  deleteWorkgroup: (id: number) =>
    api.delete<Resp>(`/api/enterprise/workgroups/${id}`).then(r => r.data),
  listWorkgroupMembers: (id: number) =>
    api.get<Resp<Member[]>>(`/api/enterprise/workgroups/${id}/members`).then(r => r.data),
  assignWorkgroupMember: (wgId: number, userId: number) =>
    api.post<Resp>(`/api/enterprise/workgroups/${wgId}/members`, { user_id: userId }).then(r => r.data),
  removeWorkgroupMember: (wgId: number, userId: number) =>
    api.delete<Resp>(`/api/enterprise/workgroups/${wgId}/members/${userId}`).then(r => r.data),
  setWorkgroupLimit: (wgId: number, data: { budget_usd: number; enforce_hard: boolean }) =>
    api.put<Resp>(`/api/enterprise/workgroups/${wgId}/limit`, data).then(r => r.data),

  // Member limit + status
  getMemberLimits: (id: number) =>
    api.get<Resp<MemberLimit | null>>(`/api/enterprise/members/${id}/limits`).then(r => r.data),
  setMemberLimit: (id: number, data: { budget_usd: number; enforce_hard: boolean }) =>
    api.put<Resp>(`/api/enterprise/members/${id}/limit`, data).then(r => r.data),
  toggleMemberStatus: (id: number, status: 1 | 2) =>
    api.patch<Resp>(`/api/enterprise/members/${id}/status`, { status }).then(r => r.data),

  // CSV 导出 — URL 后端通过 Content-Disposition 头返回带 .csv 后缀的文件名
  exportUrls: {
    members: '/api/enterprise/export/members',
    auditLogs: '/api/enterprise/export/audit-logs',
    billing: '/api/enterprise/export/billing',
  },
}
