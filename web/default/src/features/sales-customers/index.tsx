import { useEffect, useState } from 'react'
import {
  Megaphone,
  RefreshCw,
  TrendingUp,
  Wallet,
  Users,
  Network,
  Check,
  X,
  Clock,
  CheckCircle2,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '@/stores/auth-store'
import { SectionPageLayout } from '@/components/layout'
import { ReferralBox } from '@/components/referral-box'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { api } from '@/lib/api'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

type DownlineApplication = {
  id: number
  user_id: number
  user_name: string
  user_email: string
  user_display_name: string
  proposed_level: number
  real_name: string
  phone: string
  wechat_id: string
  sales_channel: string
  reason: string
  status: 'pending' | 'approved' | 'rejected'
  admin_remark: string
  created_at: number
}

type SelfInfo = {
  agent_level: number
  is_sales: boolean
  commission_rate: number
  aff_code: string
  l1_count: number
  l1_topup: number
  l2_count: number
  l2_topup: number
  l3_count: number
  l3_topup: number
  customer_count: number
  total_topup_money: number
  total_earned: number
  total_withdrawn: number
  available_balance: number
  ledger_pending: number
  ledger_approved: number
  ledger_paid: number
  estimated_earned: number
  ledger_read: boolean
}

type CommissionStatus =
  | 'pending'
  | 'approved'
  | 'paid'
  | 'clawback'
  | 'voided'

type CommissionSourceType = 'topup' | 'consume' | 'manual' | 'clawback_entry'

type CommissionLedger = {
  id: number
  agent_id: number
  customer_id: number
  level: number
  source_type: CommissionSourceType
  source_id: number
  base_amount: number
  rate: number
  amount: number
  status: CommissionStatus
  lock_until: number
  approved_at: number
  paid_at: number
  created_at: number
  remark: string
}

const LEDGER_STATUS_CLASS: Record<CommissionStatus, string> = {
  pending: 'bg-gray-500/20 text-gray-700 dark:text-gray-400',
  approved: 'bg-green-500/20 text-green-700 dark:text-green-400',
  paid: 'bg-blue-500/20 text-blue-700 dark:text-blue-400',
  clawback: 'bg-red-500/20 text-red-700 dark:text-red-400',
  voided: 'bg-gray-500/20 text-gray-500 dark:text-gray-500',
}
const LEDGER_STATUS_LABEL: Record<CommissionStatus, string> = {
  pending: '锁定中',
  approved: '可提现',
  paid: '已提现',
  clawback: '已追回',
  voided: '已作废',
}
const LEDGER_SOURCE_LABEL: Record<CommissionSourceType, string> = {
  topup: '充值',
  consume: '消费',
  manual: '手动补单',
  clawback_entry: '追回冲账',
}

const fmtUsd = (n: number) =>
  `$${n.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  })}`

const TIER_META: Record<
  number,
  { label: string; rate: number; badgeClass: string }
> = {
  1: {
    label: '一级销售 (L1)',
    rate: 0.05,
    badgeClass: 'bg-blue-500/20 text-blue-700 dark:text-blue-400',
  },
  2: {
    label: '二级销售 (L2)',
    rate: 0.03,
    badgeClass: 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-400',
  },
  3: {
    label: '三级销售 (L3)',
    rate: 0.03,
    badgeClass: 'bg-purple-500/20 text-purple-700 dark:text-purple-400',
  },
}

const fmtMoney = (n: number) =>
  n.toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })

function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  accent,
}: {
  label: string
  value: string
  hint?: string
  icon?: React.ComponentType<{ className?: string }>
  accent?: 'green' | 'amber' | 'default'
}) {
  const valueColor =
    accent === 'green'
      ? 'text-green-600 dark:text-green-400'
      : accent === 'amber'
        ? 'text-amber-600 dark:text-amber-400'
        : ''
  return (
    <div className='px-4 py-3.5 sm:px-5 sm:py-4'>
      <div className='text-muted-foreground flex items-center gap-1.5 text-xs'>
        {Icon && <Icon className='size-3.5' />}
        {label}
      </div>
      <div className={cn('mt-1 text-2xl font-semibold tabular-nums', valueColor)}>
        {value}
      </div>
      {hint && (
        <div className='text-muted-foreground mt-1 text-xs'>{hint}</div>
      )}
    </div>
  )
}

function PanelHeader({
  title,
  description,
  actions,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
}) {
  return (
    <div className='flex items-start justify-between gap-2 border-b px-4 py-3 sm:px-5'>
      <div className='flex flex-col gap-1'>
        <div className='text-sm font-semibold'>{title}</div>
        {description && (
          <div className='text-muted-foreground text-xs'>{description}</div>
        )}
      </div>
      {actions}
    </div>
  )
}

function Panel({
  title,
  description,
  actions,
  children,
  contentClassName,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  children: React.ReactNode
  contentClassName?: string
}) {
  return (
    <div className='overflow-hidden rounded-2xl border bg-card shadow-xs'>
      <PanelHeader title={title} description={description} actions={actions} />
      <div className={cn('p-4 sm:p-5', contentClassName)}>{children}</div>
    </div>
  )
}

function CommissionLedgerSelfTab() {
  const [list, setList] = useState<CommissionLedger[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [statusFilter, setStatusFilter] = useState('all')
  const [page, setPage] = useState(1)
  const pageSize = 20

  const load = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (statusFilter !== 'all') params.set('status', statusFilter)
      params.set('page', String(page))
      params.set('page_size', String(pageSize))
      const res = await api.get(`/api/user/agent/ledger?${params.toString()}`)
      if (res.data?.success) {
        setList(res.data.data?.items ?? [])
        setTotal(res.data.data?.total ?? 0)
      } else {
        toast.error(res.data?.message || '加载佣金明细失败')
      }
    } catch (_e) {
      toast.error('加载佣金明细失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, page])

  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const fmtTs = (ts: number) =>
    ts > 0
      ? new Date(ts * 1000).toLocaleString('zh-CN', { hour12: false })
      : '—'

  return (
    <Panel
      title='佣金明细'
      description='每一笔佣金的来源、费率、金额与结算状态（金额单位美元）'
      actions={
        <div className='flex items-center gap-2'>
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
          <Button size='sm' variant='outline' onClick={load} disabled={loading}>
            <RefreshCw className={cn('mr-1 size-4', loading && 'animate-spin')} />
            刷新
          </Button>
        </div>
      }
    >
      <div className='rounded-lg border overflow-hidden'>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>时间</TableHead>
              <TableHead>客户</TableHead>
              <TableHead>层级</TableHead>
              <TableHead>来源</TableHead>
              <TableHead className='text-right'>基数</TableHead>
              <TableHead className='text-right'>费率</TableHead>
              <TableHead className='text-right'>金额</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>锁定到期</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={9} className='text-muted-foreground py-8 text-center text-sm'>
                  加载中…
                </TableCell>
              </TableRow>
            ) : list.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className='text-muted-foreground py-8 text-center text-sm'>
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
                    {row.customer_id > 0 ? `#${row.customer_id}` : '—'}
                  </TableCell>
                  <TableCell>
                    <Badge variant='outline'>L{row.level}</Badge>
                  </TableCell>
                  <TableCell className='text-sm'>
                    {LEDGER_SOURCE_LABEL[row.source_type] ?? row.source_type}
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
                    <Badge
                      className={
                        LEDGER_STATUS_CLASS[row.status] ??
                        'bg-gray-500/20 text-gray-700'
                      }
                    >
                      {LEDGER_STATUS_LABEL[row.status] ?? row.status}
                    </Badge>
                  </TableCell>
                  <TableCell className='text-muted-foreground text-xs whitespace-nowrap'>
                    {row.status === 'pending' ? fmtTs(row.lock_until) : '—'}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className='mt-3 flex items-center justify-end gap-2'>
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
    </Panel>
  )
}

export function SalesCustomersPage() {
  const { t } = useTranslation()
  const { auth } = useAuthStore()
  const affCode = auth?.user?.aff_code ?? ''
  const [info, setInfo] = useState<SelfInfo | null>(null)
  const [loading, setLoading] = useState(false)
  const [downlineApps, setDownlineApps] = useState<DownlineApplication[]>([])
  const [reviewing, setReviewing] = useState<DownlineApplication | null>(null)
  const [reviewAction, setReviewAction] = useState<'approve' | 'reject'>(
    'approve'
  )
  const [reviewRemark, setReviewRemark] = useState('')
  const [submittingReview, setSubmittingReview] = useState(false)

  const fetchInfo = async () => {
    setLoading(true)
    try {
      const res = await api.get('/api/user/agent/info')
      if (res.data?.success) setInfo(res.data.data as SelfInfo)
    } catch (_e) {
      toast.error('加载推广数据失败')
    } finally {
      setLoading(false)
    }
  }

  const fetchDownlineApps = async () => {
    try {
      const res = await api.get(
        '/api/user/agent/downline-applications?status=pending'
      )
      if (res.data?.success) setDownlineApps(res.data.data ?? [])
    } catch (_e) {
      // 静默
    }
  }

  const submitDownlineReview = async () => {
    if (!reviewing) return
    setSubmittingReview(true)
    try {
      const res = await api.post(
        `/api/agent/applications/${reviewing.id}/review`,
        { action: reviewAction, admin_remark: reviewRemark, override_level: 0 }
      )
      if (res.data?.success) {
        toast.success(reviewAction === 'approve' ? '已通过' : '已拒绝')
        setReviewing(null)
        fetchDownlineApps()
      } else {
        toast.error(res.data?.message || '审批失败')
      }
    } catch (e: any) {
      toast.error(e?.response?.data?.message || '审批失败')
    } finally {
      setSubmittingReview(false)
    }
  }

  useEffect(() => {
    fetchInfo()
    fetchDownlineApps()
  }, [])

  const level = (info?.agent_level ?? 0) as 0 | 1 | 2 | 3
  const tierMeta = level > 0 ? TIER_META[level] : null
  const selfRate =
    info?.commission_rate && info.commission_rate > 0
      ? info.commission_rate
      : (tierMeta?.rate ?? 0)
  const upperRate = 0.01

  const myDirectEarning = (info?.l1_topup ?? 0) * selfRate
  const passThroughEarning =
    ((info?.l2_topup ?? 0) + (info?.l3_topup ?? 0)) * upperRate

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>
        <span className='flex items-center gap-2'>
          <Megaphone className='size-5 text-amber-500' />
          {t('推广中心')}
        </span>
      </SectionPageLayout.Title>
      <SectionPageLayout.Description>
        查看你的销售身份、佣金累计、下属业绩；分享专属推广链接发展下线
      </SectionPageLayout.Description>
      <SectionPageLayout.Actions>
        <Button
          size='sm'
          variant='outline'
          onClick={fetchInfo}
          disabled={loading}
        >
          <RefreshCw className={cn('mr-2 size-4', loading && 'animate-spin')} />
          刷新
        </Button>
      </SectionPageLayout.Actions>
      <SectionPageLayout.Content>
        <Tabs defaultValue='dashboard' className='space-y-5'>
          <TabsList>
            <TabsTrigger value='dashboard'>业绩看板</TabsTrigger>
            <TabsTrigger value='ledger'>佣金明细</TabsTrigger>
            <TabsTrigger value='share'>推广链接 / 二维码</TabsTrigger>
          </TabsList>

          <TabsContent value='dashboard' className='space-y-5'>
            {/* 身份卡 + 佣金率说明 */}
            <Panel
              title={
                <span className='flex items-center gap-2'>
                  <Network className='size-4' />
                  我的销售身份
                </span>
              }
              description='佣金率与提成机制说明'
            >
              {info ? (
                <div className='grid gap-5 md:grid-cols-[1.4fr_1fr]'>
                  <div className='space-y-3'>
                    <div className='flex items-center gap-2'>
                      {tierMeta ? (
                        <Badge className={cn(tierMeta.badgeClass, 'text-sm')}>
                          {tierMeta.label}
                        </Badge>
                      ) : (
                        <Badge variant='secondary'>暂无销售身份</Badge>
                      )}
                      {info.is_sales && level === 0 && (
                        <Badge className='bg-amber-500/20 text-amber-700 dark:text-amber-400'>
                          销售待激活
                        </Badge>
                      )}
                    </div>
                    <div className='text-muted-foreground text-sm leading-relaxed'>
                      <div>
                        我直接客户充值我抽{' '}
                        <span className='text-foreground font-semibold tabular-nums'>
                          {(selfRate * 100).toFixed(1)}%
                        </span>
                      </div>
                      <div>
                        我下级销售带的客户充值我穿透抽{' '}
                        <span className='text-foreground font-semibold tabular-nums'>
                          {(upperRate * 100).toFixed(1)}%
                        </span>
                        （含 0.5% 抽下级 + 0.5% 平台补贴我）
                      </div>
                      {level > 1 && (
                        <div className='text-amber-700 dark:text-amber-400'>
                          ⚠ 你的上级从你的客户充值里穿透抽 1%
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className='text-muted-foreground text-sm'>
                  {loading ? '加载中…' : '暂无身份数据'}
                </div>
              )}
            </Panel>

            {/* 佣金概览 stat 网格 */}
            {info && (
              <Panel title='佣金账户'>
                <div className='divide-border/60 -mx-4 -my-4 grid grid-cols-2 divide-x divide-y sm:-mx-5 sm:-my-5 sm:grid-cols-4'>
                  <StatCard
                    label='累计已结'
                    value={`¥${fmtMoney(info.total_earned)}`}
                    icon={TrendingUp}
                  />
                  <StatCard
                    label='已提取'
                    value={`¥${fmtMoney(info.total_withdrawn)}`}
                    accent='amber'
                  />
                  <StatCard
                    label='可提余额'
                    value={`¥${fmtMoney(info.available_balance)}`}
                    icon={Wallet}
                    accent='green'
                  />
                  <StatCard
                    label='下属总数'
                    value={`${info.l1_count + info.l2_count + info.l3_count}`}
                    hint={`L1 ${info.l1_count} · L2 ${info.l2_count} · L3 ${info.l3_count}`}
                    icon={Users}
                  />
                </div>
              </Panel>
            )}

            {/* 佣金账本三态（美元） */}
            {info && (
              <Panel
                title='佣金账本（按结算状态）'
                description='以实际入账为准的佣金状态；锁定中佣金到期后转为可提现。金额单位美元'
              >
                <div className='divide-border/60 -mx-4 -my-4 grid grid-cols-1 divide-x divide-y sm:-mx-5 sm:-my-5 sm:grid-cols-3'>
                  <StatCard
                    label='锁定中（pending）'
                    value={fmtUsd(info.ledger_pending)}
                    hint='尚在锁定期，到期后转可提现'
                    icon={Clock}
                    accent='amber'
                  />
                  <StatCard
                    label='可提现（approved）'
                    value={fmtUsd(info.ledger_approved)}
                    hint='已锁定到期，可发起提现'
                    icon={Wallet}
                    accent='green'
                  />
                  <StatCard
                    label='已提现（paid）'
                    value={fmtUsd(info.ledger_paid)}
                    hint='历史累计已发放'
                    icon={CheckCircle2}
                  />
                </div>
                <div className='text-muted-foreground mt-3 text-xs'>
                  实时估算佣金（对账参考）：
                  <span className='text-foreground font-semibold tabular-nums'>
                    {fmtUsd(info.estimated_earned)}
                  </span>
                </div>
              </Panel>
            )}

            {/* 业绩拆分：我直接 vs 穿透抽 */}
            {info && (
              <Panel title='本期业绩（按佣金来源拆分）'>
                <div className='grid gap-4 md:grid-cols-2'>
                  <div className='bg-muted/30 rounded-xl border p-4'>
                    <div className='text-muted-foreground text-xs'>
                      我直接客户的提成
                    </div>
                    <div className='mt-1 text-2xl font-semibold tabular-nums text-green-600 dark:text-green-400'>
                      ¥{fmtMoney(myDirectEarning)}
                    </div>
                    <div className='text-muted-foreground mt-1 text-xs'>
                      {(selfRate * 100).toFixed(1)}% × ¥
                      {fmtMoney(info.l1_topup)} 充值（{info.l1_count} 人）
                    </div>
                  </div>
                  <div className='bg-muted/30 rounded-xl border p-4'>
                    <div className='text-muted-foreground text-xs'>
                      下级销售客户的穿透抽成
                    </div>
                    <div className='mt-1 text-2xl font-semibold tabular-nums text-green-600 dark:text-green-400'>
                      ¥{fmtMoney(passThroughEarning)}
                    </div>
                    <div className='text-muted-foreground mt-1 text-xs'>
                      {(upperRate * 100).toFixed(1)}% × ¥
                      {fmtMoney(info.l2_topup + info.l3_topup)} 充值（L2 +
                      L3 共 {info.l2_count + info.l3_count} 人下属）
                    </div>
                  </div>
                </div>
              </Panel>
            )}

            {/* 三级明细表 */}
            {info && info.l1_count + info.l2_count + info.l3_count > 0 && (
              <Panel
                title='下属层级明细'
                description='按层级展示每个等级带来的充值与佣金贡献'
              >
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>层级</TableHead>
                      <TableHead>说明</TableHead>
                      <TableHead className='text-right'>人数</TableHead>
                      <TableHead className='text-right'>累计充值</TableHead>
                      <TableHead className='text-right'>抽成率</TableHead>
                      <TableHead className='text-right'>我的提成</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {info.l1_count > 0 && (
                      <TableRow>
                        <TableCell>
                          <Badge variant='outline'>L1 直接</Badge>
                        </TableCell>
                        <TableCell className='text-muted-foreground text-xs'>
                          我直接邀请的客户
                        </TableCell>
                        <TableCell className='text-right tabular-nums'>
                          {info.l1_count}
                        </TableCell>
                        <TableCell className='text-right tabular-nums'>
                          ¥{fmtMoney(info.l1_topup)}
                        </TableCell>
                        <TableCell className='text-right tabular-nums'>
                          {(selfRate * 100).toFixed(1)}%
                        </TableCell>
                        <TableCell className='text-right font-semibold tabular-nums text-green-600 dark:text-green-400'>
                          ¥{fmtMoney(info.l1_topup * selfRate)}
                        </TableCell>
                      </TableRow>
                    )}
                    {info.l2_count > 0 && (
                      <TableRow>
                        <TableCell>
                          <Badge variant='outline'>L2 二跳</Badge>
                        </TableCell>
                        <TableCell className='text-muted-foreground text-xs'>
                          直接销售下属带的客户
                        </TableCell>
                        <TableCell className='text-right tabular-nums'>
                          {info.l2_count}
                        </TableCell>
                        <TableCell className='text-right tabular-nums'>
                          ¥{fmtMoney(info.l2_topup)}
                        </TableCell>
                        <TableCell className='text-right tabular-nums'>
                          {(upperRate * 100).toFixed(1)}%
                        </TableCell>
                        <TableCell className='text-right font-semibold tabular-nums text-green-600 dark:text-green-400'>
                          ¥{fmtMoney(info.l2_topup * upperRate)}
                        </TableCell>
                      </TableRow>
                    )}
                    {info.l3_count > 0 && (
                      <TableRow>
                        <TableCell>
                          <Badge variant='outline'>L3 三跳</Badge>
                        </TableCell>
                        <TableCell className='text-muted-foreground text-xs'>
                          二级销售下属带的客户
                        </TableCell>
                        <TableCell className='text-right tabular-nums'>
                          {info.l3_count}
                        </TableCell>
                        <TableCell className='text-right tabular-nums'>
                          ¥{fmtMoney(info.l3_topup)}
                        </TableCell>
                        <TableCell className='text-right tabular-nums'>
                          {(upperRate * 100).toFixed(1)}%
                        </TableCell>
                        <TableCell className='text-right font-semibold tabular-nums text-green-600 dark:text-green-400'>
                          ¥{fmtMoney(info.l3_topup * upperRate)}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
                <div className='text-muted-foreground mt-3 text-right text-xs tabular-nums'>
                  合计预估佣金 ¥
                  {fmtMoney(myDirectEarning + passThroughEarning)}
                </div>
              </Panel>
            )}

            {/* 我下属的待审批申请（双向可见：admin + 直接 inviter）*/}
            {downlineApps.length > 0 && (
              <Panel
                title={
                  <span className='flex items-center gap-2'>
                    <Users className='size-4 text-amber-500' />
                    我下属的销售身份申请
                  </span>
                }
                description='你邀请的客户申请了销售身份，你可以审批通过或拒绝'
              >
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>申请人</TableHead>
                      <TableHead>姓名 / 手机</TableHead>
                      <TableHead>主推平台</TableHead>
                      <TableHead>预计 Level</TableHead>
                      <TableHead>提交时间</TableHead>
                      <TableHead className='text-right'>操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {downlineApps.map((app) => (
                      <TableRow key={app.id}>
                        <TableCell>
                          <div className='font-medium'>{app.user_name}</div>
                          <div className='text-muted-foreground text-xs'>
                            {app.user_email}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className='text-sm'>{app.real_name}</div>
                          <div className='text-muted-foreground text-xs'>
                            {app.phone}
                            {app.wechat_id && ` · ${app.wechat_id}`}
                          </div>
                        </TableCell>
                        <TableCell className='text-sm'>
                          {app.sales_channel || '—'}
                        </TableCell>
                        <TableCell>
                          <Badge variant='outline'>L{app.proposed_level}</Badge>
                        </TableCell>
                        <TableCell className='text-muted-foreground text-xs'>
                          {new Date(app.created_at * 1000).toLocaleString(
                            'zh-CN',
                            { hour12: false }
                          )}
                        </TableCell>
                        <TableCell className='text-right'>
                          <div className='flex justify-end gap-2'>
                            <Button
                              size='sm'
                              variant='outline'
                              onClick={() => {
                                setReviewing(app)
                                setReviewAction('approve')
                                setReviewRemark('')
                              }}
                              className='gap-1'
                            >
                              <Check className='size-3 text-green-600' /> 通过
                            </Button>
                            <Button
                              size='sm'
                              variant='outline'
                              onClick={() => {
                                setReviewing(app)
                                setReviewAction('reject')
                                setReviewRemark('')
                              }}
                              className='gap-1'
                            >
                              <X className='size-3 text-red-600' /> 拒绝
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Panel>
            )}

            {!info && !loading && (
              <Alert>
                <AlertDescription>暂无业绩数据</AlertDescription>
              </Alert>
            )}
          </TabsContent>

          <TabsContent value='ledger'>
            <CommissionLedgerSelfTab />
          </TabsContent>

          <TabsContent value='share'>
            {!affCode ? (
              <Alert>
                <AlertDescription>
                  {t(
                    '未获取到你的推广码，请刷新页面或重新登录后再试。'
                  )}
                </AlertDescription>
              </Alert>
            ) : (
              <ReferralBox
                code={affCode}
                title={t('我的专属推广链接')}
                description={t(
                  '把下面的链接或二维码发给朋友，他/她注册成功后自动归属到你名下。'
                )}
                defaultStealth
              />
            )}
          </TabsContent>
        </Tabs>

        {/* 下属申请审批弹窗 */}
        <Dialog
          open={!!reviewing}
          onOpenChange={(open) => !open && setReviewing(null)}
        >
          <DialogContent className='sm:max-w-md'>
            <DialogHeader>
              <DialogTitle>
                {reviewAction === 'approve' ? '通过申请' : '拒绝申请'}
              </DialogTitle>
              <DialogDescription>
                {reviewing && (
                  <span>
                    申请人 <b>{reviewing.user_name}</b>（{reviewing.real_name}） · 预计{' '}
                    <Badge variant='outline' className='ml-1'>
                      L{reviewing.proposed_level}
                    </Badge>
                  </span>
                )}
              </DialogDescription>
            </DialogHeader>

            {reviewing?.reason && (
              <div className='bg-muted/40 rounded-md border p-3 text-sm'>
                <div className='text-muted-foreground mb-1 text-xs'>
                  申请话术
                </div>
                <div className='whitespace-pre-wrap'>{reviewing.reason}</div>
              </div>
            )}

            <div className='grid gap-1.5'>
              <Label htmlFor='review_remark'>
                {reviewAction === 'reject' ? '拒绝原因' : '备注（可选）'}
              </Label>
              <Textarea
                id='review_remark'
                value={reviewRemark}
                onChange={(e) => setReviewRemark(e.target.value)}
                placeholder={
                  reviewAction === 'reject'
                    ? '简短说明拒绝理由，申请人可见'
                    : '内部备注'
                }
                rows={3}
              />
            </div>

            <DialogFooter>
              <Button
                variant='outline'
                onClick={() => setReviewing(null)}
                disabled={submittingReview}
              >
                取消
              </Button>
              <Button
                onClick={submitDownlineReview}
                disabled={submittingReview}
                variant={reviewAction === 'reject' ? 'destructive' : 'default'}
              >
                {submittingReview
                  ? '提交中…'
                  : reviewAction === 'approve'
                    ? '确认通过'
                    : '确认拒绝'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
