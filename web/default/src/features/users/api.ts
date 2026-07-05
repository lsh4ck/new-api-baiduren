import { api } from '@/lib/api'
import type {
  User,
  GetUsersParams,
  GetUsersResponse,
  SearchUsersParams,
  UserFormData,
  ManageUserAction,
  ManageUserQuotaPayload,
  ApiResponse,
} from './types'

// ============================================================================
// User Management APIs
// ============================================================================

/**
 * Get paginated users list
 */
export async function getUsers(
  params: GetUsersParams = {}
): Promise<GetUsersResponse> {
  const { p = 1, page_size = 10 } = params
  const res = await api.get(`/api/user/?p=${p}&page_size=${page_size}`)
  return res.data
}

/**
 * Search users by keyword or group
 */
export async function searchUsers(
  params: SearchUsersParams
): Promise<GetUsersResponse> {
  const { keyword = '', group = '', p = 1, page_size = 10 } = params
  const res = await api.get(
    `/api/user/search?keyword=${keyword}&group=${group}&p=${p}&page_size=${page_size}`
  )
  return res.data
}

/**
 * Get single user by ID
 */
export async function getUser(id: number): Promise<ApiResponse<User>> {
  const res = await api.get(`/api/user/${id}`)
  return res.data
}

/**
 * Create a new user
 */
export async function createUser(
  data: UserFormData
): Promise<ApiResponse<User>> {
  const res = await api.post('/api/user/', data)
  return res.data
}

/**
 * Update an existing user
 */
export async function updateUser(
  data: UserFormData & { id: number }
): Promise<ApiResponse<Partial<User>>> {
  const res = await api.put('/api/user/', data)
  return res.data
}

/**
 * Delete a single user (hard delete)
 */
export async function deleteUser(id: number): Promise<ApiResponse> {
  const res = await api.delete(`/api/user/${id}/`)
  return res.data
}

/**
 * Manage user (promote, demote, enable, disable, delete)
 */
export async function manageUser(
  id: number,
  action: ManageUserAction
): Promise<ApiResponse<Partial<User>>> {
  const res = await api.post('/api/user/manage', { id, action })
  return res.data
}

/**
 * Adjust user quota atomically (add/subtract/override)
 */
export async function adjustUserQuota(
  payload: ManageUserQuotaPayload
): Promise<ApiResponse<Partial<User>>> {
  const res = await api.post('/api/user/manage', payload)
  return res.data
}

/**
 * Reset user's Passkey registration
 */
export async function resetUserPasskey(id: number): Promise<ApiResponse> {
  const res = await api.delete(`/api/user/${id}/reset_passkey`)
  return res.data
}

/**
 * Reset user's Two-Factor Authentication setup
 */
export async function resetUserTwoFA(id: number): Promise<ApiResponse> {
  const res = await api.delete(`/api/user/${id}/2fa`)
  return res.data
}

/**
 * Get all available groups
 */
export async function getGroups(): Promise<ApiResponse<string[]>> {
  const res = await api.get('/api/group/')
  return res.data
}

// ============================================================================
// User Usage Summary
// ============================================================================

export interface UserUsageSummaryParams {
  start_timestamp?: number
  end_timestamp?: number
  top?: number
}

export interface UserUsageByModel {
  model_name: string
  request_count: number
  quota: number
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
  cache_tokens: number
}

export interface UserUsageByDay {
  day_bucket: number // unix_ts / 86400
  request_count: number
  quota: number
  total_tokens: number
}

export interface UserUsageTotals {
  request_count: number
  quota: number
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
  topup: number
}

export interface UserUsageSummaryResponse {
  user: {
    id: number
    username: string
    display_name: string
    email: string
    role: number
    status: number
    quota: number
    used_quota: number
    group: string
  }
  totals: UserUsageTotals
  by_model: UserUsageByModel[]
  by_day: UserUsageByDay[]
}

export async function getUserUsageSummary(
  id: number,
  params: UserUsageSummaryParams = {}
): Promise<ApiResponse<UserUsageSummaryResponse>> {
  const qs = new URLSearchParams()
  if (params.start_timestamp != null)
    qs.set('start_timestamp', String(params.start_timestamp))
  if (params.end_timestamp != null)
    qs.set('end_timestamp', String(params.end_timestamp))
  if (params.top != null) qs.set('top', String(params.top))
  const res = await api.get(
    `/api/user/${id}/usage-summary${qs.toString() ? '?' + qs.toString() : ''}`
  )
  return res.data
}

// ============================================================================
// Admin Topup query (with optional user filter)
// ============================================================================

export interface AdminTopupRecord {
  id: number
  user_id: number
  amount: number
  money: number
  trade_no: string
  payment_method: string
  payment_provider?: string
  create_time: number
  complete_time: number
  status: string
}

export interface AdminUserOptimizationSummary {
  user_id: string
  period: string
  total_tokens_saved: number
  total_requests: number
  cache_hits: number
  cache_hit_rate: number
  estimated_saved_usd: number
  today: { tokens_saved: number; requests: number }
  daily: Array<{ date: string; tokens_saved: number; requests: number; cache_hits: number }>
  optimization_active: boolean
  features: string[]
}

export async function getAdminUserOptimization(
  id: number
): Promise<AdminUserOptimizationSummary> {
  const res = await api.get(`/api/user/${id}/optimization-summary`)
  return res.data as AdminUserOptimizationSummary
}

export async function getAdminTopups(params: {
  user_id?: number
  keyword?: string
  p?: number
  page_size?: number
}): Promise<
  ApiResponse<{
    items: AdminTopupRecord[]
    total: number
    page: number
    page_size: number
  }>
> {
  const qs = new URLSearchParams()
  if (params.user_id) qs.set('user_id', String(params.user_id))
  if (params.keyword) qs.set('keyword', params.keyword)
  qs.set('p', String(params.p ?? 1))
  qs.set('page_size', String(params.page_size ?? 20))
  const res = await api.get('/api/user/topup?' + qs.toString())
  return res.data
}

// ============================================================================
// Admin Binding Management APIs
// ============================================================================

export interface OAuthBinding {
  provider_id: string
  provider_name: string
  user_id?: number
  external_id?: string
}

/**
 * Get user's custom OAuth bindings (admin)
 */
export async function getUserOAuthBindings(
  userId: number
): Promise<ApiResponse<OAuthBinding[]>> {
  const res = await api.get(`/api/user/${userId}/oauth/bindings`)
  return res.data
}

/**
 * Clear a user's built-in binding (admin)
 */
export async function adminClearUserBinding(
  userId: number,
  bindingType: string
): Promise<ApiResponse> {
  const res = await api.delete(`/api/user/${userId}/bindings/${bindingType}`)
  return res.data
}

/**
 * Unbind custom OAuth for a user (admin)
 */
export async function adminUnbindCustomOAuth(
  userId: number,
  providerId: string
): Promise<ApiResponse> {
  const res = await api.delete(
    `/api/user/${userId}/oauth/bindings/${providerId}`
  )
  return res.data
}
