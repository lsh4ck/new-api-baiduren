import { api } from '@/lib/api'
import type {
  Agent,
  AgentCustomer,
  AgentStats,
  Withdrawal,
  UserSearchResult,
  ApiResponse,
  CommissionLedger,
  FraudSuspect,
  CommissionAuditLog,
} from './types'

export async function getAgents(page = 1, pageSize = 20): Promise<ApiResponse<Agent[]>> {
  const res = await api.get('/api/admin/agents/', { params: { page, page_size: pageSize } })
  return res.data
}

export async function setAgentLevel(id: number, agentLevel: number, commissionRate: number): Promise<ApiResponse> {
  const res = await api.post(`/api/admin/agents/${id}/level`, { agent_level: agentLevel, commission_rate: commissionRate })
  return res.data
}

export async function getAgentCustomers(id: number, page = 1, pageSize = 20): Promise<ApiResponse<AgentCustomer[]>> {
  const res = await api.get(`/api/admin/agents/${id}/customers`, { params: { page, page_size: pageSize } })
  return res.data
}

export async function getAgentStats(id: number): Promise<ApiResponse<AgentStats>> {
  const res = await api.get(`/api/admin/agents/${id}/stats`)
  return res.data
}

export async function searchUsersForAgent(keyword: string): Promise<ApiResponse<UserSearchResult[]>> {
  const res = await api.get('/api/admin/agents/user-search', { params: { keyword } })
  return res.data
}

export async function getWithdrawals(page = 1, pageSize = 20, status = ''): Promise<ApiResponse<Withdrawal[]>> {
  const res = await api.get('/api/admin/agent-withdrawals/', { params: { page, page_size: pageSize, status } })
  return res.data
}

export async function processWithdrawal(id: number, status: 'approved' | 'rejected', adminRemark: string): Promise<ApiResponse> {
  const res = await api.put(`/api/admin/agent-withdrawals/${id}`, { status, admin_remark: adminRemark })
  return res.data
}

// ─── 佣金账本 / 风控 / 审计 ───────────────────────────────────────────

export async function getCommissionLedger(params: {
  agent_id?: number
  status?: string
  source_type?: string
  page?: number
  page_size?: number
}): Promise<ApiResponse<CommissionLedger[]>> {
  const res = await api.get('/api/admin/commission/ledger', { params })
  return res.data
}

export async function createManualCommission(body: {
  agent_id: number
  customer_id: number
  amount: number
  remark: string
}): Promise<ApiResponse> {
  const res = await api.post('/api/admin/commission/manual', body)
  return res.data
}

export async function voidCommission(id: number): Promise<ApiResponse> {
  const res = await api.post(`/api/admin/commission/${id}/void`)
  return res.data
}

export async function clawbackCommission(body: {
  source_type: string
  source_id: number
  reason: string
}): Promise<ApiResponse> {
  const res = await api.post('/api/admin/commission/clawback', body)
  return res.data
}

export async function backfillCommission(): Promise<ApiResponse> {
  const res = await api.post('/api/admin/commission/backfill')
  return res.data
}

export async function getFraudSuspects(): Promise<ApiResponse<FraudSuspect[]>> {
  const res = await api.get('/api/admin/commission/fraud')
  return res.data
}

export async function reviewFraud(
  agentId: number,
  fraudFlag: 2 | 3,
  reason: string
): Promise<ApiResponse> {
  const res = await api.post(`/api/admin/agents/${agentId}/fraud-review`, {
    fraud_flag: fraudFlag,
    reason,
  })
  return res.data
}

export async function freezeAgent(
  agentId: number,
  frozen: boolean,
  reason: string
): Promise<ApiResponse> {
  const res = await api.post(`/api/admin/agents/${agentId}/freeze`, {
    frozen,
    reason,
  })
  return res.data
}

export async function getCommissionAudit(
  page = 1,
  pageSize = 50
): Promise<ApiResponse<CommissionAuditLog[]>> {
  const res = await api.get('/api/admin/commission/audit', {
    params: { page, page_size: pageSize },
  })
  return res.data
}
