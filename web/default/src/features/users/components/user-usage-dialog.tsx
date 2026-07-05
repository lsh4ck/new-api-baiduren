import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
} from 'recharts'
import { toast } from 'sonner'
import { formatQuota } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import {
  getUserUsageSummary,
  getAdminTopups,
  getAdminUserOptimization,
  type UserUsageByModel,
  type UserUsageByDay,
} from '../api'

const RANGE_OPTIONS = [
  { value: '7', label: '近 7 天' },
  { value: '30', label: '近 30 天' },
  { value: '90', label: '近 90 天' },
  { value: '0', label: '全部' },
]

const PIE_COLORS = [
  '#6366f1',
  '#8b5cf6',
  '#a855f7',
  '#d946ef',
  '#ec4899',
  '#f43f5e',
  '#f97316',
  '#eab308',
  '#84cc16',
  '#10b981',
]

function buildRangeTimestamps(daysStr: string): {
  start_timestamp?: number
  end_timestamp?: number
} {
  const days = parseInt(daysStr, 10)
  if (!days || days <= 0) return {}
  const end = Math.floor(Date.now() / 1000)
  const start = end - days * 86400
  return { start_timestamp: start, end_timestamp: end }
}

function bucketToDate(bucket: number): string {
  const d = new Date(bucket * 86400 * 1000)
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M'
  if (n >= 1000) return (n / 1000).toFixed(2) + 'K'
  return String(n)
}

function topupStatusBadge(status: string): {
  variant: 'default' | 'secondary' | 'destructive' | 'outline'
  label: string
} {
  const s = (status || '').toLowerCase()
  if (s === 'success' || s === 'paid' || s === 'completed')
    return { variant: 'default', label: status || '成功' }
  if (s === 'pending' || s === 'wait_pay' || s === 'created')
    return { variant: 'secondary', label: status || '待支付' }
  return { variant: 'destructive', label: status || '失败' }
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  userId: number
  username: string
}

export function UserUsageDialog({ open, onOpenChange, userId, username }: Props) {
  const { t } = useTranslation()
  const [range, setRange] = useState<string>('30')
  const [topupPage, setTopupPage] = useState(1)
  const topupPageSize = 10

  // Reset on open
  useEffect(() => {
    if (open) {
      setRange('30')
      setTopupPage(1)
    }
  }, [open])

  const ts = useMemo(() => buildRangeTimestamps(range), [range])

  const summaryQuery = useQuery({
    enabled: open && userId > 0,
    queryKey: ['user-usage-summary', userId, range],
    queryFn: () =>
      getUserUsageSummary(userId, {
        start_timestamp: ts.start_timestamp,
        end_timestamp: ts.end_timestamp,
        top: 30,
      }),
  })

  const topupQuery = useQuery({
    enabled: open && userId > 0,
    queryKey: ['user-topups', userId, topupPage, topupPageSize],
    queryFn: () =>
      getAdminTopups({
        user_id: userId,
        p: topupPage,
        page_size: topupPageSize,
      }),
  })

  const optimizationQuery = useQuery({
    enabled: open && userId > 0,
    queryKey: ['user-optimization', userId],
    queryFn: () => getAdminUserOptimization(userId),
    retry: false,
  })

  useEffect(() => {
    if (summaryQuery.error) toast.error('用量数据加载失败')
  }, [summaryQuery.error])
  useEffect(() => {
    if (topupQuery.error) toast.error('充值记录加载失败')
  }, [topupQuery.error])

  const summary = summaryQuery.data?.success ? summaryQuery.data.data : undefined
  const topupItems = topupQuery.data?.success ? topupQuery.data.data?.items ?? [] : []
  const topupTotal = topupQuery.data?.success
    ? topupQuery.data.data?.total ?? 0
    : 0

  // Pie chart data: top 8 + 其他
  const pieData = useMemo(() => {
    if (!summary) return []
    const list = (summary.by_model || []).slice().sort((a, b) => b.quota - a.quota)
    const top = list.slice(0, 8)
    const rest = list.slice(8)
    const totalQuota = list.reduce((s, m) => s + m.quota, 0) || 1
    const data = top.map((m) => ({
      model_name: m.model_name || '(unknown)',
      quota: m.quota,
      request_count: m.request_count,
      total_tokens: m.total_tokens,
      ratio: m.quota / totalQuota,
    }))
    if (rest.length > 0) {
      const restQuota = rest.reduce((s, m) => s + m.quota, 0)
      const restReq = rest.reduce((s, m) => s + m.request_count, 0)
      const restTokens = rest.reduce((s, m) => s + m.total_tokens, 0)
      data.push({
        model_name: `其他 (${rest.length})`,
        quota: restQuota,
        request_count: restReq,
        total_tokens: restTokens,
        ratio: restQuota / totalQuota,
      })
    }
    return data
  }, [summary])

  const dailyData = useMemo(() => {
    if (!summary) return []
    return (summary.by_day || []).map((d) => ({
      day: bucketToDate(d.day_bucket),
      quota: d.quota,
      tokens: d.total_tokens,
      requests: d.request_count,
    }))
  }, [summary])

  const pieConfig: ChartConfig = useMemo(() => {
    const cfg: ChartConfig = {}
    pieData.forEach((d, i) => {
      cfg[d.model_name] = {
        label: d.model_name,
        color: PIE_COLORS[i % PIE_COLORS.length],
      }
    })
    return cfg
  }, [pieData])

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side='right'
        className='bg-background flex !h-dvh !w-screen max-w-none gap-0 overflow-hidden p-0 sm:!w-full sm:!max-w-[900px]'
      >
        <SheetHeader className='bg-background border-b px-4 py-3 text-start sm:px-5 sm:py-4'>
          <SheetTitle className='text-base sm:text-lg'>
            {t('Usage Details')} · {username}
          </SheetTitle>
          <SheetDescription className='pr-6 text-xs sm:text-sm'>
            按模型分布、用量趋势、充值与消费记录
          </SheetDescription>
        </SheetHeader>

        <div className='flex-1 overflow-y-auto px-4 py-4 sm:px-5'>
          {/* 时间范围选择 */}
          <div className='mb-4 flex flex-wrap items-center gap-2'>
            <span className='text-muted-foreground text-xs'>{t('Range')}:</span>
            {RANGE_OPTIONS.map((opt) => (
              <Button
                key={opt.value}
                size='sm'
                variant={range === opt.value ? 'default' : 'outline'}
                onClick={() => setRange(opt.value)}
              >
                {opt.label}
              </Button>
            ))}
          </div>

          {/* 顶部摘要卡片 */}
          <div className='mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4'>
            <SummaryCard
              title='请求次数'
              value={
                summaryQuery.isLoading
                  ? '—'
                  : (summary?.totals.request_count ?? 0).toLocaleString()
              }
            />
            <SummaryCard
              title='消费额度'
              value={
                summaryQuery.isLoading
                  ? '—'
                  : formatQuota(summary?.totals.quota ?? 0)
              }
            />
            <SummaryCard
              title='Token 总量'
              value={
                summaryQuery.isLoading
                  ? '—'
                  : formatTokens(summary?.totals.total_tokens ?? 0)
              }
            />
            <SummaryCard
              title='窗口内充值'
              value={
                summaryQuery.isLoading
                  ? '—'
                  : formatQuota(summary?.totals.topup ?? 0)
              }
            />
          </div>

          {/* SmartRelay 节省卡片：跨 30 天 */}
          {optimizationQuery.data && (() => {
            const tokSaved = optimizationQuery.data.total_tokens_saved ?? 0
            const usdSaved = optimizationQuery.data.estimated_saved_usd ?? 0
            const cnySaved = usdSaved * 6.78
            // SmartRelay sidecar 偶尔会返回 > 1 的 rate（分母用 input_only 而非 input+cache），前端 clamp 到 [0, 100]
            const rawRate = (optimizationQuery.data.cache_hit_rate ?? 0) * 100
            const cacheHitRate = Math.min(Math.max(rawRate, 0), 100)
            const todaySaved = optimizationQuery.data.today?.tokens_saved ?? 0
            const INDUSTRY_AVG = 50  // 业界平均缓存命中率（Anthropic / DeepSeek 公开数据）
            const delta = cacheHitRate - INDUSTRY_AVG
            const hasData = tokSaved > 0
            return (
              <div className='mb-4 rounded-xl border-2 border-amber-500/30 bg-gradient-to-br from-amber-500/10 via-rose-500/8 to-fuchsia-500/8 p-4 shadow-sm'>
                <div className='mb-3 flex items-center justify-between gap-2'>
                  <div className='flex items-center gap-2'>
                    <span className='text-base'>💎</span>
                    <span className='text-sm font-bold bg-gradient-to-r from-amber-600 via-rose-500 to-fuchsia-500 bg-clip-text text-transparent'>
                      SmartRelay 帮他省了多少（近 30 天）
                    </span>
                  </div>
                  {!hasData && (
                    <span className='text-muted-foreground text-[10px]'>暂无消费</span>
                  )}
                </div>
                <div className='grid grid-cols-2 gap-3 sm:grid-cols-4'>
                  {/* Tokens 节省 */}
                  <div className='rounded-lg bg-background/60 backdrop-blur-sm p-3 border border-emerald-500/15'>
                    <div className='text-[10px] uppercase tracking-wider text-foreground/50'>省下 tokens</div>
                    <div className='mt-1 text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400'>
                      {formatTokens(tokSaved)}
                    </div>
                    {todaySaved > 0 && (
                      <div className='mt-0.5 text-[10px] text-foreground/50'>
                        今日 +{formatTokens(todaySaved)}
                      </div>
                    )}
                  </div>
                  {/* 钱 */}
                  <div className='rounded-lg bg-background/60 backdrop-blur-sm p-3 border border-amber-500/20'>
                    <div className='text-[10px] uppercase tracking-wider text-foreground/50'>省下钱</div>
                    <div className='mt-1 text-2xl font-bold tabular-nums text-amber-600 dark:text-amber-400'>
                      ¥{cnySaved.toFixed(2)}
                    </div>
                    <div className='mt-0.5 text-[10px] text-foreground/50'>
                      ${usdSaved.toFixed(2)} USD
                    </div>
                  </div>
                  {/* 缓存命中率 + vs 业界 */}
                  <div className='rounded-lg bg-background/60 backdrop-blur-sm p-3 border border-fuchsia-500/15'>
                    <div className='text-[10px] uppercase tracking-wider text-foreground/50'>缓存命中率</div>
                    <div className='mt-1 text-2xl font-bold tabular-nums text-fuchsia-600 dark:text-fuchsia-400'>
                      {cacheHitRate.toFixed(1)}%
                    </div>
                    <div className={cn(
                      'mt-0.5 text-[10px] font-medium',
                      delta >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-foreground/50'
                    )}>
                      {delta >= 0 ? `↑ 高于业界 ${delta.toFixed(0)}%` : `vs 业界 ${INDUSTRY_AVG}%`}
                    </div>
                  </div>
                  {/* 等效折扣 */}
                  <div className='rounded-lg bg-background/60 backdrop-blur-sm p-3 border border-indigo-500/15'>
                    <div className='text-[10px] uppercase tracking-wider text-foreground/50'>等效折扣</div>
                    <div className='mt-1 text-2xl font-bold tabular-nums text-indigo-600 dark:text-indigo-400'>
                      {cacheHitRate > 0 ? (cacheHitRate * 0.9 / 100 * 100).toFixed(0) + '%' : '-'}
                    </div>
                    <div className='mt-0.5 text-[10px] text-foreground/50'>
                      实际付价比官价更低
                    </div>
                  </div>
                </div>
                {hasData && (
                  <div className='mt-3 text-[11px] text-foreground/55 italic'>
                    💡 SmartRelay 4 层算法（响应缓存 + 上下文压缩 + 上游缓存优化 + 工具响应截断）默默为客户省钱，
                    {delta >= 0 ? `他的命中率比业界平均高 ${delta.toFixed(0)}%` : '可继续推荐 cache 优化场景使用'}
                  </div>
                )}
              </div>
            )
          })()}

          <Tabs defaultValue='by-model'>
            <TabsList>
              <TabsTrigger value='by-model'>模型分布</TabsTrigger>
              <TabsTrigger value='by-day'>用量趋势</TabsTrigger>
              <TabsTrigger value='topups'>充值/消费记录</TabsTrigger>
            </TabsList>

            <TabsContent value='by-model' className='mt-4 space-y-4'>
              {summaryQuery.isLoading ? (
                <Skeleton className='h-[320px] w-full' />
              ) : pieData.length === 0 ? (
                <EmptyHint text='当前时间窗内无消费数据' />
              ) : (
                <div className='grid gap-4 lg:grid-cols-[380px_1fr]'>
                  <Card>
                    <CardHeader>
                      <CardTitle className='text-sm'>额度占比</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ChartContainer config={pieConfig} className='h-[280px]'>
                        <ResponsiveContainer width='100%' height='100%'>
                          <PieChart>
                            <Pie
                              data={pieData}
                              cx='50%'
                              cy='50%'
                              innerRadius={60}
                              outerRadius={100}
                              paddingAngle={2}
                              dataKey='quota'
                              nameKey='model_name'
                            >
                              {pieData.map((_, i) => (
                                <Cell
                                  key={`cell-${i}`}
                                  fill={PIE_COLORS[i % PIE_COLORS.length]}
                                />
                              ))}
                            </Pie>
                            <ChartTooltip content={<ChartTooltipContent />} />
                          </PieChart>
                        </ResponsiveContainer>
                      </ChartContainer>
                      <div className='mt-2 grid grid-cols-1 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-2'>
                        {pieData.map((d, i) => (
                          <div key={d.model_name} className='flex items-center gap-2'>
                            <div
                              className='size-2.5 shrink-0 rounded-full'
                              style={{
                                backgroundColor: PIE_COLORS[i % PIE_COLORS.length],
                              }}
                            />
                            <span className='text-muted-foreground truncate'>
                              {d.model_name}
                            </span>
                            <span className='ml-auto font-medium'>
                              {(d.ratio * 100).toFixed(1)}%
                            </span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className='text-sm'>模型用量明细</CardTitle>
                    </CardHeader>
                    <CardContent className='p-0'>
                      <div className='max-h-[360px] overflow-x-auto overflow-y-auto'>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>模型</TableHead>
                              <TableHead className='text-right'>请求</TableHead>
                              <TableHead className='text-right'>输入</TableHead>
                              <TableHead className='text-right'>输出</TableHead>
                              <TableHead className='text-right'>缓存命中</TableHead>
                              <TableHead className='text-right'>额度</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {(summary?.by_model || []).map((m: UserUsageByModel) => {
                              // cache_tokens 在 new-api 里与 prompt_tokens 分开记账（prompt 不含 cache_read），
                              // 所以命中率分母 = prompt + cache，否则会出现 > 100% 的假象
                              const totalInput = m.prompt_tokens + m.cache_tokens
                              const cacheHitPct =
                                totalInput > 0
                                  ? (m.cache_tokens / totalInput) * 100
                                  : 0
                              return (
                                <TableRow key={m.model_name}>
                                  <TableCell className='font-mono text-xs'>
                                    {m.model_name || '(unknown)'}
                                  </TableCell>
                                  <TableCell className='text-right text-xs'>
                                    {m.request_count.toLocaleString()}
                                  </TableCell>
                                  <TableCell className='text-right text-xs'>
                                    {formatTokens(m.prompt_tokens)}
                                  </TableCell>
                                  <TableCell className='text-right text-xs'>
                                    {formatTokens(m.completion_tokens)}
                                  </TableCell>
                                  <TableCell className='text-right text-xs'>
                                    {m.cache_tokens > 0 ? (
                                      <span>
                                        <span className='text-foreground'>
                                          {formatTokens(m.cache_tokens)}
                                        </span>
                                        <span className='text-muted-foreground ml-1'>
                                          ({cacheHitPct.toFixed(1)}%)
                                        </span>
                                      </span>
                                    ) : (
                                      <span className='text-muted-foreground'>—</span>
                                    )}
                                  </TableCell>
                                  <TableCell className='text-right text-xs font-medium'>
                                    {formatQuota(m.quota)}
                                  </TableCell>
                                </TableRow>
                              )
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}
            </TabsContent>

            <TabsContent value='by-day' className='mt-4 space-y-4'>
              {summaryQuery.isLoading ? (
                <Skeleton className='h-[280px] w-full' />
              ) : dailyData.length === 0 ? (
                <EmptyHint text='当前时间窗内无趋势数据' />
              ) : (
                <Card>
                  <CardHeader>
                    <CardTitle className='text-sm'>每日消费额度</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ChartContainer
                      config={{ quota: { label: '额度', color: '#6366f1' } }}
                      className='h-[280px]'
                    >
                      <ResponsiveContainer width='100%' height='100%'>
                        <BarChart data={dailyData}>
                          <CartesianGrid strokeDasharray='3 3' vertical={false} />
                          <XAxis
                            dataKey='day'
                            tick={{ fontSize: 11 }}
                            tickLine={false}
                            axisLine={false}
                          />
                          <YAxis
                            tick={{ fontSize: 11 }}
                            tickLine={false}
                            axisLine={false}
                            tickFormatter={(v) => formatQuota(v as number)}
                          />
                          <RechartsTooltip
                            content={({ payload }) => {
                              if (!payload?.[0]) return null
                              const p = payload[0].payload
                              return (
                                <div className='rounded-lg border bg-background p-2 text-xs shadow-sm'>
                                  <div className='font-medium'>{p.day}</div>
                                  <div className='text-muted-foreground'>
                                    额度: {formatQuota(p.quota)}
                                  </div>
                                  <div className='text-muted-foreground'>
                                    Tokens: {formatTokens(p.tokens)}
                                  </div>
                                  <div className='text-muted-foreground'>
                                    请求: {p.requests.toLocaleString()}
                                  </div>
                                </div>
                              )
                            }}
                          />
                          <Bar dataKey='quota' fill='#6366f1' radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </ChartContainer>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value='topups' className='mt-4 space-y-4'>
              <Card>
                <CardHeader>
                  <CardTitle className='text-sm'>充值记录（全时段）</CardTitle>
                </CardHeader>
                <CardContent className='p-0'>
                  {topupQuery.isLoading ? (
                    <div className='p-4'>
                      <Skeleton className='h-32 w-full' />
                    </div>
                  ) : topupItems.length === 0 ? (
                    <div className='p-6'>
                      <EmptyHint text='该用户无充值记录' />
                    </div>
                  ) : (
                    <div className='max-h-[420px] overflow-y-auto'>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>订单号</TableHead>
                            <TableHead>金额</TableHead>
                            <TableHead>额度</TableHead>
                            <TableHead>支付方式</TableHead>
                            <TableHead>状态</TableHead>
                            <TableHead>创建时间</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {topupItems.map((tu) => {
                            const badge = topupStatusBadge(tu.status)
                            return (
                              <TableRow key={tu.id}>
                                <TableCell className='font-mono text-xs'>
                                  {tu.trade_no}
                                </TableCell>
                                <TableCell className='text-xs'>
                                  ${tu.money?.toFixed?.(2) ?? tu.money}
                                </TableCell>
                                <TableCell className='text-xs'>
                                  {formatQuota(tu.amount)}
                                </TableCell>
                                <TableCell className='text-xs'>
                                  {tu.payment_method || '-'}
                                </TableCell>
                                <TableCell>
                                  <Badge variant={badge.variant}>{badge.label}</Badge>
                                </TableCell>
                                <TableCell className='text-xs whitespace-nowrap'>
                                  {tu.create_time
                                    ? new Date(tu.create_time * 1000).toLocaleString()
                                    : '-'}
                                </TableCell>
                              </TableRow>
                            )
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>

              {topupTotal > topupPageSize && (
                <div className='flex items-center justify-end gap-2'>
                  <span className='text-muted-foreground text-xs'>
                    共 {topupTotal} 条
                  </span>
                  <Button
                    size='sm'
                    variant='outline'
                    disabled={topupPage <= 1}
                    onClick={() => setTopupPage((p) => Math.max(1, p - 1))}
                  >
                    上一页
                  </Button>
                  <Button
                    size='sm'
                    variant='outline'
                    disabled={topupPage * topupPageSize >= topupTotal}
                    onClick={() => setTopupPage((p) => p + 1)}
                  >
                    下一页
                  </Button>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>

        <SheetFooter className='bg-background border-t px-4 py-3 sm:px-5 sm:py-4'>
          <SheetClose render={<Button variant='outline' />}>{t('Close')}</SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

function SummaryCard({ title, value }: { title: string; value: string }) {
  return (
    <div className={cn('bg-card rounded-lg border p-3')}>
      <div className='text-muted-foreground mb-1 text-xs'>{title}</div>
      <div className='text-base font-semibold'>{value}</div>
    </div>
  )
}

function EmptyHint({ text }: { text: string }) {
  return (
    <div className='text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm'>
      {text}
    </div>
  )
}

// Suppress unused import warnings for chart types referenced via interface only
export type { UserUsageByDay }
