import { useQuery } from '@tanstack/react-query'
import { Sparkles, Layers, Zap, Wrench, ShieldCheck } from 'lucide-react'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'

interface UserOptimizationSummary {
  user_id: string
  period: string
  total_tokens_saved: number
  total_requests: number
  cache_hits: number
  cache_hit_rate: number
  estimated_saved_usd: number
  today: {
    tokens_saved: number
    requests: number
  }
  daily: Array<{
    date: string
    tokens_saved: number
    requests: number
    cache_hits: number
  }>
  optimization_active: boolean
  features: string[]
}

const FEATURE_META: Record<
  string,
  { label: string; icon: typeof Sparkles; desc: string }
> = {
  response_cache: {
    label: '响应缓存',
    icon: Layers,
    desc: '相同请求直接命中本地缓存，零延迟、零费用',
  },
  context_compression: {
    label: '上下文压缩',
    icon: Sparkles,
    desc: '长对话历史智能摘要，保留关键信息节省 token',
  },
  provider_cache_optimization: {
    label: '上游缓存优化',
    icon: Zap,
    desc: '自动注入 cache_control 断点，最大化 Claude/OpenAI 缓存命中率',
  },
  tool_output_artifact: {
    label: '工具响应截断',
    icon: Wrench,
    desc: '工具响应超过 25K token 自动截断，按 Anthropic 工程团队推荐',
  },
}

function formatTokens(n: number): string {
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(2) + 'B'
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M'
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K'
  return n.toLocaleString()
}

export function SmartRelaySavingsCard() {
  const { data, isLoading } = useQuery({
    queryKey: ['user-optimization-summary'],
    queryFn: async () => {
      const res = await api.get('/api/user/self/optimization-summary')
      return res.data as UserOptimizationSummary
    },
    staleTime: 60 * 1000,
  })

  const features = (data?.features ?? Object.keys(FEATURE_META)).slice(0, 4)
  const totalSaved = data?.total_tokens_saved ?? 0
  const cacheHitRate = data?.cache_hit_rate ?? 0
  const todaySaved = data?.today?.tokens_saved ?? 0
  const usd = data?.estimated_saved_usd ?? 0

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-xl border',
        'bg-gradient-to-br from-indigo-500/8 via-fuchsia-500/6 to-orange-400/6',
        'dark:from-indigo-400/10 dark:via-fuchsia-400/8 dark:to-orange-300/8',
        'p-4 sm:p-5'
      )}
    >
      {/* 背景装饰 */}
      <div
        className='pointer-events-none absolute -top-12 -right-12 size-48 rounded-full bg-indigo-400/20 blur-3xl'
        aria-hidden
      />
      <div
        className='pointer-events-none absolute -bottom-16 -left-12 size-48 rounded-full bg-fuchsia-400/15 blur-3xl'
        aria-hidden
      />

      <div className='relative flex flex-col gap-4'>
        {/* 顶部：标题 + 4 个数字 */}
        <div className='flex flex-wrap items-start justify-between gap-3'>
          <div className='flex items-center gap-2'>
            <div className='flex size-9 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-white shadow-md shadow-indigo-500/30'>
              <ShieldCheck className='size-5' />
            </div>
            <div>
              <h3 className='text-sm leading-tight font-semibold sm:text-base'>
                SmartRelay 智能优化为你节省
              </h3>
              <p className='text-muted-foreground text-xs'>
                近 30 天 · 4 层优化算法持续工作
              </p>
            </div>
          </div>
        </div>

        <div className='grid grid-cols-2 gap-3 sm:grid-cols-4'>
          <Metric
            label='节省 Tokens'
            value={isLoading ? null : formatTokens(totalSaved)}
            accent='text-indigo-600 dark:text-indigo-400'
          />
          <Metric
            label='估算价值'
            value={isLoading ? null : '$' + usd.toFixed(2)}
            accent='text-emerald-600 dark:text-emerald-400'
          />
          <Metric
            label='缓存命中率'
            value={isLoading ? null : (cacheHitRate * 100).toFixed(1) + '%'}
            accent='text-fuchsia-600 dark:text-fuchsia-400'
          />
          <Metric
            label='今日节省'
            value={isLoading ? null : formatTokens(todaySaved)}
            accent='text-orange-600 dark:text-orange-400'
          />
        </div>

        {/* 底部：4 项特性图标 */}
        <div className='grid grid-cols-2 gap-2 sm:grid-cols-4'>
          {features.map((f) => {
            const meta = FEATURE_META[f]
            if (!meta) return null
            const Icon = meta.icon
            return (
              <div
                key={f}
                className='bg-background/60 backdrop-blur-sm flex items-start gap-2 rounded-lg border p-2.5'
                title={meta.desc}
              >
                <Icon className='text-foreground/70 mt-0.5 size-4 shrink-0' />
                <div className='min-w-0'>
                  <div className='text-xs font-medium leading-tight'>
                    {meta.label}
                  </div>
                  <div className='text-muted-foreground line-clamp-2 mt-0.5 text-[10px] leading-tight'>
                    {meta.desc}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function Metric({
  label,
  value,
  accent,
}: {
  label: string
  value: string | null
  accent: string
}) {
  return (
    <div className='bg-background/70 backdrop-blur-sm rounded-lg border p-3'>
      <div className='text-muted-foreground mb-1 text-[11px] uppercase tracking-wide'>
        {label}
      </div>
      {value == null ? (
        <Skeleton className='h-5 w-16' />
      ) : (
        <div className={cn('text-base sm:text-lg font-bold', accent)}>
          {value}
        </div>
      )}
    </div>
  )
}
