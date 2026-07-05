import { useEffect, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { format } from 'date-fns'
import { Plus, Users, RefreshCw, CheckCircle, XCircle, Eye, Settings } from 'lucide-react'
import { toast } from 'sonner'
import { SectionPageLayout } from '@/components/layout'
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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import { getAgents, getWithdrawals } from './api'
import type { Agent, Withdrawal } from './types'
import { AddAgentDialog } from './components/add-agent-dialog'
import { SetAgentLevelDialog } from './components/set-agent-level-dialog'
import { AgentCustomersDrawer } from './components/agent-customers-drawer'
import { ProcessWithdrawalDialog } from './components/process-withdrawal-dialog'
import { ApplicationsTab } from './components/applications-tab'
import { CommissionLedgerTab } from './components/commission-ledger-tab'
import { FraudReviewTab } from './components/fraud-review-tab'
import { CommissionAuditTab } from './components/commission-audit-tab'
import { CommissionSettingsTab } from './components/commission-settings-tab'

function AgentLevelBadge({ level }: { level: number }) {
  const { t } = useTranslation()
  if (level === 3) return <Badge className='bg-purple-500/20 text-purple-700 dark:text-purple-400'>三级销售</Badge>
  if (level === 2) return <Badge className='bg-yellow-500/20 text-yellow-700 dark:text-yellow-400'>{t('Level 2')}</Badge>
  if (level === 1) return <Badge className='bg-blue-500/20 text-blue-700 dark:text-blue-400'>{t('Level 1')}</Badge>
  return <Badge variant='secondary'>{t('Not Agent')}</Badge>
}

// 销售业绩看板 Tab：展示每个销售的 1/2/3 级下属客户数 + 累计充值 + 估算佣金
type PerformanceRow = {
  agent_id: number
  username: string
  display_name: string
  email: string
  agent_level: number
  commission_rate: number
  l1_count: number
  l1_topup: number
  l2_count: number
  l2_topup: number
  l3_count: number
  l3_topup: number
  total_topup: number
  estimated_earn: number
  withdrawn: number
  available: number
}

function SalesPerformanceTab() {
  const [rows, setRows] = useState<PerformanceRow[]>([])
  const [loading, setLoading] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const apiMod = await import('@/lib/api').then((m) => m.api)
      const resPerf = await apiMod.get('/api/admin/agents/performance')
      if (resPerf.data?.success) setRows(resPerf.data.data ?? [])
    } catch (_e) {
      toast.error('加载销售业绩失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  return (
    <div>
      <div className='mb-2 flex items-center justify-between'>
        <p className='text-xs text-muted-foreground'>
          叠加全返：每级销售按自己档位率（1档5% / 2档3% / 3档3%）全额计佣 · 费率改这去「佣金设置」
        </p>
        <Button size='sm' variant='outline' onClick={fetchData} disabled={loading}>
          <RefreshCw className='mr-1 h-4 w-4' /> 刷新
        </Button>
      </div>
      <div className='rounded-md border'>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>销售</TableHead>
              <TableHead>等级</TableHead>
              <TableHead className='text-right'>佣金率</TableHead>
              <TableHead className='text-right'>L1 客户</TableHead>
              <TableHead className='text-right'>L1 充值¥</TableHead>
              <TableHead className='text-right'>L2 客户</TableHead>
              <TableHead className='text-right'>L2 充值¥</TableHead>
              <TableHead className='text-right'>L3 客户</TableHead>
              <TableHead className='text-right'>L3 充值¥</TableHead>
              <TableHead className='text-right'>下属总充值¥</TableHead>
              <TableHead className='text-right'>估算佣金¥</TableHead>
              <TableHead className='text-right'>已提¥</TableHead>
              <TableHead className='text-right'>可提¥</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={13} className='text-center text-muted-foreground'>
                  暂无销售数据
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.agent_id}>
                  <TableCell className='font-medium'>
                    {r.display_name || r.username}
                    <div className='text-xs text-muted-foreground'>{r.email}</div>
                  </TableCell>
                  <TableCell>
                    <AgentLevelBadge level={r.agent_level} />
                  </TableCell>
                  <TableCell className='text-right'>
                    {(r.commission_rate * 100).toFixed(1)}%
                  </TableCell>
                  <TableCell className='text-right'>{r.l1_count}</TableCell>
                  <TableCell className='text-right'>{r.l1_topup.toFixed(2)}</TableCell>
                  <TableCell className='text-right text-blue-600'>{r.l2_count}</TableCell>
                  <TableCell className='text-right text-blue-600'>{r.l2_topup.toFixed(2)}</TableCell>
                  <TableCell className='text-right text-purple-600'>{r.l3_count}</TableCell>
                  <TableCell className='text-right text-purple-600'>{r.l3_topup.toFixed(2)}</TableCell>
                  <TableCell className='text-right font-semibold'>{r.total_topup.toFixed(2)}</TableCell>
                  <TableCell className='text-right font-semibold text-green-600'>
                    {r.estimated_earn.toFixed(2)}
                  </TableCell>
                  <TableCell className='text-right'>{r.withdrawn.toFixed(2)}</TableCell>
                  <TableCell className='text-right font-semibold text-orange-600'>
                    {r.available.toFixed(2)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

function WithdrawalStatusBadge({ status }: { status: string }) {
  const { t } = useTranslation()
  if (status === 'approved') return <Badge className='bg-green-500/20 text-green-700 dark:text-green-400'>{t('Approved')}</Badge>
  if (status === 'rejected') return <Badge className='bg-red-500/20 text-red-700 dark:text-red-400'>{t('Rejected')}</Badge>
  return <Badge className='bg-orange-500/20 text-orange-700 dark:text-orange-400'>{t('Pending')}</Badge>
}

function AgentsTab() {
  const { t } = useTranslation()
  const [agents, setAgents] = useState<Agent[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [editAgent, setEditAgent] = useState<Agent | null>(null)
  const [viewAgent, setViewAgent] = useState<Agent | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await getAgents()
      setAgents(res.data || [])
      setTotal(res.total || 0)
    } catch {
      toast.error(t('Failed to load agents'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => { load() }, [load])

  return (
    <div className='space-y-4'>
      <div className='flex items-center justify-between'>
        <p className='text-muted-foreground text-sm'>{t('Total agents')}: {total}</p>
        <div className='flex gap-2'>
          <Button variant='outline' size='sm' onClick={load} disabled={loading}>
            <RefreshCw className={`mr-1 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            {t('Refresh')}
          </Button>
          <Button size='sm' onClick={() => setAddOpen(true)}>
            <Plus className='mr-1 h-4 w-4' />
            {t('Add Agent')}
          </Button>
        </div>
      </div>

      <div className='rounded-lg border'>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('User')}</TableHead>
              <TableHead>{t('Level')}</TableHead>
              <TableHead className='text-right'>{t('Commission')}</TableHead>
              <TableHead className='text-right'>{t('Customers')}</TableHead>
              <TableHead className='text-right'>{t('Total Topup (¥)')}</TableHead>
              <TableHead className='text-right'>{t('Available (¥)')}</TableHead>
              <TableHead className='text-right'>{t('Actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className='text-muted-foreground py-8 text-center text-sm'>
                  {t('Loading...')}
                </TableCell>
              </TableRow>
            ) : agents.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className='text-muted-foreground py-8 text-center text-sm'>
                  {t('No agents yet. Click Add Agent to get started.')}
                </TableCell>
              </TableRow>
            ) : (
              agents.map((a) => (
                <TableRow key={a.id}>
                  <TableCell>
                    <div>
                      <p className='font-medium'>{a.username}</p>
                      <p className='text-muted-foreground text-xs'>{a.email}</p>
                    </div>
                  </TableCell>
                  <TableCell><AgentLevelBadge level={a.agent_level} /></TableCell>
                  <TableCell className='text-right font-mono'>
                    {(a.commission_rate * 100).toFixed(1)}%
                  </TableCell>
                  <TableCell className='text-right'>
                    <span className='flex items-center justify-end gap-1'>
                      <Users className='h-3 w-3' />
                      {a.customer_count}
                    </span>
                  </TableCell>
                  <TableCell className='text-right font-mono'>
                    ¥{a.total_topup_money.toFixed(2)}
                  </TableCell>
                  <TableCell className='text-right font-mono font-semibold'>
                    ¥{a.available_balance.toFixed(2)}
                  </TableCell>
                  <TableCell className='text-right'>
                    <div className='flex items-center justify-end gap-1'>
                      <Button variant='ghost' size='icon' title={t('View Customers')} onClick={() => setViewAgent(a)}>
                        <Eye className='h-4 w-4' />
                      </Button>
                      <Button variant='ghost' size='icon' title={t('Set Level')} onClick={() => setEditAgent(a)}>
                        <Settings className='h-4 w-4' />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <AddAgentDialog open={addOpen} onClose={() => setAddOpen(false)} onSuccess={load} />
      <SetAgentLevelDialog
        agent={editAgent}
        open={Boolean(editAgent)}
        onClose={() => setEditAgent(null)}
        onSuccess={load}
      />
      <AgentCustomersDrawer
        agent={viewAgent}
        open={Boolean(viewAgent)}
        onClose={() => setViewAgent(null)}
      />
    </div>
  )
}

function WithdrawalsTab() {
  const { t } = useTranslation()
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [statusFilter, setStatusFilter] = useState('')
  const [processTarget, setProcessTarget] = useState<{ w: Withdrawal; action: 'approved' | 'rejected' } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await getWithdrawals(1, 50, statusFilter)
      setWithdrawals(res.data || [])
      setTotal(res.total || 0)
    } catch {
      toast.error(t('Failed to load withdrawals'))
    } finally {
      setLoading(false)
    }
  }, [statusFilter, t])

  useEffect(() => { load() }, [load])

  return (
    <div className='space-y-4'>
      <div className='flex items-center justify-between'>
        <div className='flex gap-2'>
          {(['', 'pending', 'approved', 'rejected'] as const).map((s) => (
            <Button
              key={s}
              variant={statusFilter === s ? 'default' : 'outline'}
              size='sm'
              onClick={() => setStatusFilter(s)}
            >
              {s === '' ? t('All') : s === 'pending' ? t('Pending') : s === 'approved' ? t('Approved') : t('Rejected')}
            </Button>
          ))}
        </div>
        <div className='flex items-center gap-2'>
          <p className='text-muted-foreground text-sm'>{t('Total')}: {total}</p>
          <Button variant='outline' size='sm' onClick={load} disabled={loading}>
            <RefreshCw className={`mr-1 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            {t('Refresh')}
          </Button>
        </div>
      </div>

      <div className='rounded-lg border'>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('Agent')}</TableHead>
              <TableHead className='text-right'>{t('Amount (¥)')}</TableHead>
              <TableHead>{t('Status')}</TableHead>
              <TableHead>{t('Note')}</TableHead>
              <TableHead>{t('Admin Remark')}</TableHead>
              <TableHead>{t('Submitted')}</TableHead>
              <TableHead className='text-right'>{t('Actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className='text-muted-foreground py-8 text-center text-sm'>
                  {t('Loading...')}
                </TableCell>
              </TableRow>
            ) : withdrawals.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className='text-muted-foreground py-8 text-center text-sm'>
                  {t('No withdrawal requests')}
                </TableCell>
              </TableRow>
            ) : (
              withdrawals.map((w) => (
                <TableRow key={w.id}>
                  <TableCell>
                    <p className='font-medium'>{w.agent_name}</p>
                    <p className='text-muted-foreground text-xs'>{w.agent_email}</p>
                  </TableCell>
                  <TableCell className='text-right font-mono font-semibold'>
                    ¥{w.amount.toFixed(2)}
                  </TableCell>
                  <TableCell><WithdrawalStatusBadge status={w.status} /></TableCell>
                  <TableCell className='max-w-32 truncate text-sm'>{w.remark || '—'}</TableCell>
                  <TableCell className='max-w-32 truncate text-sm'>{w.admin_remark || '—'}</TableCell>
                  <TableCell className='text-muted-foreground text-xs'>
                    {format(new Date(w.created_at * 1000), 'MM-dd HH:mm')}
                  </TableCell>
                  <TableCell className='text-right'>
                    {w.status === 'pending' && (
                      <div className='flex items-center justify-end gap-1'>
                        <Button
                          variant='ghost'
                          size='icon'
                          className='text-green-600 hover:text-green-700'
                          title={t('Approve')}
                          onClick={() => setProcessTarget({ w, action: 'approved' })}
                        >
                          <CheckCircle className='h-4 w-4' />
                        </Button>
                        <Button
                          variant='ghost'
                          size='icon'
                          className='text-red-600 hover:text-red-700'
                          title={t('Reject')}
                          onClick={() => setProcessTarget({ w, action: 'rejected' })}
                        >
                          <XCircle className='h-4 w-4' />
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <ProcessWithdrawalDialog
        withdrawal={processTarget?.w || null}
        action={processTarget?.action || null}
        open={Boolean(processTarget)}
        onClose={() => setProcessTarget(null)}
        onSuccess={load}
      />
    </div>
  )
}

export function AgentManagement() {
  const { t } = useTranslation()

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>{t('Agent Management')}</SectionPageLayout.Title>
      <SectionPageLayout.Description>
        {t('Manage sales agents, commission rates, and withdrawal requests')}
      </SectionPageLayout.Description>
      <SectionPageLayout.Content>
        <Tabs defaultValue='agents'>
          <TabsList className='mb-4'>
            <TabsTrigger value='agents'>{t('Agents')}</TabsTrigger>
            <TabsTrigger value='applications'>申请审批</TabsTrigger>
            <TabsTrigger value='settings'>佣金设置</TabsTrigger>
            <TabsTrigger value='performance'>销售业绩（1/2/3 级）</TabsTrigger>
            <TabsTrigger value='ledger'>佣金账本</TabsTrigger>
            <TabsTrigger value='fraud'>风控审核</TabsTrigger>
            <TabsTrigger value='audit'>审计日志</TabsTrigger>
            <TabsTrigger value='withdrawals'>{t('Withdrawals')}</TabsTrigger>
          </TabsList>
          <TabsContent value='agents'>
            <AgentsTab />
          </TabsContent>
          <TabsContent value='applications'>
            <ApplicationsTab />
          </TabsContent>
          <TabsContent value='settings'>
            <CommissionSettingsTab />
          </TabsContent>
          <TabsContent value='performance'>
            <SalesPerformanceTab />
          </TabsContent>
          <TabsContent value='ledger'>
            <CommissionLedgerTab />
          </TabsContent>
          <TabsContent value='fraud'>
            <FraudReviewTab />
          </TabsContent>
          <TabsContent value='audit'>
            <CommissionAuditTab />
          </TabsContent>
          <TabsContent value='withdrawals'>
            <WithdrawalsTab />
          </TabsContent>
        </Tabs>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
