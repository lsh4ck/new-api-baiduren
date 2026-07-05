import { useCallback, useEffect, useState } from 'react'
import { RefreshCw, Plus, Ban, History, Undo2 } from 'lucide-react'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import { cn } from '@/lib/utils'
import {
  getCommissionLedger,
  createManualCommission,
  voidCommission,
  clawbackCommission,
  backfillCommission,
} from '../api'
import type {
  CommissionLedger,
  CommissionStatus,
  CommissionSourceType,
} from '../types'

const STATUS_CLASS: Record<CommissionStatus, string> = {
  pending: 'bg-gray-500/20 text-gray-700 dark:text-gray-400',
  approved: 'bg-green-500/20 text-green-700 dark:text-green-400',
  paid: 'bg-blue-500/20 text-blue-700 dark:text-blue-400',
  clawback: 'bg-red-500/20 text-red-700 dark:text-red-400',
  voided: 'bg-gray-500/20 text-gray-500 dark:text-gray-500',
}
const STATUS_LABEL: Record<CommissionStatus, string> = {
  pending: '锁定中',
  approved: '可提现',
  paid: '已提现',
  clawback: '已追回',
  voided: '已作废',
}
const SOURCE_LABEL: Record<CommissionSourceType, string> = {
  topup: '充值',
  consume: '消费',
  manual: '手动补单',
  clawback_entry: '追回冲账',
}

function StatusBadge({ status }: { status: CommissionStatus }) {
  return (
    <Badge className={STATUS_CLASS[status] ?? 'bg-gray-500/20 text-gray-700'}>
      {STATUS_LABEL[status] ?? status}
    </Badge>
  )
}

const fmtUsd = (n: number) =>
  `$${n.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  })}`

const fmtTs = (ts: number) =>
  ts > 0 ? format(new Date(ts * 1000), 'yyyy-MM-dd HH:mm') : '—'

export function CommissionLedgerTab() {
  const [list, setList] = useState<CommissionLedger[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [statusFilter, setStatusFilter] = useState('all')
  const [sourceFilter, setSourceFilter] = useState('all')
  const [agentIdFilter, setAgentIdFilter] = useState('')
  const [page, setPage] = useState(1)
  const pageSize = 20

  // 手动补单
  const [manualOpen, setManualOpen] = useState(false)
  const [manualAgentId, setManualAgentId] = useState('')
  const [manualCustomerId, setManualCustomerId] = useState('')
  const [manualAmount, setManualAmount] = useState('')
  const [manualRemark, setManualRemark] = useState('')
  const [manualSaving, setManualSaving] = useState(false)

  // 作废
  const [voidTarget, setVoidTarget] = useState<CommissionLedger | null>(null)
  const [voidSaving, setVoidSaving] = useState(false)

  // 追回
  const [clawbackOpen, setClawbackOpen] = useState(false)
  const [clawbackSourceType, setClawbackSourceType] = useState('topup')
  const [clawbackSourceId, setClawbackSourceId] = useState('')
  const [clawbackReason, setClawbackReason] = useState('')
  const [clawbackSaving, setClawbackSaving] = useState(false)

  // 回填
  const [backfilling, setBackfilling] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await getCommissionLedger({
        agent_id: agentIdFilter ? Number(agentIdFilter) : undefined,
        status: statusFilter === 'all' ? undefined : statusFilter,
        source_type: sourceFilter === 'all' ? undefined : sourceFilter,
        page,
        page_size: pageSize,
      })
      if (res.success) {
        setList(res.data ?? [])
        setTotal(res.total ?? 0)
      } else {
        toast.error(res.message || '加载账本失败')
      }
    } catch {
      toast.error('加载账本失败')
    } finally {
      setLoading(false)
    }
  }, [agentIdFilter, statusFilter, sourceFilter, page])

  useEffect(() => {
    load()
  }, [load])

  const submitManual = async () => {
    const agentId = Number(manualAgentId)
    const customerId = Number(manualCustomerId)
    const amount = parseFloat(manualAmount)
    if (!agentId || Number.isNaN(amount)) {
      toast.error('请填写销售 ID 与金额')
      return
    }
    setManualSaving(true)
    try {
      const res = await createManualCommission({
        agent_id: agentId,
        customer_id: customerId || 0,
        amount,
        remark: manualRemark,
      })
      if (res.success) {
        toast.success('已补单')
        setManualOpen(false)
        setManualAgentId('')
        setManualCustomerId('')
        setManualAmount('')
        setManualRemark('')
        load()
      } else {
        toast.error(res.message || '补单失败')
      }
    } catch (e: any) {
      toast.error(e?.response?.data?.message || '补单失败')
    } finally {
      setManualSaving(false)
    }
  }

  const submitVoid = async () => {
    if (!voidTarget) return
    setVoidSaving(true)
    try {
      const res = await voidCommission(voidTarget.id)
      if (res.success) {
        toast.success('已作废')
        setVoidTarget(null)
        load()
      } else {
        toast.error(res.message || '作废失败')
      }
    } catch (e: any) {
      toast.error(e?.response?.data?.message || '作废失败')
    } finally {
      setVoidSaving(false)
    }
  }

  const submitClawback = async () => {
    const sourceId = Number(clawbackSourceId)
    if (!sourceId) {
      toast.error('请填写来源 ID')
      return
    }
    setClawbackSaving(true)
    try {
      const res = await clawbackCommission({
        source_type: clawbackSourceType,
        source_id: sourceId,
        reason: clawbackReason,
      })
      if (res.success) {
        toast.success('已追回')
        setClawbackOpen(false)
        setClawbackSourceId('')
        setClawbackReason('')
        load()
      } else {
        toast.error(res.message || '追回失败')
      }
    } catch (e: any) {
      toast.error(e?.response?.data?.message || '追回失败')
    } finally {
      setClawbackSaving(false)
    }
  }

  const runBackfill = async () => {
    setBackfilling(true)
    try {
      const res = await backfillCommission()
      if (res.success) {
        toast.success(res.message || '历史回填已在后台执行')
      } else {
        toast.error(res.message || '回填失败')
      }
    } catch (e: any) {
      toast.error(e?.response?.data?.message || '回填失败')
    } finally {
      setBackfilling(false)
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div className='space-y-4'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <div className='flex flex-wrap items-center gap-2'>
          <Input
            className='w-28'
            placeholder='销售 ID'
            value={agentIdFilter}
            onChange={(e) => {
              setAgentIdFilter(e.target.value)
              setPage(1)
            }}
          />
          <Select
            value={statusFilter}
            onValueChange={(v) => {
              setStatusFilter(v ?? 'all')
              setPage(1)
            }}
          >
            <SelectTrigger className='w-32'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>全部状态</SelectItem>
              <SelectItem value='pending'>锁定中</SelectItem>
              <SelectItem value='approved'>可提现</SelectItem>
              <SelectItem value='paid'>已提现</SelectItem>
              <SelectItem value='clawback'>已追回</SelectItem>
              <SelectItem value='voided'>已作废</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={sourceFilter}
            onValueChange={(v) => {
              setSourceFilter(v ?? 'all')
              setPage(1)
            }}
          >
            <SelectTrigger className='w-32'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>全部来源</SelectItem>
              <SelectItem value='topup'>充值</SelectItem>
              <SelectItem value='consume'>消费</SelectItem>
              <SelectItem value='manual'>手动补单</SelectItem>
              <SelectItem value='clawback_entry'>追回冲账</SelectItem>
            </SelectContent>
          </Select>
          <span className='text-muted-foreground text-sm'>共 {total} 条</span>
        </div>
        <div className='flex flex-wrap gap-2'>
          <Button size='sm' variant='outline' onClick={load} disabled={loading}>
            <RefreshCw className={cn('mr-1 h-4 w-4', loading && 'animate-spin')} />
            刷新
          </Button>
          <Button size='sm' variant='outline' onClick={() => setClawbackOpen(true)}>
            <Undo2 className='mr-1 h-4 w-4' />
            追回
          </Button>
          <Button size='sm' variant='outline' onClick={runBackfill} disabled={backfilling}>
            <History className='mr-1 h-4 w-4' />
            {backfilling ? '回填中…' : '历史回填'}
          </Button>
          <Button size='sm' onClick={() => setManualOpen(true)}>
            <Plus className='mr-1 h-4 w-4' />
            手动补单
          </Button>
        </div>
      </div>

      <div className='rounded-lg border overflow-hidden'>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>时间</TableHead>
              <TableHead>销售 / 客户</TableHead>
              <TableHead>层级</TableHead>
              <TableHead>来源</TableHead>
              <TableHead className='text-right'>基数</TableHead>
              <TableHead className='text-right'>费率</TableHead>
              <TableHead className='text-right'>金额</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>锁定到期</TableHead>
              <TableHead className='text-right'>操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={10} className='text-muted-foreground py-8 text-center text-sm'>
                  加载中…
                </TableCell>
              </TableRow>
            ) : list.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className='text-muted-foreground py-8 text-center text-sm'>
                  暂无佣金记录
                </TableCell>
              </TableRow>
            ) : (
              list.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className='text-muted-foreground text-xs whitespace-nowrap'>
                    {fmtTs(row.created_at)}
                  </TableCell>
                  <TableCell className='text-sm'>
                    <div>销售 #{row.agent_id}</div>
                    <div className='text-muted-foreground text-xs'>
                      客户 {row.customer_id > 0 ? `#${row.customer_id}` : '—'}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant='outline'>L{row.level}</Badge>
                  </TableCell>
                  <TableCell className='text-sm'>
                    {SOURCE_LABEL[row.source_type] ?? row.source_type}
                  </TableCell>
                  <TableCell className='text-right tabular-nums'>
                    {fmtUsd(row.base_amount)}
                  </TableCell>
                  <TableCell className='text-right tabular-nums'>
                    {(row.rate * 100).toFixed(2)}%
                  </TableCell>
                  <TableCell
                    className={cn(
                      'text-right font-semibold tabular-nums',
                      row.amount < 0
                        ? 'text-red-600 dark:text-red-400'
                        : 'text-green-600 dark:text-green-400'
                    )}
                  >
                    {fmtUsd(row.amount)}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={row.status} />
                  </TableCell>
                  <TableCell className='text-muted-foreground text-xs whitespace-nowrap'>
                    {row.status === 'pending' ? fmtTs(row.lock_until) : '—'}
                  </TableCell>
                  <TableCell className='text-right'>
                    {(row.status === 'pending' || row.status === 'approved') && (
                      <Button
                        size='sm'
                        variant='ghost'
                        className='text-red-600 hover:text-red-700'
                        title='作废'
                        onClick={() => setVoidTarget(row)}
                      >
                        <Ban className='h-4 w-4' />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className='flex items-center justify-end gap-2'>
          <Button
            size='sm'
            variant='outline'
            disabled={page <= 1 || loading}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            上一页
          </Button>
          <span className='text-muted-foreground text-sm tabular-nums'>
            {page} / {totalPages}
          </span>
          <Button
            size='sm'
            variant='outline'
            disabled={page >= totalPages || loading}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            下一页
          </Button>
        </div>
      )}

      {/* 手动补单 */}
      <Dialog open={manualOpen} onOpenChange={(v) => !v && setManualOpen(false)}>
        <DialogContent className='sm:max-w-md'>
          <DialogHeader>
            <DialogTitle>手动补单</DialogTitle>
            <DialogDescription>
              为指定销售手动补一条佣金（金额单位美元，可填负数做扣减）
            </DialogDescription>
          </DialogHeader>
          <div className='space-y-3 py-2'>
            <div className='grid gap-1.5'>
              <Label htmlFor='manual_agent'>销售用户 ID</Label>
              <Input
                id='manual_agent'
                type='number'
                value={manualAgentId}
                onChange={(e) => setManualAgentId(e.target.value)}
                placeholder='如 123'
              />
            </div>
            <div className='grid gap-1.5'>
              <Label htmlFor='manual_customer'>客户用户 ID（可选）</Label>
              <Input
                id='manual_customer'
                type='number'
                value={manualCustomerId}
                onChange={(e) => setManualCustomerId(e.target.value)}
                placeholder='留空表示无关联客户'
              />
            </div>
            <div className='grid gap-1.5'>
              <Label htmlFor='manual_amount'>金额（$）</Label>
              <Input
                id='manual_amount'
                type='number'
                step='0.01'
                value={manualAmount}
                onChange={(e) => setManualAmount(e.target.value)}
                placeholder='如 12.50'
              />
            </div>
            <div className='grid gap-1.5'>
              <Label htmlFor='manual_remark'>备注</Label>
              <Textarea
                id='manual_remark'
                rows={3}
                value={manualRemark}
                onChange={(e) => setManualRemark(e.target.value)}
                placeholder='补单原因，审计可见'
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant='outline' onClick={() => setManualOpen(false)} disabled={manualSaving}>
              取消
            </Button>
            <Button onClick={submitManual} disabled={manualSaving}>
              {manualSaving ? '提交中…' : '确认补单'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 追回 */}
      <Dialog open={clawbackOpen} onOpenChange={(v) => !v && setClawbackOpen(false)}>
        <DialogContent className='sm:max-w-md'>
          <DialogHeader>
            <DialogTitle>佣金追回</DialogTitle>
            <DialogDescription>
              对某笔来源（如退款/作弊充值）的已发放佣金做反向冲账
            </DialogDescription>
          </DialogHeader>
          <div className='space-y-3 py-2'>
            <div className='grid gap-1.5'>
              <Label htmlFor='clawback_type'>来源类型</Label>
              <Select value={clawbackSourceType} onValueChange={(v) => setClawbackSourceType(v ?? 'topup')}>
                <SelectTrigger id='clawback_type'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='topup'>充值</SelectItem>
                  <SelectItem value='consume'>消费</SelectItem>
                  <SelectItem value='manual'>手动补单</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className='grid gap-1.5'>
              <Label htmlFor='clawback_id'>来源 ID</Label>
              <Input
                id='clawback_id'
                type='number'
                value={clawbackSourceId}
                onChange={(e) => setClawbackSourceId(e.target.value)}
                placeholder='对应充值/消费/补单记录 ID'
              />
            </div>
            <div className='grid gap-1.5'>
              <Label htmlFor='clawback_reason'>追回原因</Label>
              <Textarea
                id='clawback_reason'
                rows={3}
                value={clawbackReason}
                onChange={(e) => setClawbackReason(e.target.value)}
                placeholder='如：客户退款 / 确认作弊'
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant='outline' onClick={() => setClawbackOpen(false)} disabled={clawbackSaving}>
              取消
            </Button>
            <Button variant='destructive' onClick={submitClawback} disabled={clawbackSaving}>
              {clawbackSaving ? '提交中…' : '确认追回'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 作废确认 */}
      <AlertDialog open={!!voidTarget} onOpenChange={(v) => !v && setVoidTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>作废这条佣金？</AlertDialogTitle>
            <AlertDialogDescription>
              {voidTarget && (
                <span>
                  销售 #{voidTarget.agent_id} · 金额{' '}
                  <b>{fmtUsd(voidTarget.amount)}</b> · 来源{' '}
                  {SOURCE_LABEL[voidTarget.source_type] ?? voidTarget.source_type}
                  。作废后该笔佣金不再计入可提现，操作会写入审计日志。
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={voidSaving}>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                submitVoid()
              }}
              disabled={voidSaving}
              className='bg-red-600 hover:bg-red-700'
            >
              {voidSaving ? '处理中…' : '确认作废'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
