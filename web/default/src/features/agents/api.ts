import { api } from '@/lib/api'
import type { Agent, AgentsResponse } from './types'

/**
 * 拉取智能体超市预设列表(公开只读接口 GET /api/agents)。
 */
export async function getAgents(): Promise<Agent[]> {
  const res = await api.get<AgentsResponse>('/api/agents')
  return res.data?.data?.agents ?? []
}
