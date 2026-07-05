import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Activity, AlertTriangle, CheckCircle2, ClipboardCheck, Clock,
  PlayCircle, Search, ShieldCheck, ShieldX, TrendingDown, XCircle, Zap,
} from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { SectionPageLayout } from '@/components/layout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

interface AuditRow {
  id: number
  channel_id: number
  channel_name: string
  model: string
  audited_at: number
  prompt_tokens: number
  completion_tokens: number
  max_output_requested: number
  max_output_actual: number
  ttfb_ms: number
  total_ms: number
  tokens_per_sec: number
  trial_count: number
  total_ms_stdev: number
  total_ms_p95: number
  purity_status: 'pure' | 'suspicious' | 'degraded' | 'dead'
  purity_score: number
  purity_reason: string
  http_status: number
  error_message: string
  response_sample: string
}

const STATUS_STYLES = {
  pure: { bg: 'bg-emerald-500/15', text: 'text-emerald-700 dark:text-emerald-300', icon: ShieldCheck, label: '纯血' },
  suspicious: { bg: 'bg-amber-500/15', text: 'text-amber-700 dark:text-amber-300', icon: AlertTriangle, label: '可疑' },
  degraded: { bg: 'bg-orange-500/15', text: 'text-orange-700 dark:text-orange-300', icon: TrendingDown, label: '缩水' },
  dead: { bg: 'bg-red-500/15', text: 'text-red-700 dark:text-red-300', icon: XCircle, label: '失联' },
} as const

function fmtTime(ts: number): string {
  if (!ts) return '-'
  return new Date(ts * 1000).toLocaleString('zh-CN', { hour12: false })
}

function fmtMs(ms: number): string {
  if (!ms) return '-'
  if (ms < 1000) return ms + 'ms'
  return (ms / 1000).toFixed(1) + 's'
}

export function ChannelAuditPage() {
  const queryClient = useQueryClient()
  const [keyword, setKeyword] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'pure' | 'suspicious' | 'degraded' | 'dead'>('all')
  const [expanded, setExpanded] = useState<number | null>(null)
  const [triggering, setTriggering] = useState(false)

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['channel-audit-latest'],
    queryFn: async () => {
      const r = await api.get('/api/admin/channel-audit/latest')
      return r.data as { success: boolean; data: AuditRow[] }
    },
    refetchInterval: 60_000,
  })

  const handleTrigger = async () => {
    setTriggering(true)
    try {
      const r = await api.post('/api/admin/channel-audit/run')
      toast.success(r.data.message)
      // 30 秒后开始 refetch
      setTimeout(() => queryClient.invalidateQueries({ queryKey: ['channel-audit-latest'] }), 30_000)
    } catch (e) {
      toast.error('触发失败: ' + (e as Error).message)
    } finally {
      setTriggering(false)
    }
  }

  const rows = (data?.data || []).filter((r) => {
    if (statusFilter !== 'all' && r.purity_status !== statusFilter) return false
    if (keyword && !(`${r.channel_name} ${r.model}`.toLowerCase().includes(keyword.toLowerCase()))) return false
    return true
  })

  // 统计
  const stats = {
    pure: data?.data?.filter((r) => r.purity_status === 'pure').length || 0,
    suspicious: data?.data?.filter((r) => r.purity_status === 'suspicious').length || 0,
    degraded: data?.data?.filter((r) => r.purity_status === 'degraded').length || 0,
    dead: data?.data?.filter((r) => r.purity_status === 'dead').length || 0,
  }

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>渠道纯血度审计</SectionPageLayout.Title>
      <SectionPageLayout.Description>
        每天 04:00 自动测试所有启用渠道：吞吐 / 延时 / 稳定性 / 模型一致性。点「立即审计」手动跑一次。
      </SectionPageLayout.Description>
      <SectionPageLayout.Content>
        <div className='space-y-5'>
          {/* 统计卡 */}
          <div className='grid gap-3 sm:grid-cols-4'>
            <StatCard color='emerald' icon={ShieldCheck} label='纯血' count={stats.pure} desc='≥75 分，无明显异常' />
            <StatCard color='amber' icon={AlertTriangle} label='可疑' count={stats.suspicious} desc='50-75 分，有小问题' />
            <StatCard color='orange' icon={TrendingDown} label='缩水' count={stats.degraded} desc='25-50 分，确认缩水' />
            <StatCard color='red' icon={ShieldX} label='失联' count={stats.dead} desc='0 分，完全不可用' />
          </div>

          {/* 操作栏 */}
          <div className='flex flex-wrap items-center gap-2'>
            <div className='relative max-w-sm flex-1'>
              <Search className='absolute left-3 top-1/2 size-4 -translate-y-1/2 text-foreground/45' />
              <Input
                placeholder='搜索 channel / model...'
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                className='pl-9'
              />
            </div>
            <div className='flex gap-1.5'>
              {(['all', 'pure', 'suspicious', 'degraded', 'dead'] as const).map((s) => (
                <Button
                  key={s}
                  size='sm'
                  variant={statusFilter === s ? 'default' : 'outline'}
                  onClick={() => setStatusFilter(s)}
                  className='text-xs'
                >
                  {s === 'all' ? '全部' : STATUS_STYLES[s].label}
                </Button>
              ))}
            </div>
            <div className='ml-auto flex gap-2'>
              <Button variant='outline' size='sm' onClick={() => refetch()} disabled={isLoading}>
                刷新数据
              </Button>
              <Button onClick={handleTrigger} disabled={triggering} className='gap-1.5'>
                <PlayCircle className='size-4' />
                {triggering ? '触发中...' : '立即审计'}
              </Button>
            </div>
          </div>

          {/* 表格 */}
          <div className='rounded-2xl border bg-background/40 overflow-hidden'>
            <div className='overflow-x-auto'>
              <table className='w-full text-sm'>
                <thead>
                  <tr className='border-b border-foreground/10 bg-foreground/5 text-[11px] uppercase tracking-wider text-foreground/55'>
                    <th className='px-3 py-2.5 text-left w-32'>状态</th>
                    <th className='px-3 py-2.5 text-left'>Channel · Model</th>
                    <th className='px-3 py-2.5 text-right'>总耗时</th>
                    <th className='px-3 py-2.5 text-right'>TTFB</th>
                    <th className='px-3 py-2.5 text-right'>吞吐</th>
                    <th className='px-3 py-2.5 text-right'>稳定性</th>
                    <th className='px-3 py-2.5 text-right'>实际/请求 max</th>
                    <th className='px-3 py-2.5 text-right'>评分</th>
                    <th className='px-3 py-2.5 text-right'>时间</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const style = STATUS_STYLES[r.purity_status] || STATUS_STYLES.dead
                    const StatusIcon = style.icon
                    const volatility = r.total_ms > 0 && r.total_ms_stdev > 0
                      ? (r.total_ms_stdev / r.total_ms) * 100 : 0
                    const isExpanded = expanded === r.id
                    return (
                      <>
                        <tr
                          key={r.id}
                          className='border-b border-foreground/5 hover:bg-foreground/3 cursor-pointer'
                          onClick={() => setExpanded(isExpanded ? null : r.id)}
                        >
                          <td className='px-3 py-2.5'>
                            <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold', style.bg, style.text)}>
                              <StatusIcon className='size-3' />
                              {style.label}
                            </span>
                          </td>
                          <td className='px-3 py-2.5'>
                            <div className='font-medium text-foreground/90'>#{r.channel_id} {r.channel_name}</div>
                            <div className='text-[11px] font-mono text-foreground/50'>{r.model}</div>
                          </td>
                          <td className='px-3 py-2.5 text-right tabular-nums'>
                            <span className={cn(r.total_ms > 30000 ? 'text-red-500 font-semibold' : r.total_ms > 10000 ? 'text-amber-500' : '')}>
                              {fmtMs(r.total_ms)}
                            </span>
                          </td>
                          <td className='px-3 py-2.5 text-right tabular-nums text-foreground/65'>{fmtMs(r.ttfb_ms)}</td>
                          <td className='px-3 py-2.5 text-right tabular-nums text-foreground/65'>
                            {r.tokens_per_sec ? r.tokens_per_sec.toFixed(0) + ' t/s' : '-'}
                          </td>
                          <td className='px-3 py-2.5 text-right tabular-nums'>
                            <span className={cn(volatility > 30 ? 'text-red-500 font-semibold' : volatility > 15 ? 'text-amber-500' : 'text-foreground/65')}>
                              {volatility > 0 ? '±' + volatility.toFixed(0) + '%' : '-'}
                            </span>
                          </td>
                          <td className='px-3 py-2.5 text-right tabular-nums text-foreground/65'>
                            {r.max_output_actual} / {r.max_output_requested}
                          </td>
                          <td className='px-3 py-2.5 text-right'>
                            <span className={cn(
                              'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-mono font-bold',
                              r.purity_score >= 75 ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                                : r.purity_score >= 50 ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                                : r.purity_score >= 25 ? 'bg-orange-500/15 text-orange-600 dark:text-orange-400'
                                : 'bg-red-500/15 text-red-600 dark:text-red-400'
                            )}>
                              {r.purity_score.toFixed(0)}
                            </span>
                          </td>
                          <td className='px-3 py-2.5 text-right text-[11px] text-foreground/45'>{fmtTime(r.audited_at)}</td>
                        </tr>
                        {isExpanded && (
                          <tr className='bg-foreground/3 border-b border-foreground/5'>
                            <td colSpan={9} className='px-4 py-3'>
                              <div className='space-y-2 text-xs'>
                                <div>
                                  <span className='font-semibold text-foreground/65'>诊断说明：</span>
                                  <span className='ml-2'>{r.purity_reason || '—'}</span>
                                </div>
                                {r.error_message && (
                                  <div className='rounded-md bg-red-500/10 px-3 py-1.5 font-mono text-red-700 dark:text-red-300'>
                                    HTTP {r.http_status}: {r.error_message}
                                  </div>
                                )}
                                {r.response_sample && (
                                  <div>
                                    <span className='font-semibold text-foreground/65'>样例响应：</span>
                                    <div className='mt-1 rounded-md bg-foreground/5 px-3 py-1.5 font-mono text-[11px] whitespace-pre-wrap break-words max-h-40 overflow-y-auto'>
                                      {r.response_sample}
                                    </div>
                                  </div>
                                )}
                                <div className='flex flex-wrap gap-4 text-[11px] text-foreground/55'>
                                  <span>Trials: {r.trial_count}</span>
                                  <span>P95: {fmtMs(r.total_ms_p95)}</span>
                                  <span>Stdev: {fmtMs(r.total_ms_stdev)}</span>
                                  <span>Prompt: {r.prompt_tokens} tok</span>
                                  <span>Completion: {r.completion_tokens} tok</span>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    )
                  })}
                  {!isLoading && rows.length === 0 && (
                    <tr>
                      <td colSpan={9} className='px-4 py-12 text-center text-foreground/45'>
                        {data?.data?.length === 0
                          ? '尚无审计记录。点上方「立即审计」开始第一次。'
                          : '没有匹配的渠道'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <p className='text-[11px] text-foreground/45 text-center'>
            纯血度评分维度：模型一致性(40) + 输出完整度(20) + 响应速度(20) + 稳定性(20)。每渠道每天自动跑 2 次取均值。
          </p>
        </div>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}

function StatCard({ color, icon: Icon, label, count, desc }: {
  color: 'emerald' | 'amber' | 'orange' | 'red'
  icon: React.ElementType
  label: string
  count: number
  desc: string
}) {
  const styles = {
    emerald: 'from-emerald-500/15 to-teal-500/5 border-emerald-500/25 text-emerald-600 dark:text-emerald-400',
    amber: 'from-amber-500/15 to-yellow-500/5 border-amber-500/25 text-amber-600 dark:text-amber-400',
    orange: 'from-orange-500/15 to-red-500/5 border-orange-500/25 text-orange-600 dark:text-orange-400',
    red: 'from-red-500/15 to-rose-500/5 border-red-500/25 text-red-600 dark:text-red-400',
  }[color]
  return (
    <div className={cn('rounded-2xl border bg-gradient-to-br p-4 backdrop-blur-sm', styles)}>
      <div className='flex items-center gap-2'>
        <Icon className='size-4' />
        <span className='text-xs font-semibold uppercase tracking-wider'>{label}</span>
      </div>
      <div className='mt-2 text-3xl font-bold tabular-nums'>{count}</div>
      <div className='mt-1 text-[10px] text-foreground/55'>{desc}</div>
    </div>
  )
}
