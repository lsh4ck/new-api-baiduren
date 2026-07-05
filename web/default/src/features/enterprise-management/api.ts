import { api } from '@/lib/api'

export interface Enterprise {
  id: number
  name: string
  description?: string
  status: string
  owner_id: number
  admin_id: number
  created_at: string
  updated_at: string
}

export interface EnterpriseMember {
  id: number
  username: string
  display_name: string
  email: string
  role: number
  status: number
  enterprise_admin_of: number
  used_quota: number
  quota: number
  request_count: number
  last_login_at: number
  is_sales: boolean
}

interface ApiResponse<T = unknown> {
  success: boolean
  message?: string
  data?: T
}

interface PageResp<T> {
  items: T[]
  total: number
  page: number
  page_size: number
}

export async function createEnterprise(payload: {
  name: string
  description?: string
}): Promise<ApiResponse<Enterprise>> {
  const res = await api.post('/api/enterprise/admin/enterprises', payload)
  return res.data
}

export async function listEnterprises(params: {
  p?: number
  page_size?: number
  keyword?: string
}): Promise<ApiResponse<PageResp<Enterprise>>> {
  const qs = new URLSearchParams()
  qs.set('p', String(params.p ?? 1))
  qs.set('page_size', String(params.page_size ?? 20))
  if (params.keyword) qs.set('keyword', params.keyword)
  const res = await api.get('/api/enterprise/admin/enterprises?' + qs.toString())
  return res.data
}

export async function getEnterprise(
  id: number
): Promise<ApiResponse<Enterprise>> {
  const res = await api.get(`/api/enterprise/admin/enterprises/${id}`)
  return res.data
}

export async function updateEnterprise(
  id: number,
  payload: { name?: string; description?: string; status?: string }
): Promise<ApiResponse<Enterprise>> {
  const res = await api.put(
    `/api/enterprise/admin/enterprises/${id}`,
    payload
  )
  return res.data
}

export async function deleteEnterprise(id: number): Promise<ApiResponse> {
  const res = await api.delete(`/api/enterprise/admin/enterprises/${id}`)
  return res.data
}

export async function listEnterpriseMembers(
  id: number,
  params: { p?: number; page_size?: number; keyword?: string } = {}
): Promise<ApiResponse<PageResp<EnterpriseMember>>> {
  const qs = new URLSearchParams()
  qs.set('p', String(params.p ?? 1))
  qs.set('page_size', String(params.page_size ?? 20))
  if (params.keyword) qs.set('keyword', params.keyword)
  const res = await api.get(
    `/api/enterprise/admin/enterprises/${id}/members?` + qs.toString()
  )
  return res.data
}

export async function addEnterpriseMember(
  id: number,
  userId: number
): Promise<ApiResponse> {
  const res = await api.post(
    `/api/enterprise/admin/enterprises/${id}/members`,
    { user_id: userId }
  )
  return res.data
}

export async function removeEnterpriseMember(
  enterpriseId: number,
  userId: number
): Promise<ApiResponse> {
  const res = await api.delete(
    `/api/enterprise/admin/enterprises/${enterpriseId}/members/${userId}`
  )
  return res.data
}

export interface BulkAddResult {
  added: number[]
  skipped: Array<{
    identifier: string
    user_id?: number
    reason: string
  }>
}

export async function bulkAddEnterpriseMembers(
  enterpriseId: number,
  identifiers: string[]
): Promise<ApiResponse<BulkAddResult>> {
  const res = await api.post(
    `/api/enterprise/admin/enterprises/${enterpriseId}/members/bulk`,
    { identifiers }
  )
  return res.data
}

export interface UserCandidate {
  id: number
  username: string
  display_name: string
  email: string
  already_in: boolean
  other_enterprise_name?: string
}

export async function searchEnterpriseUserCandidates(
  enterpriseId: number,
  keyword: string
): Promise<ApiResponse<UserCandidate[]>> {
  const qs = new URLSearchParams({ keyword })
  const res = await api.get(
    `/api/enterprise/admin/enterprises/${enterpriseId}/search-candidates?` +
      qs.toString()
  )
  return res.data
}

export async function setEnterpriseAdmin(
  id: number,
  userId: number
): Promise<ApiResponse> {
  const res = await api.put(`/api/enterprise/admin/enterprises/${id}/admin`, {
    user_id: userId,
  })
  return res.data
}

// 兼容旧调用方
export { setUserSalesFlag as setUserSalesFlagFromEnterprise }
export async function setUserSalesFlag(
  userId: number,
  isSales: boolean
): Promise<ApiResponse> {
  const res = await api.put('/api/user/admin/sales', {
    user_id: userId,
    is_sales: isSales,
  })
  return res.data
}

// === WorkGroups ===
export interface WorkGroup {
  id: number
  enterprise_id: number
  name: string
  description?: string
  created_at: string
}

export async function listWorkGroups(
  enterpriseId: number
): Promise<ApiResponse<WorkGroup[]>> {
  const res = await api.get(
    `/api/enterprise/admin/enterprises/${enterpriseId}/workgroups`
  )
  return res.data
}

export async function createWorkGroup(
  enterpriseId: number,
  payload: { name: string; description?: string }
): Promise<ApiResponse<WorkGroup>> {
  const res = await api.post(
    `/api/enterprise/admin/enterprises/${enterpriseId}/workgroups`,
    payload
  )
  return res.data
}

export async function deleteWorkGroup(
  enterpriseId: number,
  wgId: number
): Promise<ApiResponse> {
  const res = await api.delete(
    `/api/enterprise/admin/enterprises/${enterpriseId}/workgroups/${wgId}`
  )
  return res.data
}

export async function listWorkGroupMembers(
  enterpriseId: number,
  wgId: number
): Promise<ApiResponse<EnterpriseMember[]>> {
  const res = await api.get(
    `/api/enterprise/admin/enterprises/${enterpriseId}/workgroups/${wgId}/members`
  )
  return res.data
}

export async function addWorkGroupMember(
  enterpriseId: number,
  wgId: number,
  userId: number
): Promise<ApiResponse> {
  const res = await api.post(
    `/api/enterprise/admin/enterprises/${enterpriseId}/workgroups/${wgId}/members`,
    { user_id: userId }
  )
  return res.data
}

export async function removeWorkGroupMember(
  enterpriseId: number,
  wgId: number,
  userId: number
): Promise<ApiResponse> {
  const res = await api.delete(
    `/api/enterprise/admin/enterprises/${enterpriseId}/workgroups/${wgId}/members/${userId}`
  )
  return res.data
}

// === Limits ===
export interface EnterpriseLimit {
  id: number
  enterprise_id: number
  scope_type: 'enterprise' | 'workgroup' | 'member'
  scope_id: number
  period: 'daily' | 'monthly' | 'quarterly' | 'total'
  max_quota: number
  enforce_hard: boolean
  period_start_unix: number
  used_quota: number
  created_at: string
}

export async function listEnterpriseLimits(
  enterpriseId: number
): Promise<ApiResponse<EnterpriseLimit[]>> {
  const res = await api.get(
    `/api/enterprise/admin/enterprises/${enterpriseId}/limits`
  )
  return res.data
}

export async function createEnterpriseLimit(
  enterpriseId: number,
  payload: {
    scope_type: 'enterprise' | 'workgroup' | 'member'
    scope_id: number
    period: 'daily' | 'monthly' | 'quarterly' | 'total'
    max_quota: number
    enforce_hard: boolean
  }
): Promise<ApiResponse<EnterpriseLimit>> {
  const res = await api.post(
    `/api/enterprise/admin/enterprises/${enterpriseId}/limits`,
    payload
  )
  return res.data
}

export async function updateEnterpriseLimit(
  enterpriseId: number,
  limitId: number,
  payload: { max_quota?: number; enforce_hard?: boolean }
): Promise<ApiResponse<EnterpriseLimit>> {
  const res = await api.put(
    `/api/enterprise/admin/enterprises/${enterpriseId}/limits/${limitId}`,
    payload
  )
  return res.data
}

export async function deleteEnterpriseLimit(
  enterpriseId: number,
  limitId: number
): Promise<ApiResponse> {
  const res = await api.delete(
    `/api/enterprise/admin/enterprises/${enterpriseId}/limits/${limitId}`
  )
  return res.data
}
