import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { useAuthStore } from '@/stores/auth-store'
import { api } from '@/lib/api'
import { SectionPageLayout } from '@/components/layout'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Loader2, RefreshCcw, Trash2, Zap, X } from 'lucide-react'
import { toast } from 'sonner'

type StabilityMetric = {
  channel_id: number
  channel_name: string
  status: number
  priority: number
  groups: string
  total_requests: number
  failed_requests: number
  failure_rate: number
  avg_use_time: number
  p95_use_time: number
  max_use_time: number
  over_timeout_count: number
  window_days: number
  test_time: number
  response_time: number
  suggested_action: 'up' | 'down' | 'keep' | 'blocked'
  reason: string
  current_tier: string
  min_allowed_tier: string
}

type ScheduleLog = {
  id: number
  channel_id: number
  channel_name: string
  window_days: number
  total_requests: number
  failure_rate: number
  avg_use_time: number
  p95_use_time: number
  action: string
  from_groups: string
  reason: string
  blocked_by: string
  profit_guard_passed: boolean
  created_at: number
  automatic: boolean
}

type HealthRow = {
  channel_id: number
  name: string
  group: string
  status: number
  priority: number
  successes: number
  errors: number
  total: number
  error_rate: number
  health_level: 'healthy' | 'warning' | 'critical' | 'disabled' | 'silent'
}

// 删除目标：单个 {id,name,group} 或批量（清单）
type DeleteTarget =
  | { kind: 'single'; id: number; name: string; group: string }
  | { kind: 'batch'; rows: { id: number; name: string }[] }

function relativeTime(ts?: number): string {
  if (!ts || ts <= 0) return '从未测试'
  const diff = Date.now() / 1000 - ts
  if (diff < 0) return '刚刚'
  if (diff < 60) return `${Math.floor(diff)} 秒前`
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`
  return `${Math.floor(diff / 86400)} 天前`
}

function StatusBadge({ status }: { status: number }) {
  if (status === 1) return <Badge variant='default'>✅ 启用</Badge>
  if (status === 2) return <Badge variant='secondary'>🟡 停用</Badge>
  if (status === 3) return <Badge variant='destructive'>🔴 自动禁</Badge>
  return <Badge variant='outline'>{status}</Badge>
}

function ActionBadge({ action }: { action: string }) {
  if (action === 'up') return <Badge className='bg-green-600'>⬆ 建议升档</Badge>
  if (action === 'down') return <Badge variant='destructive'>⬇ 建议降档</Badge>
  if (action === 'blocked')
    return <Badge className='bg-orange-500'>🛡 护栏阻止</Badge>
  return <Badge variant='outline'>保持</Badge>
}

function ChannelStabilityPage() {
  const [metrics, setMetrics] = useState<StabilityMetric[]>([])
  const [logs, setLogs] = useState<ScheduleLog[]>([])
  const [logTotal, setLogTotal] = useState(0)
  const [healthRows, setHealthRows] = useState<HealthRow[]>([])
  const [loading, setLoading] = useState(false)
  const [running, setRunning] = useState(false)
  const [testing, setTesting] = useState(false)
  const [windowDays, setWindowDays] = useState(3)

  // 选中删除集合（按 channel_id，跨 health/metrics 两表共享）
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null)
  const [deleting, setDeleting] = useState(false)

  const fetchAll = async () => {
    setLoading(true)
    try {
      const [res1, res2, res3] = await Promise.all([
        api.get(`/api/channel/stability/list?window_days=${windowDays}`),
        api.get('/api/channel/stability/schedule_log?page=1&size=100'),
        api.get('/api/channel/health'),
      ])
      if (res1.data?.success) setMetrics(res1.data.data ?? [])
      if (res2.data?.success) {
        setLogs(res2.data.data?.items ?? [])
        setLogTotal(res2.data.data?.total ?? 0)
      }
      if (res3.data?.success)
        setHealthRows(res3.data.data?.rows ?? res3.data.data ?? [])
    } catch {
      toast.error('加载数据失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowDays])

  // 渠道名映射（删除确认弹窗 + 批量清单用）
  const nameById = useMemo(() => {
    const m = new Map<number, string>()
    for (const r of metrics) m.set(r.channel_id, r.channel_name)
    for (const h of healthRows) if (!m.has(h.channel_id)) m.set(h.channel_id, h.name)
    return m
  }, [metrics, healthRows])

  // 上次全量测试时间 = 所有渠道 test_time 的最大值
  const lastTestAt = useMemo(() => {
    let mx = 0
    for (const r of metrics) if (r.test_time > mx) mx = r.test_time
    return mx
  }, [metrics])

  const handleRun = async () => {
    setRunning(true)
    try {
      const res = await api.post('/api/channel/stability/run_schedule')
      if (res.data?.success) {
        toast.success(`已评估，写入 ${res.data.data?.action_count ?? 0} 条建议`)
        fetchAll()
      } else {
        toast.error(res.data?.message || '执行失败')
      }
    } finally {
      setRunning(false)
    }
  }

  const handleTestAll = async () => {
    setTesting(true)
    const tid = toast.loading('正在全量测试所有渠道…（视渠道数量可能需要 1-2 分钟）')
    try {
      const res = await api.get('/api/channel/test')
      if (res.data?.success) {
        toast.success('全量测试完成', { id: tid })
        fetchAll()
      } else {
        toast.error(res.data?.message || '测试触发失败', { id: tid })
      }
    } catch {
      toast.error('测试请求失败（可能仍在后台进行，稍后刷新查看）', { id: tid })
    } finally {
      setTesting(false)
    }
  }

  const toggleOne = (id: number, on: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  }
  const toggleMany = (ids: number[], on: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev)
      for (const id of ids) {
        if (on) next.add(id)
        else next.delete(id)
      }
      return next
    })
  }
  const clearSelection = () => setSelected(new Set())

  const doDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      if (deleteTarget.kind === 'single') {
        await api.delete(`/api/channel/${deleteTarget.id}`)
        toast.success(`已从数据库删除 #${deleteTarget.id} ${deleteTarget.name}`)
        toggleOne(deleteTarget.id, false)
      } else {
        const ids = deleteTarget.rows.map((r) => r.id)
        await api.post('/api/channel/batch', { ids })
        toast.success(`已从数据库删除 ${ids.length} 条渠道`)
        clearSelection()
      }
      setDeleteTarget(null)
      fetchAll()
    } catch (e: any) {
      toast.error(e?.response?.data?.message || '删除失败')
    } finally {
      setDeleting(false)
    }
  }

  const openBatchDelete = () => {
    if (selected.size === 0) return
    const rows = Array.from(selected).map((id) => ({
      id,
      name: nameById.get(id) ?? `#${id}`,
    }))
    setDeleteTarget({ kind: 'batch', rows })
  }

  // 行级 checkbox + 删除按钮（health / metrics 共用）
  const RowSelect = ({ id }: { id: number }) => (
    <Checkbox
      checked={selected.has(id)}
      onCheckedChange={(v) => toggleOne(id, v === true)}
      aria-label={`选择渠道 ${id}`}
    />
  )
  const RowDelete = ({ id, name, group }: { id: number; name: string; group: string }) => (
    <Button
      variant='destructive'
      size='icon'
      className='size-7'
      title='从数据库删除该渠道'
      onClick={() => setDeleteTarget({ kind: 'single', id, name, group })}
    >
      <Trash2 className='h-3.5 w-3.5' />
    </Button>
  )
  const HeadSelect = ({ ids }: { ids: number[] }) => {
    const allOn = ids.length > 0 && ids.every((id) => selected.has(id))
    const someOn = ids.some((id) => selected.has(id))
    return (
      <Checkbox
        checked={allOn}
        indeterminate={!allOn && someOn}
        onCheckedChange={(v) => toggleMany(ids, v === true)}
        aria-label='全选'
      />
    )
  }

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>渠道稳定性监控</SectionPageLayout.Title>
      <SectionPageLayout.Description>
        过去 {windowDays} 天稳定性指标 + 升降档建议（按 30% 利润护栏校验）
      </SectionPageLayout.Description>
      <SectionPageLayout.Content>
        {/* 顶部状态条：上次全量测试 + 立即全测 */}
        <div className='mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 bg-card/60 px-4 py-3 backdrop-blur-md'>
          <div className='flex items-center gap-2.5 text-sm'>
            <span className='flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary'>
              <Zap className='h-4 w-4' />
            </span>
            <div className='leading-tight'>
              <div className='font-medium'>
                上次全量测试 ·{' '}
                <span className='text-muted-foreground'>{relativeTime(lastTestAt)}</span>
              </div>
              <div className='text-xs text-muted-foreground'>
                自动每天测一次 · 测试结果写入下方各渠道
              </div>
            </div>
          </div>
          <Button size='sm' onClick={handleTestAll} disabled={testing}>
            {testing ? (
              <Loader2 className='mr-1 h-4 w-4 animate-spin' />
            ) : (
              <Zap className='mr-1 h-4 w-4' />
            )}
            立即全测
          </Button>
        </div>

        <div className='mb-4 flex flex-wrap items-center justify-end gap-2'>
          <div className='flex gap-2'>
            <select
              value={windowDays}
              onChange={(e) => setWindowDays(Number(e.target.value))}
              className='rounded-md border bg-background px-2 py-1 text-sm'
            >
              <option value={1}>1 天</option>
              <option value={3}>3 天</option>
              <option value={7}>7 天</option>
              <option value={14}>14 天</option>
              <option value={30}>30 天</option>
            </select>
            <Button variant='outline' size='sm' onClick={fetchAll} disabled={loading}>
              <RefreshCcw className='mr-1 h-4 w-4' /> 刷新
            </Button>
            <Button size='sm' onClick={handleRun} disabled={running}>
              {running && <Loader2 className='mr-1 h-4 w-4 animate-spin' />}
              手动跑调度评估
            </Button>
          </div>
        </div>

        <Tabs defaultValue='health'>
          <TabsList>
            <TabsTrigger value='health'>
              实时健康度（24h · {healthRows.length}）
            </TabsTrigger>
            <TabsTrigger value='metrics'>
              稳定性 + 调度建议（{windowDays}d）
            </TabsTrigger>
            <TabsTrigger value='logs'>调度日志（{logTotal}）</TabsTrigger>
          </TabsList>

          <TabsContent value='health' className='mt-4'>
            <div className='rounded-md border'>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className='w-10'>
                      <HeadSelect ids={healthRows.map((h) => h.channel_id)} />
                    </TableHead>
                    <TableHead>ID</TableHead>
                    <TableHead>渠道</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead className='text-right'>成功</TableHead>
                    <TableHead className='text-right'>错误</TableHead>
                    <TableHead className='text-right'>总数</TableHead>
                    <TableHead className='text-right'>错误率</TableHead>
                    <TableHead>健康等级</TableHead>
                    <TableHead className='w-12 text-right'>操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {healthRows.map((h) => (
                    <TableRow
                      key={h.channel_id}
                      data-state={selected.has(h.channel_id) ? 'selected' : undefined}
                    >
                      <TableCell>
                        <RowSelect id={h.channel_id} />
                      </TableCell>
                      <TableCell>{h.channel_id}</TableCell>
                      <TableCell className='font-medium'>{h.name}</TableCell>
                      <TableCell>
                        <StatusBadge status={h.status} />
                      </TableCell>
                      <TableCell className='text-right text-green-600'>
                        {h.successes}
                      </TableCell>
                      <TableCell className='text-right text-red-600'>
                        {h.errors}
                      </TableCell>
                      <TableCell className='text-right'>{h.total}</TableCell>
                      <TableCell className='text-right font-mono'>
                        {(h.error_rate * 100).toFixed(1)}%
                      </TableCell>
                      <TableCell>
                        {h.health_level === 'healthy' && (
                          <Badge className='bg-green-600'>🟢 健康</Badge>
                        )}
                        {h.health_level === 'warning' && (
                          <Badge className='bg-orange-500'>🟡 警告</Badge>
                        )}
                        {h.health_level === 'critical' && (
                          <Badge variant='destructive'>🔴 严重</Badge>
                        )}
                        {h.health_level === 'silent' && (
                          <Badge variant='outline'>⚪ 静默</Badge>
                        )}
                        {h.health_level === 'disabled' && (
                          <Badge variant='secondary'>🟤 已禁用</Badge>
                        )}
                      </TableCell>
                      <TableCell className='text-right'>
                        <RowDelete id={h.channel_id} name={h.name} group={h.group} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          <TabsContent value='metrics' className='mt-4'>
            <div className='rounded-md border'>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className='w-10'>
                      <HeadSelect ids={metrics.map((m) => m.channel_id)} />
                    </TableHead>
                    <TableHead>ID</TableHead>
                    <TableHead>渠道</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead className='text-right'>请求数</TableHead>
                    <TableHead className='text-right'>失败率</TableHead>
                    <TableHead className='text-right'>P95(s)</TableHead>
                    <TableHead className='text-right'>超60s</TableHead>
                    <TableHead>上次测试</TableHead>
                    <TableHead>建议</TableHead>
                    <TableHead>理由</TableHead>
                    <TableHead className='w-12 text-right'>操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {metrics.map((m) => (
                    <TableRow
                      key={m.channel_id}
                      data-state={selected.has(m.channel_id) ? 'selected' : undefined}
                    >
                      <TableCell>
                        <RowSelect id={m.channel_id} />
                      </TableCell>
                      <TableCell>{m.channel_id}</TableCell>
                      <TableCell className='font-medium'>{m.channel_name}</TableCell>
                      <TableCell>
                        <StatusBadge status={m.status} />
                      </TableCell>
                      <TableCell className='text-right'>{m.total_requests}</TableCell>
                      <TableCell
                        className={`text-right ${m.failure_rate > 0.15 ? 'text-red-600 font-semibold' : m.failure_rate > 0.05 ? 'text-orange-500' : 'text-green-600'}`}
                      >
                        {(m.failure_rate * 100).toFixed(1)}%
                      </TableCell>
                      <TableCell className='text-right'>{m.p95_use_time}</TableCell>
                      <TableCell className='text-right'>{m.over_timeout_count}</TableCell>
                      <TableCell className='text-xs text-muted-foreground'>
                        {relativeTime(m.test_time)}
                        {m.response_time > 0 && (
                          <span className='ml-1 font-mono'>
                            · {(m.response_time / 1000).toFixed(1)}s
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <ActionBadge action={m.suggested_action} />
                      </TableCell>
                      <TableCell className='max-w-xs text-xs text-muted-foreground'>
                        {m.reason}
                      </TableCell>
                      <TableCell className='text-right'>
                        <RowDelete id={m.channel_id} name={m.channel_name} group={m.groups} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          <TabsContent value='logs' className='mt-4'>
            <div className='rounded-md border'>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>时间</TableHead>
                    <TableHead>渠道</TableHead>
                    <TableHead className='text-right'>请求</TableHead>
                    <TableHead className='text-right'>失败率</TableHead>
                    <TableHead>动作</TableHead>
                    <TableHead>护栏</TableHead>
                    <TableHead>理由</TableHead>
                    <TableHead>触发</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className='text-center text-muted-foreground'>
                        暂无调度日志（系统启动 10 分钟后自动跑首次评估，之后每 3 天）
                      </TableCell>
                    </TableRow>
                  ) : (
                    logs.map((l) => (
                      <TableRow key={l.id}>
                        <TableCell className='text-xs'>
                          {new Date(l.created_at * 1000).toLocaleString()}
                        </TableCell>
                        <TableCell className='font-medium'>
                          #{l.channel_id} {l.channel_name}
                        </TableCell>
                        <TableCell className='text-right'>{l.total_requests}</TableCell>
                        <TableCell className='text-right'>
                          {(l.failure_rate * 100).toFixed(1)}%
                        </TableCell>
                        <TableCell>
                          <ActionBadge action={l.action} />
                        </TableCell>
                        <TableCell>
                          {l.profit_guard_passed ? (
                            <span className='text-green-600'>✓</span>
                          ) : (
                            <span className='text-orange-500'>⛔ {l.blocked_by}</span>
                          )}
                        </TableCell>
                        <TableCell className='max-w-xs text-xs text-muted-foreground'>
                          {l.reason}
                        </TableCell>
                        <TableCell>{l.automatic ? '自动' : '手动'}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        </Tabs>
      </SectionPageLayout.Content>

      {/* 批量操作浮条：选中后从底部滑入。Portal 到 body，避免被祖先 transform/overflow 裁掉 */}
      {selected.size > 0 &&
        createPortal(
          <div className='pointer-events-none fixed inset-x-0 bottom-6 z-[60] flex justify-center px-4'>
            <div className='animate-in fade-in slide-in-from-bottom-4 pointer-events-auto flex items-center gap-3 rounded-2xl border border-border/60 bg-card/80 px-4 py-2.5 shadow-lg backdrop-blur-xl'>
              <span className='text-sm font-medium'>
                已选 <span className='text-primary'>{selected.size}</span> 条渠道
              </span>
              <Button variant='destructive' size='sm' onClick={openBatchDelete}>
                <Trash2 className='mr-1 h-4 w-4' /> 批量删除
              </Button>
              <Button variant='ghost' size='sm' onClick={clearSelection}>
                <X className='mr-1 h-4 w-4' /> 取消
              </Button>
            </div>
          </div>,
          document.body
        )}

      {/* 删除二次确认 */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(v) => !v && !deleting && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleteTarget?.kind === 'batch'
                ? `永久删除 ${deleteTarget.rows.length} 条渠道？`
                : '永久删除该渠道？'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.kind === 'single' && (
                <span>
                  渠道 <b>#{deleteTarget.id} {deleteTarget.name}</b>
                  <br />
                  所在分组：
                  <span className='text-muted-foreground'>
                    {deleteTarget.group || '（无）'}
                  </span>
                </span>
              )}
              {deleteTarget?.kind === 'batch' && (
                <span className='block max-h-48 overflow-y-auto rounded-md border bg-muted/40 p-2 text-xs'>
                  {deleteTarget.rows.map((r) => (
                    <span key={r.id} className='block'>
                      #{r.id} {r.name}
                    </span>
                  ))}
                </span>
              )}
              <span className='mt-3 block font-medium text-destructive'>
                将从数据库永久删除（含 abilities 路由记录），不可恢复。
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                doDelete()
              }}
              disabled={deleting}
              className='bg-red-600 hover:bg-red-700'
            >
              {deleting ? '删除中…' : '确认永久删除'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SectionPageLayout>
  )
}

export const Route = createFileRoute('/_authenticated/channel-stability')({
  beforeLoad: () => {
    const user = useAuthStore.getState().auth.user
    if (!user || user.role < 10) {
      throw redirect({ to: '/console' })
    }
  },
  component: ChannelStabilityPage,
})
