/**
 * 首页订阅套餐推广区
 * 动态拉取后端真实启用套餐(/api/subscription/plans/public),与购买页完全一致。
 * 点击 → 未登录弹注册;已登录跳钱包页订阅。
 * 视觉:摆渡人品牌色(墨蓝玻璃 + 琥珀金单一强调),船票质感,去 AI 通病紫渐变。
 */
import { useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { Check, Sparkles } from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'

interface ApiPlan {
  id: number
  title: string
  subtitle: string
  price_amount: number
  currency: string
  duration_unit: string
  duration_value: number
  total_amount: number
  upgrade_group: string
  sort_order: number
}

// 套餐组 → 是否主推(最热)
const FEATURED_GROUP = 'sub-cc-std'

function periodLabel(unit: string, value: number): string {
  if (unit === 'day') return value === 7 ? '周' : `${value}天`
  if (unit === 'week') return value === 1 ? '周' : `${value}周`
  if (unit === 'month') return value === 1 ? '月' : `${value}月`
  if (unit === 'year') return '年'
  return '月'
}

function monthlyEq(price: number, unit: string, value: number): number | null {
  if (unit === 'month' && value === 1) return null
  if (unit === 'day') return Math.round((price * 30) / value)
  if (unit === 'week') return Math.round((price * 30) / (value * 7))
  if (unit === 'month') return Math.round(price / value)
  if (unit === 'year') return Math.round(price / 12)
  return null
}

export function SubscriptionPackages({ onSignUp }: { onSignUp: () => void }) {
  const { auth } = useAuthStore()
  const isLoggedIn = !!auth?.user
  const [plans, setPlans] = useState<ApiPlan[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    fetch('/api/subscription/plans/public')
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return
        const raw = (d?.data ?? []) as Array<{ plan?: ApiPlan } & ApiPlan>
        // 响应每项可能裹在 {plan:{...}} 里,兼容两种结构
        const list = raw
          .map((x) => (x.plan ? x.plan : x))
          .filter((p): p is ApiPlan => !!p && !!p.title)
          .sort((a, b) => a.price_amount - b.price_amount) // 便宜在前,引导转化
        setPlans(list)
      })
      .catch(() => setPlans([]))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [])

  // 拉取失败或无套餐 → 不渲染整块(首页不留空架子)
  if (!loading && plans.length === 0) return null

  return (
    <section className='relative w-full px-4 py-20'>
      <div className='mx-auto max-w-7xl'>
        {/* 标题区 */}
        <div className='mb-12 text-center'>
          <div className='glass-btn glass-shimmer mb-5 inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-medium'>
            <Sparkles className='size-3.5 text-amber-500' />
            订阅套餐 · 比按 Token 计费便宜 70%
          </div>
          <h2 className='text-[clamp(2rem,5vw,3.5rem)] font-bold leading-tight tracking-tight'>
            <span className='bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent'>
              选张船票，
            </span>
            <span className='bg-gradient-to-r from-amber-500 to-orange-500 bg-clip-text text-transparent'>
              畅渡全模型
            </span>
          </h2>
          <p className='mx-auto mt-4 max-w-2xl text-[15px] leading-relaxed text-foreground/55'>
            按 Token 计费太复杂？包月套餐固定预算，额度任你用
            <br className='hidden sm:inline' />
            <span className='text-foreground/35'>
              到期前可续费 · 套餐内模型畅用，预算可控不断流
            </span>
          </p>
        </div>

        {/* 套餐网格 */}
        {loading ? (
          <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className='h-64 animate-pulse rounded-2xl border border-border/50 bg-foreground/[0.03]'
              />
            ))}
          </div>
        ) : (
          <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
            {plans.map((p) => {
              const featured = p.upgrade_group === FEATURED_GROUP
              const period = periodLabel(p.duration_unit, p.duration_value)
              const eq = monthlyEq(p.price_amount, p.duration_unit, p.duration_value)
              // subtitle 形如 "haiku+sonnet · 每月 $45 额度" —— 拆成模型行 + 额度行
              const parts = (p.subtitle || '').split('·').map((s) => s.trim()).filter(Boolean)
              return (
                <div
                  key={p.id}
                  className={`group relative flex flex-col overflow-hidden rounded-2xl border p-5 backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:shadow-xl ${
                    featured
                      ? 'border-amber-400/50 bg-gradient-to-br from-amber-400/[0.12] to-orange-500/[0.05] shadow-[0_8px_30px_-12px_rgba(245,158,11,0.45)] ring-1 ring-amber-400/30'
                      : 'border-border/60 bg-foreground/[0.025] hover:border-amber-300/40'
                  }`}
                >
                  {/* 船票质感:顶部细虚线 + 主推角标 */}
                  {featured && (
                    <>
                      <span className='absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-amber-400 to-transparent' />
                      <span className='absolute right-3 top-3 rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-bold text-white shadow-sm'>
                        🔥 最热
                      </span>
                    </>
                  )}

                  {/* 名称 */}
                  <h3 className='pr-12 text-[15px] font-bold leading-tight tracking-tight'>
                    {p.title}
                  </h3>

                  {/* 价格 */}
                  <div className='mt-3 flex items-baseline gap-1'>
                    <span
                      className={`text-3xl font-bold tabular-nums ${
                        featured ? 'text-amber-600 dark:text-amber-400' : ''
                      }`}
                    >
                      ¥{p.price_amount}
                    </span>
                    <span className='text-xs text-foreground/45'>/ {period}</span>
                  </div>
                  {eq != null && (
                    <div className='mt-0.5 text-[11px] text-foreground/40'>约 ¥{eq}/月</div>
                  )}

                  {/* 套餐内容(subtitle 拆行) */}
                  <div className='mt-4 flex-1 space-y-1.5 text-[12px]'>
                    {parts.length > 0 ? (
                      parts.map((line, i) => (
                        <div key={i} className='flex items-center gap-1.5'>
                          <Check
                            className={`size-3 shrink-0 ${
                              featured ? 'text-amber-500' : 'text-amber-500/70'
                            }`}
                          />
                          <span className='text-foreground/70'>{line}</span>
                        </div>
                      ))
                    ) : (
                      <div className='flex items-center gap-1.5'>
                        <Check className='size-3 shrink-0 text-amber-500/70' />
                        <span className='text-foreground/70'>包月固定额度</span>
                      </div>
                    )}
                  </div>

                  {/* CTA */}
                  {isLoggedIn ? (
                    <Link
                      to='/console/wallet'
                      className={`mt-5 block w-full rounded-xl py-2.5 text-center text-[13px] font-semibold transition-all ${
                        featured
                          ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:opacity-90'
                          : 'bg-foreground text-background hover:opacity-90'
                      }`}
                    >
                      立即订阅
                    </Link>
                  ) : (
                    <button
                      type='button'
                      onClick={onSignUp}
                      className={`mt-5 block w-full rounded-xl py-2.5 text-center text-[13px] font-semibold transition-all ${
                        featured
                          ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:opacity-90'
                          : 'bg-foreground text-background hover:opacity-90'
                      }`}
                    >
                      免费注册解锁
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* 底部注释 */}
        <div className='mt-10 space-y-2 text-center text-xs text-foreground/40'>
          <div>
            <span className='text-foreground/60'>套餐内模型畅用</span>
            <span className='mx-1.5 text-foreground/25'>·</span>
            超出或其他模型按量扣余额，绝不突然断流
          </div>
          <div>
            所有套餐到期前可续费
            {' · '}
            <Link to='/pricing' className='underline hover:text-foreground/70'>
              查看完整定价
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}
