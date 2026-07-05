import { useQuery } from '@tanstack/react-query'
import { getUserLogs } from '@/features/usage-logs/api'

export interface ConsoleUsageLog {
  id: string
  timestamp: string
  model: string
  promptTokens: number
  completionTokens: number
  totalTokens: number
  cost: number
  status: 'success' | 'error' | 'timeout'
  channel?: string
  latency?: number
}

export function useConsoleUsageLogs() {
  return useQuery({
    queryKey: ['console', 'usage-logs'],
    queryFn: async () => {
      const res = await getUserLogs({ p: 1, page_size: 100 })
      const items = res.data?.data ?? []
      return items.map((log): ConsoleUsageLog => ({
        id: String(log.id),
        timestamp: new Date((log.created_at || 0) * 1000).toISOString(),
        model: log.model_name || 'unknown',
        promptTokens: log.prompt_tokens || 0,
        completionTokens: log.completion_tokens || 0,
        totalTokens: (log.prompt_tokens || 0) + (log.completion_tokens || 0),
        cost: (log.quota || 0) / 500000,
        status: log.type === 2 ? 'error' : log.type === 3 ? 'timeout' : 'success',
        channel: log.channel_name || undefined,
        latency: log.use_time || undefined,
      }))
    },
    staleTime: 60 * 1000,
  })
}
