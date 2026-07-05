import { useCallback, useEffect, useState } from 'react'
import { RefreshCw, ShieldCheck, ShieldAlert, Snowflake } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { getFraudSuspects, reviewFraud, freezeAgent } from '../api'
import type { FraudSuspect } from '../types'

const FLAG_LABEL: Record<number, string> = {
  0: '正常',
  1: '疑似',
  2: '确认作弊',
  3: '已放行',
}
const FLAG_CLASS: Record<number, string> = {
  0: 'bg-gray-500/20 text-gray-700 dark:text-gray-400',
  1: 'bg-amber-500/20 text-amber-700 dark:text-amber-400',
  2: 'bg-red-500/20 text-red-700 dark:text-red-400',
  3: 'bg-green-500/20 text-green-700 dark:text-green-400',
}

type ActionKind = 'confirm' | 'clear' | 'freeze' | 'unfreeze'

export function FraudReviewTab() {
  const [list, setList] = useState<FraudSuspect[]>([])
  const [loading, setLoading] = useState(false)
  const [target, setTarget] = useState<FraudSuspect | null>(null)
  const [action, setAction] = useState<ActionKind>('confirm')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await getFraudSuspects()
      if (res.success) {
        setList(res.data ?? [])
      } else {
        toast.error(res.message || '加载风控列表失败')
      }
    } catch {
      toast.error('加载风控列表失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const openAction = (s: FraudSuspect, a: ActionKind) => {
    setTarget(s)
    setAction(a)
    setReason('')
  }

  const submit = async () => {
    if (!target) return
    setSaving(true)
    try {
      let res
      if (action === 'confirm') {
        res = await reviewFraud(target.id, 2, reason)
      } else if (action === 'clear') {
        res = await reviewFraud(target.id, 3, reason)
      } else {
        res = await freezeAgent(target.id, action === 'freeze', reason)
      }
      if (res.success) {
        toast.success('已处理')
        setTarget(null)
        load()
      } else {
        toast.error(res.message || '处理失败')
      }
    } catch (e: any) {
      toast.error(e?.response?.data?.message || '处理失败')
    } finally {
      setSaving(false)
    }
  }

  const actionTitle: Record<ActionKind, string> = {
    confirm: '确认作弊',
    clear: '放行清白',
    freeze: '冻结账号',
    unfreeze: '解冻账号',
  }

  return (
    <div className='space-y-4'>
      <div className='flex items-center justify-between'>
        <p className='text-muted-foreground text-sm'>
          疑似自邀 / 异常注册的销售，共 {list.length} 条
        </p>
        <Button size='sm' variant='outline' onClick={load} disabled={loading}>
          <RefreshCw className={cn('mr-1 h-4 w-4', loading && 'animate-spin')} />
          刷新
        </Button>
      </div>

      <div className='rounded-lg border overflow-hidden'>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>用户</TableHead>
              <TableHead>邀请人</TableHead>
              <TableHead>注册 IP</TableHead>
              <TableHead>风控状态</TableHead>
              <TableHead className='text-right'>操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className='text-muted-foreground py-8 text-center text-sm'>
                  加载中…
                </TableCell>
              </TableRow>
            ) : list.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className='text-muted-foreground py-8 text-center text-sm'>
                  暂无疑似作弊用户
                </TableCell>
              </TableRow>
            ) : (
              list.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>
                    <div className='font-medium'>{s.username}</div>
                    <div className='text-muted-foreground text-xs'>
                      #{s.id} · {s.email}
                    </div>
                  </TableCell>
                  <TableCell className='text-sm'>
                    {s.inviter_id > 0 ? `#${s.inviter_id}` : '—'}
                  </TableCell>
                  <TableCell className='font-mono text-xs'>
                    {s.register_ip || '—'}
                  </TableCell>
                  <TableCell>
                    <Badge className={FLAG_CLASS[s.fraud_flag] ?? FLAG_CLASS[1]}>
                      {FLAG_LABEL[s.fraud_flag] ?? '疑似'}
                    </Badge>
                  </TableCell>
                  <TableCell className='text-right'>
                    <div className='flex justify-end gap-2'>
                      <Button
                        size='sm'
                        variant='outline'
                        className='gap-1'
                        onClick={() => openAction(s, 'clear')}
                      >
                        <ShieldCheck className='size-3 text-green-600' />
                        放行
                      </Button>
                      <Button
                        size='sm'
                        variant='outline'
                        className='gap-1'
                        onClick={() => openAction(s, 'confirm')}
                      >
                        <ShieldAlert className='size-3 text-red-600' />
                        确认作弊
                      </Button>
                      <Button
                        size='sm'
                        variant='outline'
                        className='gap-1'
                        onClick={() => openAction(s, 'freeze')}
                      >
                        <Snowflake className='size-3 text-blue-600' />
                        冻结
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!target} onOpenChange={(v) => !v && setTarget(null)}>
        <DialogContent className='sm:max-w-md'>
          <DialogHeader>
            <DialogTitle>{actionTitle[action]}</DialogTitle>
            <DialogDescription>
              {target && (
                <span>
                  目标用户 <b>{target.username}</b>（#{target.id}）·{' '}
                  {action === 'confirm'
                    ? '将标记为确认作弊，相关佣金需另行追回'
                    : action === 'clear'
                      ? '将标记为清白并恢复正常计佣'
                      : action === 'freeze'
                        ? '冻结后该销售将停止计佣 / 提现'
                        : '解冻后恢复计佣 / 提现'}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className='grid gap-1.5 py-2'>
            <Label htmlFor='fraud_reason'>原因 / 备注</Label>
            <Textarea
              id='fraud_reason'
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder='写明依据，写入审计日志'
            />
          </div>
          <DialogFooter>
            <Button variant='outline' onClick={() => setTarget(null)} disabled={saving}>
              取消
            </Button>
            <Button
              onClick={submit}
              disabled={saving}
              variant={
                action === 'confirm' || action === 'freeze'
                  ? 'destructive'
                  : 'default'
              }
            >
              {saving ? '提交中…' : `确认${actionTitle[action]}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
