import { api } from '@/lib/api'

export interface SubscriptionUsageResponse {
  success: boolean
  data?: {
    quota_used: number
    quota_total: number
    quota_remain: number
    subscriptions: Array<{
      subscription: {
        id: number
        user_id: number
        plan_id: number
        amount_total: number
        amount_used: number
        start_time: number
        end_time: number
        status: string
        source: string
      }
    }>
    account_usages: Array<{
      account_id: number
      account_name: string
      platform: string
      used: number
      limit: number
    }>
  }
}

export async function getSubscriptionUsage(): Promise<SubscriptionUsageResponse> {
  const res = await api.get('/api/subscription/usage')
  return res.data
}

export async function getSubscriptionInfo() {
  const res = await api.get('/api/subscription')
  return res.data
}
