import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { formatDistanceToNow } from 'date-fns'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { getAgentCustomers, getAgentStats } from '../api'
import type { Agent, AgentCustomer, AgentStats } from '../types'

type Props = {
  agent: Agent | null
  open: boolean
  onClose: () => void
}

export function AgentCustomersDrawer({ agent, open, onClose }: Props) {
  const { t } = useTranslation()
  const [customers, setCustomers] = useState<AgentCustomer[]>([])
  const [stats, setStats] = useState<AgentStats | null>(null)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open || !agent) return
    setLoading(true)
    Promise.all([
      getAgentCustomers(agent.id),
      getAgentStats(agent.id),
    ]).then(([custRes, statsRes]) => {
      setCustomers(custRes.data || [])
      setTotal(custRes.total || 0)
      setStats(statsRes.data || null)
    }).finally(() => setLoading(false))
  }, [open, agent])

  const levelLabel = (level: number) => {
    if (level === 1) return t('Level 1 Agent')
    if (level === 2) return t('Level 2 Agent')
    return t('Not Agent')
  }

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className='flex h-dvh w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl'>
        <SheetHeader className='border-b px-6 py-4'>
          <SheetTitle>
            {agent?.username} — {t('Agent Details')}
          </SheetTitle>
          <SheetDescription>
            {levelLabel(agent?.agent_level ?? 0)} · {t('Commission Rate')}: {((agent?.commission_rate ?? 0) * 100).toFixed(1)}%
          </SheetDescription>
        </SheetHeader>

        {stats && (
          <div className='grid grid-cols-2 gap-3 border-b p-6 sm:grid-cols-4'>
            <StatCard label={t('Customers')} value={String(stats.customer_count)} />
            <StatCard label={t('Total Topup')} value={`¥${stats.total_topup_money.toFixed(2)}`} />
            <StatCard label={t('Total Earned')} value={`¥${stats.total_earned.toFixed(2)}`} />
            <StatCard label={t('Available')} value={`¥${stats.available_balance.toFixed(2)}`} />
          </div>
        )}

        <div className='flex-1 overflow-y-auto p-6'>
          <p className='text-muted-foreground mb-3 text-sm'>
            {t('Total customers')}: {total}
          </p>
          {loading ? (
            <p className='text-muted-foreground text-sm'>{t('Loading...')}</p>
          ) : customers.length === 0 ? (
            <p className='text-muted-foreground text-sm'>{t('No customers yet')}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('Username')}</TableHead>
                  <TableHead className='text-right'>{t('Topup (¥)')}</TableHead>
                  <TableHead className='text-right'>{t('Joined')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customers.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <span className='font-medium'>{c.username}</span>
                      {c.display_name && c.display_name !== c.username && (
                        <span className='text-muted-foreground ml-1 text-xs'>({c.display_name})</span>
                      )}
                    </TableCell>
                    <TableCell className='text-right font-mono'>
                      ¥{c.total_topup_money.toFixed(2)}
                    </TableCell>
                    <TableCell className='text-muted-foreground text-right text-xs'>
                      {formatDistanceToNow(new Date(c.created_at * 1000), { addSuffix: true })}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className='card-glass rounded-lg p-3'>
      <p className='text-muted-foreground text-xs'>{label}</p>
      <p className='mt-1 text-base font-semibold'>{value}</p>
    </div>
  )
}
