import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  HeartPulse,
  Pause,
  Search,
  TrendingDown,
  Zap,
} from 'lucide-react'
import { api } from '@/lib/api'
import { SectionPageLayout } from '@/components/layout'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

type HealthLevel = 'healthy' | 'warning' | 'critical' | 'disabled' | 'silent'

interface HealthRow {
  channel_id: number
  name: string
  type: number
  group: string
  status: number
  priority: number
  successes: number
  errors: number
  total: number
  error_rate: number
  last_success_at: number
  last_error_at: number
  health_level: HealthLevel
}

interface HealthResp {
  rows: HealthRow[]
  window_secs: number
  summary: {
    total_channels: number
    healthy: number
    warning: number
    critical: number
    disabled: number
    silent: number
    total_successes: number
    total_errors: number
    global_error_rate: number
  }
}

const LEVEL_STYLES: Record<
  HealthLevel,
  {
    bg: string
    text: string
    ring: string
    label: string
    icon: React.ComponentType<{ className?: string }>
  }
> = {
  healthy: {
    bg: 'bg-emerald-500/12',
    text: 'text-emerald-700 dark:text-emerald-300',
    ring: 'ring-emerald-500/30',
    label: '健康',
    icon: CheckCircle2,
  },
  warning: {
    bg: 'bg-amber-500/15',
    text: 'text-amber-700 dark:text-amber-300',
    ring: 'ring-amber-500/30',
    label: '注意',
    icon: TrendingDown,
  },
  critical: {
    bg: 'bg-red-500/15',
    text: 'text-red-700 dark:text-red-300',
    ring: 'ring-red-500/40',
    label: '严重',
    icon: AlertTriangle,
  },
  disabled: {
    bg: 'bg-zinc-500/15',
    text: 'text-zinc-600 dark:text-zinc-400',
    ring: 'ring-zinc-500/30',
    label: '禁用',
    icon: Pause,
  },
  silent: {
    bg: 'bg-sky-500/15',
    text: 'text-sky-700 dark:text-sky-300',
    ring: 'ring-sky-500/30',
    label: '静默',
    icon: Activity,
  },
}

function fmtTime(ts: number): string {
  if (!ts) return '—'
  const now = Date.now() / 1000
  const diff = now - ts
  if (diff < 60) return `${Math.round(diff)}s 前`
  if (diff < 3600) return `${Math.round(diff / 60)}m 前`
  if (diff < 86400) return `${(diff / 3600).toFixed(1)}h 前`
  return `${(diff / 86400).toFixed(1)}d 前`
}

function fmtPct(rate: number): string {
  return (rate * 100).toFixed(1) + '%'
}

const FILTER_ORDER: Array<{
  key: 'all' | HealthLevel
  label: string
}> = [
  { key: 'all', label: '全部' },
  { key: 'critical', label: '严重' },
  { key: 'warning', label: '注意' },
  { key: 'silent', label: '静默' },
  { key: 'disabled', label: '禁用' },
  { key: 'healthy', label: '健康' },
]

export function ChannelHealthPage() {
  const [keyword, setKeyword] = useState('')
  const [filter, setFilter] = useState<'all' | HealthLevel>('all')

  const { data, isLoading, refetch, isFetching } = useQuery<HealthResp>({
    queryKey: ['channel-health'],
    queryFn: async () => {
      const res = await api.get('/api/channel/health')
      return res.data?.data
    },
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  })

  const summary = data?.summary
  const allRows = data?.rows ?? []

  const filteredRows = useMemo(() => {
    return allRows.filter((r) => {
      if (filter !== 'all' && r.health_level !== filter) return false
      if (keyword.trim()) {
        const kw = keyword.toLowerCase()
        if (
          !r.name.toLowerCase().includes(kw) &&
          !r.group.toLowerCase().includes(kw) &&
          !String(r.channel_id).includes(kw)
        ) {
          return false
        }
      }
      return true
    })
  }, [allRows, filter, keyword])

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>渠道健康度</SectionPageLayout.Title>
      <SectionPageLayout.Description>
        近 24 小时所有渠道的成功/失败聚合 · 30 秒自动刷新 · 同时由后台 cron 每小时巡检，错误率
        ≥ 50% 触发邮件告警
      </SectionPageLayout.Description>

      <SectionPageLayout.Content>
        {/* KPI 卡片 */}
        <div className='grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6'>
          <KpiCard
            label='渠道总数'
            value={summary?.total_channels}
            icon={HeartPulse}
            tone='text-foreground/70'
          />
          <KpiCard
            label='健康'
            value={summary?.healthy}
            icon={CheckCircle2}
            tone='text-emerald-600 dark:text-emerald-400'
          />
          <KpiCard
            label='注意'
            value={summary?.warning}
            icon={TrendingDown}
            tone='text-amber-600 dark:text-amber-400'
          />
          <KpiCard
            label='严重'
            value={summary?.critical}
            icon={AlertTriangle}
            tone='text-red-600 dark:text-red-400'
          />
          <KpiCard
            label='静默'
            value={summary?.silent}
            icon={Activity}
            tone='text-sky-600 dark:text-sky-400'
          />
          <KpiCard
            label='禁用'
            value={summary?.disabled}
            icon={Pause}
            tone='text-zinc-500 dark:text-zinc-400'
          />
        </div>

        {/* 全局错误率横条 */}
        {summary && summary.total_successes + summary.total_errors > 0 && (
          <div className='mt-4 rounded-xl border border-border/50 bg-card/40 p-4 backdrop-blur-sm'>
            <div className='flex items-center justify-between'>
              <div className='text-sm font-medium'>
                全局错误率（近 24h）
                <span
                  className={cn(
                    'ml-3 text-lg font-bold tabular-nums',
                    summary.global_error_rate >= 0.2
                      ? 'text-red-600 dark:text-red-400'
                      : summary.global_error_rate >= 0.05
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-emerald-600 dark:text-emerald-400'
                  )}
                >
                  {fmtPct(summary.global_error_rate)}
                </span>
              </div>
              <div className='text-xs text-foreground/55 tabular-nums'>
                <span className='text-emerald-600 dark:text-emerald-400'>
                  {summary.total_successes.toLocaleString()}
                </span>{' '}
                成功 / <span className='text-red-600 dark:text-red-400'>
                  {summary.total_errors.toLocaleString()}
                </span>{' '}
                失败
              </div>
            </div>
            <div className='mt-2 h-2 w-full overflow-hidden rounded-full bg-foreground/10'>
              <div
                className='h-full bg-gradient-to-r from-emerald-500 to-red-500 transition-all'
                style={{
                  width: `${Math.min(100, summary.global_error_rate * 100)}%`,
                  background:
                    summary.global_error_rate >= 0.2
                      ? '#dc2626'
                      : summary.global_error_rate >= 0.05
                        ? '#f59e0b'
                        : '#10b981',
                }}
              />
            </div>
          </div>
        )}

        {/* 过滤器 */}
        <div className='mt-5 flex flex-wrap items-center gap-2'>
          <div className='relative max-w-xs flex-1'>
            <Search className='absolute left-3 top-1/2 size-4 -translate-y-1/2 text-foreground/40' />
            <Input
              placeholder='搜索渠道名 / 分组 / ID'
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              className='pl-9'
            />
          </div>
          <div className='flex flex-wrap gap-1.5'>
            {FILTER_ORDER.map((f) => {
              const count =
                f.key === 'all'
                  ? allRows.length
                  : allRows.filter((r) => r.health_level === f.key).length
              return (
                <button
                  key={f.key}
                  type='button'
                  onClick={() => setFilter(f.key)}
                  className={cn(
                    'rounded-full px-3 py-1 text-xs font-medium ring-1 transition-all',
                    filter === f.key
                      ? 'bg-foreground text-background ring-foreground/40'
                      : 'bg-card/60 ring-border/60 hover:bg-card hover:ring-border'
                  )}
                >
                  {f.label}{' '}
                  <span className='ml-1 tabular-nums opacity-65'>
                    {count}
                  </span>
                </button>
              )
            })}
          </div>
          <button
            type='button'
            onClick={() => refetch()}
            disabled={isFetching}
            className='ml-auto rounded-lg bg-card/60 px-3 py-1.5 text-xs font-medium ring-1 ring-border/60 hover:bg-card disabled:opacity-50'
          >
            {isFetching ? (
              <>
                <Zap className='mr-1 inline size-3 animate-pulse' />
                刷新中…
              </>
            ) : (
              '手动刷新'
            )}
          </button>
        </div>

        {/* 表格 */}
        <div className='mt-4 overflow-hidden rounded-xl border border-border/50 bg-card/40 backdrop-blur-sm'>
          <div className='overflow-x-auto'>
            <table className='w-full text-sm'>
              <thead className='bg-foreground/[0.03] text-xs font-medium uppercase tracking-wider text-foreground/55'>
                <tr>
                  <th className='px-4 py-3 text-left'>状态</th>
                  <th className='px-4 py-3 text-left'>渠道</th>
                  <th className='px-4 py-3 text-left'>分组</th>
                  <th className='px-3 py-3 text-right'>优先级</th>
                  <th className='px-3 py-3 text-right'>成功</th>
                  <th className='px-3 py-3 text-right'>失败</th>
                  <th className='px-3 py-3 text-right'>错误率</th>
                  <th className='px-3 py-3 text-left'>上次成功</th>
                  <th className='px-3 py-3 text-left'>上次失败</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr>
                    <td
                      colSpan={9}
                      className='px-4 py-10 text-center text-foreground/55'
                    >
                      加载中…
                    </td>
                  </tr>
                )}
                {!isLoading && filteredRows.length === 0 && (
                  <tr>
                    <td
                      colSpan={9}
                      className='px-4 py-10 text-center text-foreground/55'
                    >
                      没有匹配的渠道
                    </td>
                  </tr>
                )}
                {filteredRows.map((r) => {
                  const lv = LEVEL_STYLES[r.health_level]
                  const Icon = lv.icon
                  return (
                    <tr
                      key={r.channel_id}
                      className='border-t border-border/30 transition-colors hover:bg-foreground/[0.02]'
                    >
                      <td className='px-4 py-3'>
                        <span
                          className={cn(
                            'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1',
                            lv.bg,
                            lv.text,
                            lv.ring
                          )}
                        >
                          <Icon className='size-3' />
                          {lv.label}
                        </span>
                      </td>
                      <td className='px-4 py-3'>
                        <div className='flex flex-col'>
                          <span className='font-medium leading-tight'>
                            {r.name}
                          </span>
                          <span className='font-mono text-[11px] text-foreground/45'>
                            #{r.channel_id} · type {r.type}
                          </span>
                        </div>
                      </td>
                      <td className='px-4 py-3'>
                        <span className='line-clamp-1 max-w-[220px] font-mono text-xs text-foreground/65'>
                          {r.group || '—'}
                        </span>
                      </td>
                      <td className='px-3 py-3 text-right tabular-nums text-foreground/65'>
                        {r.priority}
                      </td>
                      <td className='px-3 py-3 text-right tabular-nums font-medium text-emerald-600 dark:text-emerald-400'>
                        {r.successes.toLocaleString()}
                      </td>
                      <td
                        className={cn(
                          'px-3 py-3 text-right tabular-nums font-medium',
                          r.errors > 0
                            ? 'text-red-600 dark:text-red-400'
                            : 'text-foreground/35'
                        )}
                      >
                        {r.errors.toLocaleString()}
                      </td>
                      <td
                        className={cn(
                          'px-3 py-3 text-right tabular-nums font-bold',
                          r.error_rate >= 0.5
                            ? 'text-red-600 dark:text-red-400'
                            : r.error_rate >= 0.2
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-foreground/55'
                        )}
                      >
                        {r.total > 0 ? fmtPct(r.error_rate) : '—'}
                      </td>
                      <td className='px-3 py-3 text-xs text-foreground/65'>
                        {fmtTime(r.last_success_at)}
                      </td>
                      <td
                        className={cn(
                          'px-3 py-3 text-xs',
                          r.last_error_at && r.last_error_at > r.last_success_at
                            ? 'text-red-600 dark:text-red-400'
                            : 'text-foreground/55'
                        )}
                      >
                        {fmtTime(r.last_error_at)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* 图例说明 */}
        <div className='mt-4 rounded-lg bg-foreground/[0.025] p-3 text-xs leading-relaxed text-foreground/60'>
          <div className='font-medium text-foreground/80'>健康度分级规则：</div>
          <ul className='mt-1.5 space-y-0.5'>
            <li>
              <b className='text-emerald-600 dark:text-emerald-400'>健康</b>
              ：错误率 &lt; 20% 或样本不足 10 次
            </li>
            <li>
              <b className='text-amber-600 dark:text-amber-400'>注意</b>
              ：错误率 20% – 50% 且样本 ≥ 10
            </li>
            <li>
              <b className='text-red-600 dark:text-red-400'>严重</b>
              ：错误率 ≥ 50% 且样本 ≥ 10 →{' '}
              <span className='font-medium'>每小时邮件告警（6h dedupe）</span>
            </li>
            <li>
              <b className='text-sky-600 dark:text-sky-400'>静默</b>
              ：渠道 enabled 但近 24h 无任何流量
            </li>
            <li>
              <b className='text-zinc-500 dark:text-zinc-400'>禁用</b>
              ：手动或被系统自动禁用（status=2 / 3）
            </li>
          </ul>
        </div>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}

function KpiCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string
  value: number | undefined
  icon: React.ComponentType<{ className?: string }>
  tone: string
}) {
  return (
    <div className='rounded-xl border border-border/50 bg-card/40 p-3 backdrop-blur-sm'>
      <div className='flex items-center gap-2 text-xs text-foreground/55'>
        <Icon className={cn('size-3.5', tone)} />
        {label}
      </div>
      <div className={cn('mt-1 text-2xl font-bold tabular-nums', tone)}>
        {value ?? '—'}
      </div>
    </div>
  )
}
