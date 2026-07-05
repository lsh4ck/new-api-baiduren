import { useCallback, useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { getCommissionAudit } from '../api'
import type { CommissionAuditLog } from '../types'

const fmtUsd = (n: number) =>
  `${n < 0 ? '-' : ''}$${Math.abs(n).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  })}`

export function CommissionAuditTab() {
  const [list, setList] = useState<CommissionAuditLog[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const pageSize = 50

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await getCommissionAudit(page, pageSize)
      if (res.success) {
        setList(res.data ?? [])
        setTotal(res.total ?? 0)
      } else {
        toast.error(res.message || '加载审计日志失败')
      }
    } catch {
      toast.error('加载审计日志失败')
    } finally {
      setLoading(false)
    }
  }, [page])

  useEffect(() => {
    load()
  }, [load])

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div className='space-y-4'>
      <div className='flex items-center justify-between'>
        <p className='text-muted-foreground text-sm'>共 {total} 条审计记录</p>
        <Button size='sm' variant='outline' onClick={load} disabled={loading}>
          <RefreshCw className={cn('mr-1 h-4 w-4', loading && 'animate-spin')} />
          刷新
        </Button>
      </div>

      <div className='rounded-lg border overflow-hidden'>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>时间</TableHead>
              <TableHead>操作人</TableHead>
              <TableHead>动作</TableHead>
              <TableHead>目标销售</TableHead>
              <TableHead>账本 ID</TableHead>
              <TableHead className='text-right'>金额变动</TableHead>
              <TableHead>详情</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className='text-muted-foreground py-8 text-center text-sm'>
                  加载中…
                </TableCell>
              </TableRow>
            ) : list.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className='text-muted-foreground py-8 text-center text-sm'>
                  暂无审计日志
                </TableCell>
              </TableRow>
            ) : (
              list.map((row, idx) => (
                <TableRow key={`${row.created_at}-${idx}`}>
                  <TableCell className='text-muted-foreground text-xs whitespace-nowrap'>
                    {row.created_at > 0
                      ? format(new Date(row.created_at * 1000), 'yyyy-MM-dd HH:mm')
                      : '—'}
                  </TableCell>
                  <TableCell className='text-sm font-medium'>
                    {row.actor_name || '—'}
                  </TableCell>
                  <TableCell>
                    <Badge variant='outline'>{row.action}</Badge>
                  </TableCell>
                  <TableCell className='text-sm'>
                    {row.target_agent_id > 0 ? `#${row.target_agent_id}` : '—'}
                  </TableCell>
                  <TableCell className='text-sm tabular-nums'>
                    {row.ledger_id > 0 ? `#${row.ledger_id}` : '—'}
                  </TableCell>
                  <TableCell
                    className={cn(
                      'text-right font-semibold tabular-nums',
                      row.amount_delta < 0
                        ? 'text-red-600 dark:text-red-400'
                        : row.amount_delta > 0
                          ? 'text-green-600 dark:text-green-400'
                          : 'text-muted-foreground'
                    )}
                  >
                    {row.amount_delta !== 0 ? fmtUsd(row.amount_delta) : '—'}
                  </TableCell>
                  <TableCell className='text-muted-foreground max-w-xs truncate text-xs'>
                    {row.detail || '—'}
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
    </div>
  )
}
