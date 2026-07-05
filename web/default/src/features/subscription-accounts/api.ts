import { api } from '@/lib/api'
import type {
  SubscriptionAccountListResponse,
  SubscriptionAccountPayload,
  SubscriptionAccountUpdatePayload,
  SubscriptionGroupListResponse,
  SubscriptionGroupPayload,
  SubscriptionProxyListResponse,
  SubscriptionProxyPayload,
} from './types'

// ─── 账号 ──────────────────────────────────────────────────────────────────

export async function getSubscriptionAccounts(params?: {
  platform?: string
  status?: string
  group_id?: number
  page?: number
  size?: number
}): Promise<{ success: boolean; data?: SubscriptionAccountListResponse; message?: string }> {
  const res = await api.get('/api/admin/subscription/accounts', { params })
  return res.data
}

export async function createSubscriptionAccount(
  data: SubscriptionAccountPayload
): Promise<{ success: boolean; data?: unknown; message?: string }> {
  const res = await api.post('/api/admin/subscription/accounts', data)
  return res.data
}

export async function updateSubscriptionAccount(
  id: number,
  data: SubscriptionAccountUpdatePayload
): Promise<{ success: boolean; data?: unknown; message?: string }> {
  const res = await api.put(`/api/admin/subscription/accounts/${id}`, data)
  return res.data
}

export async function deleteSubscriptionAccount(
  id: number
): Promise<{ success: boolean; data?: unknown; message?: string }> {
  const res = await api.delete(`/api/admin/subscription/accounts/${id}`)
  return res.data
}

export async function refreshSubscriptionAccount(
  id: number,
  proxyUrl?: string
): Promise<{ success: boolean; data?: unknown; message?: string }> {
  const res = await api.post(`/api/admin/subscription/accounts/${id}/refresh`, null, {
    params: proxyUrl ? { proxy_url: proxyUrl } : undefined,
  })
  return res.data
}

export async function testSubscriptionAccount(
  id: number
): Promise<{ success: boolean; data?: { ok: boolean; message: string }; message?: string }> {
  const res = await api.post(`/api/admin/subscription/accounts/${id}/test`)
  return res.data
}

export async function resetAccountRateLimit(
  id: number
): Promise<{ success: boolean; data?: unknown; message?: string }> {
  const res = await api.post(`/api/admin/subscription/accounts/${id}/reset-rate-limit`)
  return res.data
}

// ─── 订阅分组 ──────────────────────────────────────────────────────────────

export async function getSubscriptionGroups(params?: {
  platform?: string
  status?: string
  page?: number
  size?: number
}): Promise<{ success: boolean; data?: SubscriptionGroupListResponse; message?: string }> {
  const res = await api.get('/api/admin/subscription/groups', { params })
  return res.data
}

export async function createSubscriptionGroup(
  data: SubscriptionGroupPayload
): Promise<{ success: boolean; data?: unknown; message?: string }> {
  const res = await api.post('/api/admin/subscription/groups', data)
  return res.data
}

export async function updateSubscriptionGroup(
  id: number,
  data: SubscriptionGroupPayload
): Promise<{ success: boolean; data?: unknown; message?: string }> {
  const res = await api.put(`/api/admin/subscription/groups/${id}`, data)
  return res.data
}

export async function deleteSubscriptionGroup(
  id: number
): Promise<{ success: boolean; data?: unknown; message?: string }> {
  const res = await api.delete(`/api/admin/subscription/groups/${id}`)
  return res.data
}

export async function getGroupAccounts(
  groupId: number
): Promise<{ success: boolean; data?: { account_ids: number[]; count: number }; message?: string }> {
  const res = await api.get(`/api/admin/subscription/groups/${groupId}/accounts`)
  return res.data
}

export async function addGroupAccounts(
  groupId: number,
  accountIds: number[]
): Promise<{ success: boolean; data?: unknown; message?: string }> {
  const res = await api.post(`/api/admin/subscription/groups/${groupId}/accounts`, {
    account_ids: accountIds,
  })
  return res.data
}

export async function removeGroupAccounts(
  groupId: number,
  accountIds: number[]
): Promise<{ success: boolean; data?: unknown; message?: string }> {
  const res = await api.delete(`/api/admin/subscription/groups/${groupId}/accounts`, {
    data: { account_ids: accountIds },
  })
  return res.data
}

// ─── 代理池 ────────────────────────────────────────────────────────────────

export async function getSubscriptionProxies(params?: {
  status?: string
  page?: number
  size?: number
}): Promise<{ success: boolean; data?: SubscriptionProxyListResponse; message?: string }> {
  const res = await api.get('/api/admin/subscription/proxies', { params })
  return res.data
}

export async function createSubscriptionProxy(
  data: SubscriptionProxyPayload
): Promise<{ success: boolean; data?: unknown; message?: string }> {
  const res = await api.post('/api/admin/subscription/proxies', data)
  return res.data
}

export async function updateSubscriptionProxy(
  id: number,
  data: SubscriptionProxyPayload
): Promise<{ success: boolean; data?: unknown; message?: string }> {
  const res = await api.put(`/api/admin/subscription/proxies/${id}`, data)
  return res.data
}

export async function deleteSubscriptionProxy(
  id: number
): Promise<{ success: boolean; data?: unknown; message?: string }> {
  const res = await api.delete(`/api/admin/subscription/proxies/${id}`)
  return res.data
}

export async function testSubscriptionProxy(
  id: number
): Promise<{ success: boolean; data?: { ok: boolean; message: string }; message?: string }> {
  const res = await api.post(`/api/admin/subscription/proxies/${id}/test`)
  return res.data
}
