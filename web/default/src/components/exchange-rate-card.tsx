import { memo, useEffect, useRef, useState } from 'react'
import { RefreshCw, TrendingDown, TrendingUp } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useStatus } from '@/hooks/use-status'
import { cn } from '@/lib/utils'

/**
 * 美金汇率卡片（呼吸灯 + 倒计时 + 折线 sparkline）
 *
 * 数据源：/api/status 的 usd_exchange_rate / usd_exchange_rate_updated_at / usd_exchange_rate_history
 * 后端 cron：每小时拉一次实时汇率（fetch_exchange_rate.py），同时把 [ts, rate] 追加到 history JSON
 * 前端：本地倒计时 + 呼吸灯 CSS 动画 + 内嵌 SVG sparkline
 */
export function ExchangeRateCard({ className }: { className?: string }) {
  const { t } = useTranslation()
  const { status } = useStatus()

  const rate = Number(
    (status as Record<string, unknown> | null)?.usd_exchange_rate ?? 7.16
  )
  const updatedAt = Number(
    (status as Record<string, unknown> | null)?.usd_exchange_rate_updated_at ?? 0
  )
  const source = String(
    (status as Record<string, unknown> | null)?.usd_exchange_rate_source ?? ''
  )

  // 历史点 [[ts, rate], ...]（cron 每小时 push 一条，保留 72h）
  const rawHistory = (status as Record<string, unknown> | null)
    ?.usd_exchange_rate_history
  const history: Array<[number, number]> = (() => {
    if (Array.isArray(rawHistory)) {
      return rawHistory.filter(
        (p): p is [number, number] =>
          Array.isArray(p) &&
          p.length === 2 &&
          typeof p[0] === 'number' &&
          typeof p[1] === 'number'
      )
    }
    if (typeof rawHistory === 'string' && rawHistory.length > 0) {
      try {
        const parsed = JSON.parse(rawHistory)
        if (Array.isArray(parsed)) {
          return parsed.filter(
            (p): p is [number, number] =>
              Array.isArray(p) &&
              p.length === 2 &&
              typeof p[0] === 'number' &&
              typeof p[1] === 'number'
          )
        }
      } catch {}
    }
    return []
  })()

  // 客户端记忆上一次的汇率值，用于显示趋势 ↗/↘
  const [prevRate, setPrevRate] = useState<number | null>(null)

  // 记录旧 rate 用于显示趋势
  useEffect(() => {
    if (!rate) return
    const stored = localStorage.getItem('zz_last_usd_rate')
    if (stored) {
      const s = Number(stored)
      if (!Number.isNaN(s) && s !== rate) setPrevRate(s)
    }
    localStorage.setItem('zz_last_usd_rate', String(rate))
  }, [rate])

  // 上次更新的可读时间
  const lastUpdatedStr = updatedAt
    ? new Date(updatedAt * 1000).toLocaleString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      })
    : '—'

  // 趋势（vs 上次本地缓存值）
  const trend = prevRate ? rate - prevRate : 0
  const trendStr = prevRate
    ? `${trend >= 0 ? '+' : ''}${trend.toFixed(4)}`
    : null

  return (
    <div
      className={cn(
        'group relative overflow-hidden rounded-xl border bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent',
        'transition-all',
        className
      )}
      title={source ? `数据源：${source}` : undefined}
    >
      <div className='relative flex flex-1 items-center gap-3 px-4 py-3 whitespace-nowrap'>
        {/* 标签 */}
        <div className='flex shrink-0 items-center gap-1.5'>
          <div className='relative'>
            <div className='absolute -inset-1 rounded-full bg-emerald-500/20 blur' />
            <RefreshCw className='relative size-4 text-emerald-600 dark:text-emerald-400' />
          </div>
          <span className='text-xs font-medium text-muted-foreground'>
            USD → CNY
          </span>
        </div>

        {/* 当前汇率 */}
        <span className='shrink-0 text-lg font-bold tabular-nums text-emerald-700 dark:text-emerald-300'>
          {rate.toFixed(4)}
        </span>

        {/* 趋势数字 */}
        {trendStr && trend !== 0 && (
          <span
            className={cn(
              'flex shrink-0 items-center gap-0.5 text-xs font-medium',
              trend > 0
                ? 'text-rose-600 dark:text-rose-400'
                : 'text-emerald-600 dark:text-emerald-400'
            )}
          >
            {trend > 0 ? (
              <TrendingUp className='size-3' />
            ) : (
              <TrendingDown className='size-3' />
            )}
            {trendStr}
          </span>
        )}

        {/* sparkline 折线趋势 */}
        {history.length >= 2 && <Sparkline points={history} />}

        {/* 中间填充 + 上次更新（行内文字） */}
        <span className='hidden flex-1 truncate text-right text-[10px] text-muted-foreground md:inline'>
          {t('Last updated')} {lastUpdatedStr}
        </span>

        {/* 倒计时（独立子组件，setInterval 不连累父级） */}
        <Countdown updatedAt={updatedAt} />
      </div>

    </div>
  )
}

// ── 倒计时子组件 · 隔离 setInterval re-render 不影响父级 ──────
const Countdown = memo(function Countdown({ updatedAt }: { updatedAt: number }) {
  const ref = useRef<HTMLSpanElement | null>(null)

  useEffect(() => {
    const NEXT = 3600
    const tick = () => {
      if (!ref.current) return
      const now = Math.floor(Date.now() / 1000)
      let sec = NEXT
      if (updatedAt > 0) {
        sec = NEXT - ((now - updatedAt) % NEXT)
      }
      const hh = String(Math.floor(sec / 3600)).padStart(2, '0')
      const mm = String(Math.floor((sec % 3600) / 60)).padStart(2, '0')
      const ss = String(sec % 60).padStart(2, '0')
      ref.current.textContent = `${hh}:${mm}:${ss}`
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [updatedAt])

  return (
    <span
      ref={ref}
      className='shrink-0 font-mono text-xs font-semibold tabular-nums text-emerald-700 dark:text-emerald-300'
    >
      --:--:--
    </span>
  )
})

// ── Sparkline · 内嵌折线趋势图 ───────────────────────────────
// 输入: [[ts, rate], ...]，固定尺寸 100×32 SVG，色彩按整体趋势映射
// memo: status 每次更新会拿到新数组引用，但内容多数不变 — 用 length+lastTs 作为浅比较
const Sparkline = memo(function Sparkline({
  points,
}: {
  points: Array<[number, number]>
}) {
  const W = 100
  const H = 32
  const PAD = 2

  const rates = points.map(([, r]) => r)
  const minR = Math.min(...rates)
  const maxR = Math.max(...rates)
  const range = maxR - minR || 0.0001

  const minTs = points[0][0]
  const maxTs = points[points.length - 1][0]
  const tsRange = maxTs - minTs || 1

  const xy = points.map(([ts, r]) => {
    const x = PAD + ((ts - minTs) / tsRange) * (W - 2 * PAD)
    const y = PAD + (1 - (r - minR) / range) * (H - 2 * PAD)
    return [x, y] as const
  })

  const linePath = xy
    .map(([x, y], i) => (i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`))
    .join(' ')
  const areaPath =
    linePath +
    ` L ${xy[xy.length - 1][0]} ${H - PAD} L ${xy[0][0]} ${H - PAD} Z`

  const last = xy[xy.length - 1]
  const firstR = points[0][1]
  const lastR = points[points.length - 1][1]
  const overallTrend = lastR - firstR
  // 汇率涨 = 美元升值 = 客户成本增加 → 红色警示
  // 汇率跌 = 客户得利 → 绿色
  const trendColor =
    overallTrend > 0
      ? 'rgb(244, 63, 94)'
      : overallTrend < 0
        ? 'rgb(16, 185, 129)'
        : 'rgb(148, 163, 184)'

  return (
    <svg
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      className='hidden shrink-0 overflow-visible sm:inline-block'
      title={`近 ${points.length} 小时 · 低 ${minR.toFixed(4)} / 高 ${maxR.toFixed(4)}`}
    >
      <path d={areaPath} fill={trendColor} fillOpacity={0.12} />
      <path
        d={linePath}
        fill='none'
        stroke={trendColor}
        strokeWidth={1.4}
        strokeLinecap='round'
        strokeLinejoin='round'
      />
      <circle cx={last[0]} cy={last[1]} r={2} fill={trendColor} />
    </svg>
  )
},
(prev, next) =>
  prev.points.length === next.points.length &&
  prev.points[prev.points.length - 1]?.[0] === next.points[next.points.length - 1]?.[0]
)
