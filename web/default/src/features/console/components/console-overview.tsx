import { useTranslation } from 'react-i18next'
import { ArrowUpRight, Zap, MessageSquare, Coins, Clock, Sparkles, TrendingUp } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { useSystemConfig } from '@/hooks/use-system-config'
import { useAuthStore } from '@/stores/auth-store'
import { useSubscriptionUsage } from '../hooks/use-subscription'
import { mockModelPreferences } from '../lib/mock-data'
import { formatCost, formatTokens, getPlanColor, getPlanDisplayName, formatRelativeTime } from '../lib/utils'

// ─── 订阅状态卡片 ───

function SubscriptionCard() {
  const { t } = useTranslation()
  const { systemName } = useSystemConfig()
  const { auth } = useAuthStore()
  const { data: usage, isLoading } = useSubscriptionUsage()
  const user = auth.user

  const quotaTotal = usage?.quota_total ?? 0
  const quotaUsed = usage?.quota_used ?? 0
  const balance = (user?.quota ?? 0) / 500000 // rough conversion for display
  const usagePercent = quotaTotal > 0 ? Math.round((quotaUsed / quotaTotal) * 100) : 0

  const subs = usage?.subscriptions ?? []
  const activeSub = subs.length > 0 ? subs[0].subscription : null
  const planName = activeSub ? `plan_${activeSub.plan_id}` : 'free'
  const endTime = activeSub?.end_time
    ? new Date(activeSub.end_time * 1000).toISOString()
    : undefined

  return (
    <Card>
      <CardHeader className='pb-3'>
        <div className='flex items-center justify-between'>
          <CardTitle className='text-sm font-medium'>{t('Subscription')}</CardTitle>
          <Badge variant={activeSub?.status === 'active' ? 'default' : 'secondary'}>
            {activeSub?.status === 'active' ? t('Active') : t('Inactive')}
          </Badge>
        </div>
        <CardDescription>
          {systemName} · {t('Personal Account')}
        </CardDescription>
      </CardHeader>
      <CardContent className='space-y-4'>
        {/* 当前计划 */}
        <div className='flex items-center justify-between'>
          <span className='text-sm text-muted-foreground'>{t('Current Plan')}</span>
          <span className={`font-semibold ${getPlanColor(planName)}`}>
            {getPlanDisplayName(planName)}
          </span>
        </div>

        {/* 月度额度 */}
        <div>
          {isLoading ? (
            <Skeleton className='h-4 w-full' />
          ) : (
            <>
              <div className='mb-2 flex items-center justify-between text-sm'>
                <span className='text-muted-foreground'>{t('Monthly Quota')}</span>
                <span className='font-medium'>
                  {formatCost(quotaUsed)} / {formatCost(quotaTotal)}
                </span>
              </div>
              <Progress value={usagePercent} className='h-2' />
              <p className='text-muted-foreground mt-1 text-xs'>
                {usagePercent}% {t('used')} · {formatCost(quotaTotal - quotaUsed)} {t('remaining')}
              </p>
            </>
          )}
        </div>

        <Separator />

        {/* 到期时间 */}
        <div className='flex items-center justify-between text-sm'>
          <span className='text-muted-foreground'>{t('Renewal Date')}</span>
          <span>{endTime ? formatRelativeTime(endTime) : '—'}</span>
        </div>

        {/* 余额 */}
        <div className='flex items-center justify-between text-sm'>
          <span className='text-muted-foreground'>{t('Balance')}</span>
          <span className='font-semibold'>{formatCost(balance)}</span>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── 统计卡片 ───

interface StatCardProps {
  icon: React.ReactNode
  label: string
  value: string
  subValue?: string
  trend?: { value: string; positive: boolean }
}

function StatCard({ icon, label, value, subValue, trend }: StatCardProps) {
  return (
    <Card>
      <CardContent className='pt-5'>
        <div className='flex items-start justify-between'>
          <div className='space-y-2'>
            <div className='text-sm text-muted-foreground'>{label}</div>
            <div className='text-2xl font-bold tracking-tight'>{value}</div>
            {subValue && <div className='text-xs text-muted-foreground'>{subValue}</div>}
          </div>
          <div className='rounded-lg bg-muted p-2'>{icon}</div>
        </div>
        {trend && (
          <div className='mt-3 flex items-center gap-1 text-xs'>
            <TrendingUp className={`size-3 ${trend.positive ? 'text-green-500' : 'text-red-500'}`} />
            <span className={trend.positive ? 'text-green-500' : 'text-red-500'}>{trend.value}</span>
            <span className='text-muted-foreground'>{/* vs last month */}</span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function StatsGrid() {
  const { t } = useTranslation()
  const { auth } = useAuthStore()
  const { data: usage, isLoading } = useSubscriptionUsage()
  const user = auth.user

  const requestCount = user?.request_count ?? 0
  const quotaUsed = usage?.quota_used ?? 0
  const quotaTotal = usage?.quota_total ?? 0

  return (
    <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
      <StatCard
        icon={<MessageSquare className='size-4 text-blue-500' />}
        label={t('Requests This Month')}
        value={isLoading ? '—' : requestCount.toLocaleString()}
      />
      <StatCard
        icon={<Zap className='size-4 text-amber-500' />}
        label={t('Token Usage')}
        value={isLoading ? '—' : formatTokens(quotaUsed * 1000)}
        subValue={isLoading ? '—' : `${formatCost(quotaUsed)} used`}
      />
      <StatCard
        icon={<Coins className='size-4 text-green-500' />}
        label={t('Cost This Month')}
        value={isLoading ? '—' : formatCost(quotaUsed)}
      />
      <StatCard
        icon={<Clock className='size-4 text-violet-500' />}
        label={t('Avg Latency')}
        value='—'
        subValue={t('Real-time stats coming soon')}
      />
    </div>
  )
}

// ─── 常用模型快捷入口 ───

function QuickModels() {
  const { t } = useTranslation()
  const topModels = mockModelPreferences
    .filter((m) => m.isFavorite)
    .sort((a, b) => b.usageCount - a.usageCount)
    .slice(0, 6)

  return (
    <Card>
      <CardHeader>
        <CardTitle className='text-sm'>{t('Favorite Models')}</CardTitle>
        <CardDescription>{t('Your most frequently used models')}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className='grid gap-2 sm:grid-cols-2'>
          {topModels.map((model) => (
            <Button
              key={model.id}
              variant='ghost'
              className='h-auto justify-between px-3 py-2.5'
            >
              <div className='flex items-center gap-2'>
                <Sparkles className='size-3.5 text-muted-foreground' />
                <span className='text-sm font-medium'>{model.name}</span>
              </div>
              <div className='flex items-center gap-1 text-xs text-muted-foreground'>
                {model.usageCount} {t('calls')}
                <ArrowUpRight className='size-3' />
              </div>
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

// ─── 主组件 ───

export function ConsoleOverview() {
  return (
    <div className='space-y-6'>
      <SubscriptionCard />
      <StatsGrid />
      <div className='grid gap-4 lg:grid-cols-2'>
        <QuickModels />
      </div>
    </div>
  )
}
