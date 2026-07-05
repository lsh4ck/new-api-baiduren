import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, ChevronUp, Filter, Download } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
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
import { useConsoleUsageLogs } from '../hooks/use-usage-logs'
import { formatCost, formatTokens, formatDate } from '../lib/utils'

// ─── 模型分布饼图 ───

function ModelDistributionChart({ logs }: { logs: { model: string; cost: number }[] }) {
  const { t } = useTranslation()

  const data = useMemo(() => {
    const costByModel: Record<string, number> = {}
    logs.forEach((log) => {
      costByModel[log.model] = (costByModel[log.model] || 0) + log.cost
    })
    return Object.entries(costByModel)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([model, cost]) => ({ model, cost }))
  }, [logs])

  const COLORS = [
    '#6366f1',
    '#8b5cf6',
    '#a855f7',
    '#d946ef',
    '#ec4899',
    '#f43f5e',
    '#f97316',
    '#eab308',
  ]

  const chartConfig: ChartConfig = {}
  data.forEach((d, i) => {
    chartConfig[d.model] = { label: d.model, color: COLORS[i % COLORS.length] }
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle className='text-sm'>{t('Cost by Model')}</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className='h-[280px]'>
          <ResponsiveContainer width='100%' height='100%'>
            <PieChart>
              <Pie
                data={data}
                cx='50%'
                cy='50%'
                innerRadius={60}
                outerRadius={100}
                paddingAngle={2}
                dataKey='cost'
                nameKey='model'
              >
                {data.map((_entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <ChartTooltip content={<ChartTooltipContent />} />
            </PieChart>
          </ResponsiveContainer>
        </ChartContainer>
        {/* 图例 */}
        <div className='mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs'>
          {data.map((d, i) => (
            <div key={d.model} className='flex items-center gap-2'>
              <div
                className='size-2.5 shrink-0 rounded-full'
                style={{ backgroundColor: COLORS[i % COLORS.length] }}
              />
              <span className='text-muted-foreground truncate'>{d.model}</span>
              <span className='ml-auto font-medium'>{formatCost(d.cost)}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

// ─── 每日用量柱状图 ───

function DailyUsageChart({ logs }: { logs: { timestamp: string; cost: number }[] }) {
  const { t } = useTranslation()

  const data = useMemo(() => {
    const costByDay: Record<string, number> = {}
    logs.forEach((log) => {
      const day = new Date(log.timestamp).toLocaleDateString()
      costByDay[day] = (costByDay[day] || 0) + log.cost
    })
    return Object.entries(costByDay)
      .sort((a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime())
      .slice(-14)
      .map(([day, cost]) => ({ day, cost }))
  }, [logs])

  return (
    <Card>
      <CardHeader>
        <CardTitle className='text-sm'>{t('Daily Cost')}</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer
          config={{ cost: { label: t('Cost'), color: '#6366f1' } }}
          className='h-[200px]'
        >
          <ResponsiveContainer width='100%' height='100%'>
            <BarChart data={data}>
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
                tickFormatter={(v) => `$${v.toFixed(0)}`}
              />
              <RechartsTooltip
                content={({ payload }) => {
                  if (!payload?.[0]) return null
                  return (
                    <div className='rounded-lg border bg-background p-2 text-xs shadow-sm'>
                      <div className='font-medium'>{payload[0].payload.day}</div>
                      <div className='text-muted-foreground'>
                        {formatCost(payload[0].value as number)}
                      </div>
                    </div>
                  )
                }}
              />
              <Bar dataKey='cost' fill='#6366f1' radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}

// ─── 主组件 ───

export function ConsoleUsageLogs() {
  const { t } = useTranslation()
  const { data: apiLogs, isLoading } = useConsoleUsageLogs()
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const [statusFilter, setStatusFilter] = useState<string>('all')

  const logs = apiLogs ?? []

  const filteredLogs = useMemo(() => {
    if (statusFilter === 'all') return logs
    return logs.filter((log) => log.status === statusFilter)
  }, [logs, statusFilter])

  const toggleRow = (id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const totalCost = filteredLogs.reduce((sum, l) => sum + l.cost, 0)
  const totalTokens = filteredLogs.reduce(
    (sum, l) => sum + l.promptTokens + l.completionTokens,
    0
  )

  return (
    <div className='space-y-4'>
      {/* 汇总 */}
      <div className='grid gap-4 sm:grid-cols-3'>
        <Card>
          <CardContent className='pt-5'>
            <div className='text-sm text-muted-foreground'>{t('Total Cost')}</div>
            <div className='text-2xl font-bold'>{isLoading ? '—' : formatCost(totalCost)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className='pt-5'>
            <div className='text-sm text-muted-foreground'>{t('Total Tokens')}</div>
            <div className='text-2xl font-bold'>
              {isLoading ? '—' : formatTokens(totalTokens)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className='pt-5'>
            <div className='text-sm text-muted-foreground'>{t('Total Requests')}</div>
            <div className='text-2xl font-bold'>
              {isLoading ? '—' : filteredLogs.length.toLocaleString()}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 图表 */}
      <div className='grid gap-4 lg:grid-cols-2'>
        <DailyUsageChart logs={logs} />
        <ModelDistributionChart logs={logs} />
      </div>

      {/* 日志表格 */}
      <Card>
        <CardHeader>
          <div className='flex flex-wrap items-center justify-between gap-2'>
            <div>
              <CardTitle>{t('Request Log')}</CardTitle>
              <CardDescription>{t('Detailed usage log for each request')}</CardDescription>
            </div>
            <div className='flex items-center gap-2'>
              <Tabs value={statusFilter} onValueChange={setStatusFilter}>
                <TabsList className='h-7'>
                  <TabsTrigger value='all' className='px-2 py-0 text-xs'>
                    {t('All')}
                  </TabsTrigger>
                  <TabsTrigger value='success' className='px-2 py-0 text-xs'>
                    {t('Success')}
                  </TabsTrigger>
                  <TabsTrigger value='error' className='px-2 py-0 text-xs'>
                    {t('Error')}
                  </TabsTrigger>
                  <TabsTrigger value='timeout' className='px-2 py-0 text-xs'>
                    {t('Timeout')}
                  </TabsTrigger>
                </TabsList>
              </Tabs>
              <Button variant='outline' size='sm' className='h-7'>
                <Download className='mr-1 size-3' />
                {t('Export')}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className='p-0'>
          {isLoading ? (
            <div className='space-y-2 p-4'>
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className='h-8 w-full' />
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className='w-8' />
                  <TableHead>{t('Time')}</TableHead>
                  <TableHead>{t('Model')}</TableHead>
                  <TableHead className='text-right'>{t('Input Tokens')}</TableHead>
                  <TableHead className='text-right'>{t('Output Tokens')}</TableHead>
                  <TableHead className='text-right'>{t('Cost')}</TableHead>
                  <TableHead>{t('Status')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLogs.slice(0, 20).map((log) => (
                  <TableRow key={log.id}>
                    <TableCell>
                      <Button
                        variant='ghost'
                        size='icon'
                        className='size-6'
                        onClick={() => toggleRow(log.id)}
                      >
                        {expandedRows.has(log.id) ? (
                          <ChevronUp className='size-3' />
                        ) : (
                          <ChevronDown className='size-3' />
                        )}
                      </Button>
                    </TableCell>
                    <TableCell className='text-xs'>{formatDate(log.timestamp)}</TableCell>
                    <TableCell>
                      <span className='font-mono text-xs'>{log.model}</span>
                    </TableCell>
                    <TableCell className='text-right font-mono text-xs'>
                      {formatTokens(log.promptTokens)}
                    </TableCell>
                    <TableCell className='text-right font-mono text-xs'>
                      {formatTokens(log.completionTokens)}
                    </TableCell>
                    <TableCell className='text-right font-medium'>
                      {formatCost(log.cost)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          log.status === 'success'
                            ? 'default'
                            : log.status === 'error'
                              ? 'destructive'
                              : 'secondary'
                        }
                        className='text-xs'
                      >
                        {log.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {!isLoading && filteredLogs.length > 20 && (
            <div className='border-t p-3 text-center text-xs text-muted-foreground'>
              {t('Showing top 20 of {{count}} entries', { count: filteredLogs.length })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
