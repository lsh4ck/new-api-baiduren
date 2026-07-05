export type Agent = {
  id: number
  username: string
  email: string
  display_name: string
  agent_level: number
  commission_rate: number
  aff_count: number
  customer_count: number
  total_topup_money: number
  available_balance: number
  status: number
  created_at: number
  last_login_at: number
}

export type AgentCustomer = {
  id: number
  username: string
  display_name: string
  used_quota: number
  created_at: number
  last_login_at: number
  total_topup_money: number
  email?: string
}

export type AgentStats = {
  agent_id: number
  agent_level: number
  commission_rate: number
  customer_count: number
  total_topup_money: number
  total_earned: number
  total_withdrawn: number
  available_balance: number
}

export type Withdrawal = {
  id: number
  agent_id: number
  agent_name: string
  agent_email: string
  amount: number
  status: 'pending' | 'approved' | 'rejected'
  remark: string
  admin_remark: string
  created_at: number
  processed_at: number
}

export type UserSearchResult = {
  id: number
  username: string
  email: string
  display_name: string
  agent_level: number
  commission_rate: number
}

export type ApiResponse<T = unknown> = {
  success: boolean
  message?: string
  data?: T
  total?: number
}

export type CommissionStatus =
  | 'pending'
  | 'approved'
  | 'paid'
  | 'clawback'
  | 'voided'

export type CommissionSourceType =
  | 'topup'
  | 'consume'
  | 'manual'
  | 'clawback_entry'

export type CommissionLedger = {
  id: number
  agent_id: number
  customer_id: number
  level: number
  source_type: CommissionSourceType
  source_id: number
  base_amount: number
  rate: number
  amount: number
  status: CommissionStatus
  lock_until: number
  approved_at: number
  paid_at: number
  created_at: number
  remark: string
}

export type FraudSuspect = {
  id: number
  username: string
  email: string
  inviter_id: number
  register_ip: string
  fraud_flag: number
}

export type CommissionAuditLog = {
  actor_name: string
  action: string
  target_agent_id: number
  ledger_id: number
  amount_delta: number
  detail: string
  created_at: number
}
