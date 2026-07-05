import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Users,
  Key,
  Activity,
  Building2,
  TrendingUp,
  Trophy,
  PieChart,
  Download,
  Sparkles,
} from 'lucide-react'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { Button } from '@/components/ui/button'
import {
  enterpriseApi,
  type OverviewData,
  type TopSpenderRow,
  type ModelBreakdownRow,
} from '../enterprise-api'

const QUOTA_PER_UNIT = 500000

function quotaToUsd(quota: number) {
  return (quota / QUOTA_PER_UNIT).toFixed(2)
}

function downloadCSV(url: string) {
  // 用 <a download> 触发浏览器下载（带 cookie 完成 admin 鉴权）
  const a = document.createElement('a')
  a.href = url
  a.download = ''
  document.body.appendChild(a)
  a.click()
  a.remove()
}

// ─── WorkspaceInfo + 预算条 ──────────────────────────────────
function WorkspaceInfoCard({ data }: { data: OverviewData }) {
  const { t } = useTranslation()
  const monthlyUsage = data.monthly_quota / QUOTA_PER_UNIT
  // Use monthly_used (limit accumulator) for progress bar so it matches the enforcer's view.
  // Fall back to monthly_quota when no limit record exists yet.
  const trackedUsage = data.monthly_used !== undefined ? data.monthly_used : monthlyUsage
  const budgetPercent =
    data.monthly_budget > 0
      ? Math.min(100, Math.round((trackedUsage / data.monthly_budget) * 100))
      : 0

  return (
    <Card>
      <CardHeader>
        <div className='flex items-center gap-2'>
          <Building2 className='size-4' />
          <CardTitle>{data.workspace_name || t('Workspace')}</CardTitle>
          {data.enterprise_id ? (
            <span className='text-muted-foreground font-mono text-xs'>
              · ID-{data.enterprise_id}
            </span>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className='space-y-4'>
        <div className='grid grid-cols-3 gap-4'>
          <div className='text-center'>
            <Users className='text-muted-foreground mx-auto mb-1 size-5' />
            <div className='text-lg font-bold'>{data.member_count}</div>
            <div className='text-muted-foreground text-xs'>
              {t('Members')}
            </div>
          </div>
          <div className='text-center'>
            <Key className='text-muted-foreground mx-auto mb-1 size-5' />
            <div className='text-lg font-bold'>{data.token_count}</div>
            <div className='text-muted-foreground text-xs'>
              {t('API Keys')}
            </div>
          </div>
          <div className='text-center'>
            <Activity className='text-muted-foreground mx-auto mb-1 size-5' />
            <div className='text-lg font-bold'>${monthlyUsage}</div>
            <div className='text-muted-foreground text-xs'>
              {t('Monthly Usage')}
            </div>
          </div>
        </div>

        {data.monthly_budget > 0 && (
          <>
            <Separator />
            <div>
              <div className='mb-2 flex items-center justify-between text-sm'>
                <span className='text-muted-foreground'>
                  {t('Budget Usage')}
                </span>
                <span className='font-medium'>
                  ${trackedUsage.toFixed(2)} / ${data.monthly_budget.toFixed(2)}
                </span>
              </div>
              <Progress value={budgetPercent} className='h-2' />
              <p className='text-muted-foreground mt-1 text-xs'>
                {budgetPercent}% {t('used')} · $
                {Math.max(0, data.monthly_budget - trackedUsage).toFixed(2)}{' '}
                {t('remaining')}
              </p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

// ─── 成员费用排行榜 ─────────────────────────────────────────
function TopSpendersCard() {
  const { t } = useTranslation()
  const [rows, setRows] = useState<TopSpenderRow[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    enterpriseApi
      .getTopSpenders(10)
      .then((res) => {
        if (res.success && res.data) setRows(res.data)
      })
      .finally(() => setLoading(false))
  }, [])

  const totalUsd = rows.reduce(
    (acc, r) => acc + r.used_quota / QUOTA_PER_UNIT,
    0,
  )

  return (
    <Card>
      <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-3'>
        <div>
          <div className='flex items-center gap-2'>
            <Trophy className='size-4 text-amber-500' />
            <CardTitle>{t('成员费用排行榜')}</CardTitle>
          </div>
          <CardDescription>
            {t('本月消费 Top 10 · 总计')} <b>${totalUsd.toFixed(2)}</b>
          </CardDescription>
        </div>
        <Button
          variant='outline'
          size='sm'
          onClick={() => downloadCSV(enterpriseApi.exportUrls.members)}
        >
          <Download className='mr-1.5 size-3.5' />
          {t('导出 CSV')}
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className='text-muted-foreground text-sm'>{t('Loading...')}</p>
        ) : rows.length === 0 ? (
          <p className='text-muted-foreground text-sm'>
            {t('本月暂无消费数据')}
          </p>
        ) : (
          <div className='space-y-1.5'>
            {rows.map((r, idx) => {
              const usd = r.used_quota / QUOTA_PER_UNIT
              const pct = totalUsd > 0 ? (usd / totalUsd) * 100 : 0
              return (
                <div
                  key={r.user_id}
                  className='grid grid-cols-[24px_1fr_auto_auto] items-center gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-muted/40'
                >
                  <span
                    className={`font-bold tabular-nums ${
                      idx === 0
                        ? 'text-amber-500'
                        : idx === 1
                          ? 'text-zinc-400'
                          : idx === 2
                            ? 'text-orange-600'
                            : 'text-muted-foreground'
                    }`}
                  >
                    {idx + 1}
                  </span>
                  <div className='min-w-0 truncate'>
                    <span className='font-medium'>
                      {r.display_name || r.username}
                    </span>
                    <span className='text-muted-foreground ml-2 text-xs'>
                      {r.email}
                    </span>
                  </div>
                  <span className='text-muted-foreground text-xs tabular-nums'>
                    {r.req_count.toLocaleString()} req
                  </span>
                  <span className='w-20 text-right font-mono font-medium tabular-nums'>
                    ${usd.toFixed(2)}
                  </span>
                </div>
              )
            })}
            {/* 总进度条参考 */}
            <div className='mt-3'>
              <Progress value={100} className='h-1 opacity-30' />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ─── 模型成本分布（颜色化条形图 + 表格）──────────────────────
function ModelBreakdownCard() {
  const { t } = useTranslation()
  const [rows, setRows] = useState<ModelBreakdownRow[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    enterpriseApi
      .getModelBreakdown()
      .then((res) => {
        if (res.success && res.data) setRows(res.data)
      })
      .finally(() => setLoading(false))
  }, [])

  const totalUsd = rows.reduce(
    (acc, r) => acc + r.used_quota / QUOTA_PER_UNIT,
    0,
  )

  // 给前 8 个模型分配不同的彩条颜色
  const colors = [
    'bg-emerald-500',
    'bg-sky-500',
    'bg-amber-500',
    'bg-violet-500',
    'bg-rose-500',
    'bg-cyan-500',
    'bg-orange-500',
    'bg-pink-500',
  ]

  return (
    <Card>
      <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-3'>
        <div>
          <div className='flex items-center gap-2'>
            <PieChart className='size-4 text-violet-500' />
            <CardTitle>{t('模型成本分布')}</CardTitle>
          </div>
          <CardDescription>
            {t('本月各模型消费占比 · 总计')} <b>${totalUsd.toFixed(2)}</b>
          </CardDescription>
        </div>
        <Button
          variant='outline'
          size='sm'
          onClick={() => downloadCSV(enterpriseApi.exportUrls.billing)}
        >
          <Download className='mr-1.5 size-3.5' />
          {t('月度账单')}
        </Button>
      </CardHeader>
      <CardContent className='space-y-3'>
        {loading ? (
          <p className='text-muted-foreground text-sm'>{t('Loading...')}</p>
        ) : rows.length === 0 ? (
          <p className='text-muted-foreground text-sm'>
            {t('本月暂无调用记录')}
          </p>
        ) : (
          <>
            {/* 整体彩色条 */}
            <div className='bg-muted/40 flex h-3 w-full overflow-hidden rounded-full'>
              {rows.slice(0, 8).map((r, i) => {
                const usd = r.used_quota / QUOTA_PER_UNIT
                const pct = totalUsd > 0 ? (usd / totalUsd) * 100 : 0
                return (
                  <div
                    key={r.model_name}
                    className={colors[i]}
                    style={{ width: `${pct}%` }}
                    title={`${r.model_name} $${usd.toFixed(2)} (${pct.toFixed(1)}%)`}
                  />
                )
              })}
            </div>
            {/* 表格 */}
            <div className='max-h-72 overflow-y-auto'>
              <table className='w-full text-sm'>
                <thead>
                  <tr className='text-muted-foreground border-b text-left text-xs'>
                    <th className='py-1.5 pr-2'>#</th>
                    <th className='py-1.5'>{t('模型')}</th>
                    <th className='py-1.5 pr-2 text-right'>{t('调用')}</th>
                    <th className='py-1.5 pr-2 text-right'>{t('消费')}</th>
                    <th className='py-1.5 text-right'>{t('占比')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => {
                    const usd = r.used_quota / QUOTA_PER_UNIT
                    const pct = totalUsd > 0 ? (usd / totalUsd) * 100 : 0
                    return (
                      <tr
                        key={r.model_name}
                        className='hover:bg-muted/30 border-b border-zinc-200/40 last:border-0 dark:border-zinc-800/40'
                      >
                        <td className='py-1.5 pr-2 tabular-nums'>
                          <span
                            className={`inline-block size-2.5 rounded-full ${
                              i < 8 ? colors[i] : 'bg-zinc-500'
                            }`}
                          />
                        </td>
                        <td className='py-1.5 font-mono text-xs'>
                          {r.model_name}
                        </td>
                        <td className='text-muted-foreground py-1.5 pr-2 text-right tabular-nums'>
                          {r.req_count.toLocaleString()}
                        </td>
                        <td className='py-1.5 pr-2 text-right tabular-nums'>
                          ${usd.toFixed(4)}
                        </td>
                        <td className='py-1.5 text-right tabular-nums'>
                          {pct.toFixed(1)}%
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

// ─── 分组配额（原版保留）────────────────────────────────────
function GroupQuotasCard({ data }: { data: OverviewData }) {
  const { t } = useTranslation()
  const totalQuota = data.monthly_quota || 1

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('Group Quotas')}</CardTitle>
        <CardDescription>
          {t('Monthly usage distribution by group')}
        </CardDescription>
      </CardHeader>
      <CardContent className='space-y-4'>
        {data.group_stats.length === 0 ? (
          <p className='text-muted-foreground text-sm'>
            {t('No group data')}
          </p>
        ) : (
          data.group_stats.map((g) => {
            const pct = Math.min(
              100,
              Math.round((g.used_quota / totalQuota) * 100),
            )
            return (
              <div key={g.group} className='space-y-2'>
                <div className='flex items-center justify-between text-sm'>
                  <span className='font-medium'>{g.group || 'default'}</span>
                  <span className='text-muted-foreground'>
                    ${quotaToUsd(g.used_quota)} · {g.member_count}{' '}
                    {t('members')}
                  </span>
                </div>
                <Progress value={pct} className='h-1.5' />
              </div>
            )
          })
        )}
      </CardContent>
    </Card>
  )
}

// ─── Quick Stats ────────────────────────────────────────────
function QuickStats() {
  const { t } = useTranslation()
  const stats = [
    {
      icon: <Sparkles className='size-4 text-green-500' />,
      label: t('Monthly Budget'),
      value: t('See Settings'),
    },
    {
      icon: <TrendingUp className='size-4 text-blue-500' />,
      label: t('Usage Tracking'),
      value: t('Real-time'),
    },
    {
      icon: <Activity className='size-4 text-violet-500' />,
      label: t('Audit Logs'),
      value: t('Enabled'),
    },
  ]
  return (
    <div className='grid gap-4 sm:grid-cols-3'>
      {stats.map((stat) => (
        <Card key={stat.label}>
          <CardContent className='flex items-center gap-3 pt-5'>
            <div className='bg-muted rounded-lg p-2'>{stat.icon}</div>
            <div>
              <div className='text-muted-foreground text-sm'>{stat.label}</div>
              <div className='text-xl font-bold'>{stat.value}</div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

// ─── 主入口 ─────────────────────────────────────────────────
export function EnterpriseWorkspaceOverview() {
  const { t } = useTranslation()
  const [data, setData] = useState<OverviewData | null>(null)
  const [loading, setLoading] = useState(true)
  const [errMsg, setErrMsg] = useState('')

  useEffect(() => {
    enterpriseApi
      .getOverview()
      .then((res) => {
        if (res.success && res.data) {
          setData(res.data)
        } else if (res.message) {
          setErrMsg(res.message)
        }
      })
      .finally(() => setLoading(false))
  }, [])

  if (loading)
    return <p className='text-muted-foreground text-sm'>{t('Loading...')}</p>
  if (!data) {
    return (
      <div className='rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm'>
        <p className='font-medium text-amber-700 dark:text-amber-400'>
          {errMsg || t('Failed to load data')}
        </p>
      </div>
    )
  }

  return (
    <div className='space-y-6'>
      <WorkspaceInfoCard data={data} />
      <QuickStats />
      <div className='grid gap-6 lg:grid-cols-2'>
        <TopSpendersCard />
        <ModelBreakdownCard />
      </div>
      <GroupQuotasCard data={data} />
    </div>
  )
}
