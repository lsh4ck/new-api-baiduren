/**
 * 首页 SmartRelay 节省展示区
 * - 自夸 4 层优化算法
 * - 拉 /api/optimization/global-savings 显示全站累计节省
 * - 登录/未登录均可见，有"查看明细"入口
 */
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ArrowUpRight, Database, Layers, Sparkles, ShieldCheck, Zap, Wrench } from 'lucide-react'
import { api } from '@/lib/api'

interface GlobalSavings {
  total_tokens_saved: number
  total_requests: number
  cache_hits: number
  cache_hit_rate: number
  estimated_cost_saved_usd: number
}

function formatTokens(n: number): string {
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(2) + 'B'
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M'
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K'
  return n.toLocaleString()
}

const FEATURES = [
  {
    icon: Layers,
    name: '响应缓存',
    desc: '相同请求直接命中本地缓存',
    detail: '零延迟、零费用',
    color: 'from-emerald-500/15 to-teal-500/8 border-emerald-500/25',
  },
  {
    icon: Sparkles,
    name: '上下文压缩',
    desc: '长对话历史智能摘要',
    detail: '保留关键信息节省 token',
    color: 'from-fuchsia-500/15 to-pink-500/8 border-fuchsia-500/25',
  },
  {
    icon: Zap,
    name: '上游缓存优化',
    desc: '自动注入 cache_control 断点',
    detail: '最大化 Claude/OpenAI 缓存命中率',
    color: 'from-amber-500/15 to-orange-500/8 border-amber-500/25',
  },
  {
    icon: Wrench,
    name: '工具响应截断',
    desc: '工具响应 > 25K 自动截断',
    detail: '按 Anthropic 工程团队推荐',
    color: 'from-sky-500/15 to-indigo-500/8 border-sky-500/25',
  },
]

export function SmartRelayShowcase() {
  const { data } = useQuery({
    queryKey: ['global-savings'],
    queryFn: async () => {
      try {
        const res = await api.get('/api/optimization/global-savings')
        return res.data as GlobalSavings
      } catch {
        return null
      }
    },
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000,
    refetchOnWindowFocus: false,
  })

  const totalRequests = data?.total_requests ?? 0
  const totalSaved = data?.total_tokens_saved ?? 0
  const cacheHitRate = data?.cache_hit_rate ?? 0
  const usd = data?.estimated_cost_saved_usd ?? 0

  return (
    <section className='relative w-full px-4 py-20'>
      <div className='mx-auto max-w-7xl'>
        {/* 标题 */}
        <div className='mb-10 text-center'>
          <div className='glass-btn glass-shimmer mb-4 inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-medium'>
            <ShieldCheck className='size-3.5 text-emerald-500' />
            SmartRelay 智能优化 · 业界领先
          </div>
          <h2 className='text-[clamp(2rem,5vw,3.5rem)] font-bold leading-tight tracking-tight'>
            <span className='bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent'>
              4 层算法默默工作，
            </span>
            <br className='hidden sm:inline' />
            <span className='bg-gradient-to-r from-emerald-500 via-teal-500 to-sky-500 bg-clip-text text-transparent'>
              平均省你 30-50% 的 Token
            </span>
          </h2>
          <p className='mx-auto mt-4 max-w-2xl text-[15px] leading-relaxed text-foreground/55'>
            缓存命中率提升 + 会话压缩 + 上游缓存优化，多重技术叠加
            <br className='hidden sm:inline' />
            <span className='text-foreground/35'>
              抛开官方原生 caching，我们在中转层额外又给你节省 30%+
            </span>
          </p>
        </div>

        {/* 全站累计节省大数据 */}
        {data && totalSaved > 0 && (
          <div className='mb-10 rounded-2xl border bg-gradient-to-r from-emerald-500/8 via-teal-500/6 to-sky-500/8 p-6 sm:p-8 backdrop-blur-sm'>
            <div className='mb-4 flex items-center justify-between gap-3 flex-wrap'>
              <div className='flex items-center gap-2'>
                <div className='flex size-9 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-500 text-white shadow-lg shadow-emerald-500/30'>
                  <Database className='size-5' />
                </div>
                <div>
                  <h3 className='text-base font-bold'>全站累计为用户节省</h3>
                  <p className='text-xs text-foreground/55 flex items-center gap-1.5'>
                    30 天滚动统计 · 所有用户合计 · 每分钟自动刷新
                    <span className='inline-flex size-1.5 animate-pulse rounded-full bg-emerald-500' />
                  </p>
                </div>
              </div>
              <Link
                to='/console/usage-logs'
                className='inline-flex items-center gap-1 rounded-lg border bg-background/70 px-3 py-1.5 text-xs font-medium hover:bg-background transition-colors'
              >
                查看我的明细 <ArrowUpRight className='size-3' />
              </Link>
            </div>
            <div className='grid grid-cols-2 gap-4 sm:grid-cols-4'>
              <BigStat label='Tokens 节省' value={formatTokens(totalSaved)} color='text-emerald-600 dark:text-emerald-400' />
              <BigStat label='估算价值' value={'$' + usd.toFixed(2)} color='text-teal-600 dark:text-teal-400' />
              <BigStat label='缓存命中率' value={(cacheHitRate * 100).toFixed(1) + '%'} color='text-sky-600 dark:text-sky-400' />
              <BigStat label='受惠请求数' value={totalRequests.toLocaleString()} color='text-indigo-600 dark:text-indigo-400' />
            </div>
          </div>
        )}

        {/* 4 层算法卡片 */}
        <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
          {FEATURES.map((f, i) => {
            const Icon = f.icon
            return (
              <div
                key={i}
                className={`group relative overflow-hidden rounded-2xl border bg-gradient-to-br ${f.color} p-5 backdrop-blur-sm transition-all hover:scale-[1.02] hover:shadow-xl`}
              >
                <div className='absolute right-3 top-3 text-[10px] font-mono opacity-30'>
                  /0{i + 1}
                </div>
                <Icon className='mb-3 size-7 text-foreground/65' />
                <h3 className='text-[15px] font-bold leading-tight'>{f.name}</h3>
                <p className='mt-1.5 text-[13px] text-foreground/65'>{f.desc}</p>
                <p className='mt-2 text-[11px] text-foreground/45'>{f.detail}</p>
              </div>
            )
          })}
        </div>

        {/* 底部 */}
        <div className='mt-6 text-center text-xs text-foreground/40'>
          技术原理详见{' '}
          <Link to='/doc' className='underline hover:text-foreground/70'>
            文档 · SmartRelay 智能优化
          </Link>
          {' · '}
          命中率公式按 Anthropic / DeepSeek / OpenAI 通用业界标准
        </div>
      </div>
    </section>
  )
}

function BigStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className='rounded-xl bg-background/60 p-4 backdrop-blur-sm'>
      <div className='text-[10px] uppercase tracking-wider text-foreground/45 mb-1'>
        {label}
      </div>
      <div className={`text-2xl sm:text-3xl font-bold tabular-nums ${color}`}>
        {value}
      </div>
    </div>
  )
}
