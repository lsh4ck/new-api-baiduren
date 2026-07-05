import { useEffect, useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import {
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  ChevronDown,
  Globe,
  Key,
  Layers,
  Lock,
  LogOut,
  Moon,
  Shield,
  Sparkles,
  Sun,
  User,
  Users,
  Zap,
} from 'lucide-react'
import { useSystemConfig } from '@/hooks/use-system-config'
import { useAuthStore } from '@/stores/auth-store'
import { useTheme } from '@/context/theme-provider'
import { useNotifications } from '@/hooks/use-notifications'
import { ExchangeRateCard } from '@/components/exchange-rate-card'
import { Footer } from '@/components/layout/components/footer'
import { HeaderLogo } from '@/components/layout/components/header-logo'
import { NotificationButton } from '@/components/notification-button'
import { NotificationDialog } from '@/components/notification-dialog'
import { SubscriptionPackages } from './SubscriptionPackages'
import { SmartRelayShowcase } from './SmartRelayShowcase'
import { logout } from '@/features/auth/api'
import { removeUserId } from '@/features/auth/lib/storage'
import { AuthModal, type AuthTab } from '@/features/auth/auth-modal'

/* ─────────────────────────────────────────────────────────────────────
   Aurora 背景（全局复用）
   ───────────────────────────────────────────────────────────────────── */
function AuroraBg({ dense }: { dense?: boolean }) {
  return (
    <div aria-hidden className='pointer-events-none absolute inset-0 overflow-hidden'>
      <div className='aurora-orb absolute left-[15%] top-[10%] h-[60vw] w-[55vw] max-h-[700px] max-w-[700px] bg-indigo-500/[0.30] dark:bg-indigo-600/[0.13]' />
      <div className='aurora-orb aurora-orb-2 absolute right-[10%] top-[30%] h-[45vw] w-[45vw] max-h-[560px] max-w-[560px] bg-violet-500/[0.22] dark:bg-violet-600/[0.09]' />
      <div className='aurora-orb aurora-orb-3 absolute bottom-[-10%] left-[35%] h-[40vw] w-[40vw] max-h-[480px] max-w-[480px] bg-sky-500/[0.18] dark:bg-sky-500/[0.08]' />
      {dense && (
        <div className='aurora-orb absolute right-[30%] top-[60%] h-[30vw] w-[30vw] max-h-[360px] max-w-[360px] bg-purple-500/[0.16] dark:bg-purple-500/[0.07]' style={{ animationDelay: '-4s', animationDuration: '24s' }} />
      )}
      {/* 点阵网格 */}
      <div className='absolute inset-0 bg-[radial-gradient(rgba(0,0,0,0.055)_1px,transparent_1px)] dark:bg-[radial-gradient(rgba(255,255,255,0.055)_1px,transparent_1px)] bg-[size:36px_36px] [mask-image:radial-gradient(ellipse_85%_80%_at_50%_30%,black,transparent)]' />
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────
   液态玻璃导航
   ───────────────────────────────────────────────────────────────────── */
function Nav({ onSignIn, onSignUp }: { onSignIn: () => void; onSignUp: () => void }) {
  const { systemName, logo, loading, logoLoaded } = useSystemConfig()
  const { auth } = useAuthStore()
  const { resolvedTheme, setTheme } = useTheme()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const notifications = useNotifications()
  const isLoggedIn = !!auth.user

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 16)
    fn()
    window.addEventListener('scroll', fn, { passive: true })
    return () => window.removeEventListener('scroll', fn)
  }, [])

  const handleLogout = async () => {
    await logout().catch(() => {})
    auth.setUser(null)
    removeUserId()
    setOpen(false)
    navigate({ to: '/', replace: true })
  }

  return (
    <header className='pointer-events-none fixed inset-x-0 top-0 z-50'>
      <div
        className={`pointer-events-auto mx-auto transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${
          scrolled
            ? 'max-w-3xl px-3 pt-2.5'
            : 'max-w-7xl px-4 pt-0 md:px-10'
        }`}
      >
        <nav
          className={`flex items-center justify-between transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${
            scrolled
              ? 'glass-nav h-12 rounded-2xl px-4'
              : 'h-16 px-0'
          }`}
        >
          {/* Logo */}
          <Link to='/' className='group flex items-center gap-2.5'>
            <span className='flex size-8 items-center justify-center'>
              {loading ? (
                <span className='size-6 animate-pulse rounded-lg bg-foreground/10' />
              ) : logo && logoLoaded ? (
                <HeaderLogo src={logo} loading={loading} logoLoaded={logoLoaded} className='size-7 object-contain' />
              ) : (
                <Sparkles className='size-5 text-foreground/60' />
              )}
            </span>
            <span className='text-[15px] font-semibold tracking-tight text-foreground'>
              {loading ? '…' : systemName || 'New API'}
            </span>
          </Link>

          {/* 中间导航 */}
          <nav className='hidden items-center gap-0.5 md:flex'>
            <Link
              to='/go-aigc'
              className='group relative mr-1 inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[13.5px] font-semibold text-amber-600 transition-colors hover:text-amber-500 dark:text-amber-400 dark:hover:text-amber-300'
            >
              <span>🎨 唐伯虎AIGC 创作平台</span>
            </Link>
            {[
              { to: '/pricing', label: '定价' },
              { to: '/rankings', label: '模型' },
            ].map(item => (
              <Link
                key={item.to}
                to={item.to}
                className='rounded-lg px-3.5 py-2 text-[13.5px] font-medium text-foreground/50 transition-colors hover:text-foreground/90'
              >
                {item.label}
              </Link>
            ))}
            <Link
              to='/doc'
              className='rounded-lg px-3.5 py-2 text-[13.5px] font-medium text-foreground/50 transition-colors hover:text-foreground/90'
            >
              文档
            </Link>
            <Link
              to='/changelog'
              className='changelog-marquee group relative ml-1 inline-flex items-center gap-1.5 overflow-hidden rounded-lg px-3.5 py-2 text-[13.5px] font-medium text-foreground/70 transition-all hover:text-foreground'
            >
              <span className='relative z-10'>更新日志</span>
              <span className='relative z-10 inline-flex size-1.5 animate-pulse rounded-full bg-emerald-500' />
              <span className='changelog-glow absolute inset-0 rounded-lg' />
            </Link>
          </nav>
          <style>{`
            .changelog-marquee {
              background: linear-gradient(90deg,
                transparent 0%,
                rgba(16,185,129,0.06) 25%,
                rgba(99,102,241,0.06) 50%,
                rgba(217,70,239,0.06) 75%,
                transparent 100%);
              background-size: 200% 100%;
              animation: changelog-bg 6s ease-in-out infinite;
            }
            @keyframes changelog-bg {
              0%, 100% { background-position: 200% 0; }
              50%      { background-position: 0% 0; }
            }
            .changelog-glow {
              box-shadow: 0 0 0 1px rgba(16,185,129,0.25), 0 0 18px rgba(16,185,129,0);
              animation: changelog-glow 3s ease-in-out infinite;
              pointer-events: none;
            }
            @keyframes changelog-glow {
              0%, 100% { box-shadow: 0 0 0 1px rgba(16,185,129,0.20), 0 0 0px rgba(16,185,129,0); }
              50%      { box-shadow: 0 0 0 1px rgba(99,102,241,0.45), 0 0 16px rgba(99,102,241,0.30); }
            }
          `}</style>

          {/* 右侧操作 */}
          <div className='flex items-center gap-2'>
            {/* 通知铃铛 — 仅登录用户可见 */}
            {isLoggedIn && (
              <NotificationButton
                unreadCount={notifications.unreadCount}
                onClick={() => notifications.openDialog()}
                className='glass-btn glass-shimmer h-8 w-8 rounded-xl'
              />
            )}

            {/* 明暗切换 */}
            <button
              onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
              className='glass-btn glass-shimmer flex size-8 items-center justify-center rounded-xl'
              aria-label={resolvedTheme === 'dark' ? '切换亮色模式' : '切换暗色模式'}
            >
              {resolvedTheme === 'dark'
                ? <Sun className='size-4' />
                : <Moon className='size-4' />
              }
            </button>

            {auth.user ? (
              <div className='relative'>
                <button
                  onClick={() => setOpen(v => !v)}
                  className='glass-btn glass-shimmer flex items-center gap-2 rounded-xl px-3.5 py-1.5 text-[13px] font-medium'
                >
                  <User className='size-3.5' />
                  <span className='hidden sm:inline'>{auth.user.username}</span>
                  <ChevronDown className='size-3.5 opacity-40' />
                </button>
                {open && (
                  <div className='glass-nav absolute right-0 top-full mt-2 w-52 overflow-hidden rounded-2xl'>
                    <Link to='/console' onClick={() => setOpen(false)} className='flex items-center gap-2.5 px-4 py-3 text-[13.5px] text-foreground/70 transition-colors hover:bg-foreground/[0.06] hover:text-foreground'>
                      <BarChart3 className='size-4' />控制台
                    </Link>
                    {auth.user.role >= 10 && (
                      <Link to='/console/enterprise' onClick={() => setOpen(false)} className='flex items-center gap-2.5 px-4 py-3 text-[13.5px] text-foreground/70 transition-colors hover:bg-foreground/[0.06] hover:text-foreground'>
                        <Shield className='size-4' />企业控制台
                      </Link>
                    )}
                    <div className='mx-4 h-px bg-foreground/[0.08]' />
                    <button onClick={handleLogout} className='flex w-full items-center gap-2.5 px-4 py-3 text-[13.5px] text-red-500 transition-colors hover:bg-red-500/10 hover:text-red-600 dark:text-red-400/80 dark:hover:text-red-400'>
                      <LogOut className='size-4' />退出登录
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <>
                <button
                  onClick={onSignIn}
                  className='hidden px-3.5 py-2 text-[13.5px] font-medium text-foreground/45 transition-colors hover:text-foreground/80 sm:block'
                >
                  登录
                </button>
                <button
                  onClick={onSignUp}
                  className='glass-btn-primary glass-shimmer flex items-center gap-1.5 rounded-xl px-4 py-1.5 text-[13.5px] text-white'
                >
                  免费开始
                  <ArrowRight className='size-3.5' />
                </button>
              </>
            )}
          </div>
        </nav>
      </div>

      {/* 通知 Dialog — 仅登录用户可见 */}
      {isLoggedIn && (
        <NotificationDialog
          open={notifications.dialogOpen}
          onOpenChange={notifications.setDialogOpen}
          activeTab={notifications.activeTab}
          onTabChange={notifications.setActiveTab}
          notice={notifications.notice}
          announcements={notifications.announcements}
          loading={notifications.loading}
          onCloseToday={notifications.closeToday}
        />
      )}
    </header>
  )
}

/* ─────────────────────────────────────────────────────────────────────
   英雄区 — 全屏大气
   ───────────────────────────────────────────────────────────────────── */
function Hero({ onSignUp }: { onSignUp: () => void }) {
  const { systemName } = useSystemConfig()
  const { auth } = useAuthStore()
  const name = systemName || 'New API'

  return (
    <section className='relative flex min-h-svh flex-col items-center justify-center overflow-hidden px-4 pt-20 pb-10'>
      <AuroraBg dense />

      <div className='relative z-10 mx-auto flex max-w-5xl flex-col items-center text-center'>
        {/* 状态 badge */}
        <div className='glass-btn glass-shimmer mb-8 inline-flex items-center gap-2.5 rounded-full px-5 py-2 text-[13px]'>
          <span className='size-1.5 animate-pulse rounded-full bg-emerald-500 dark:bg-emerald-400' />
          Claude Code · Codex · Gemini CLI 全部原生支持
        </div>

        {/* 主标题 */}
        <h1 className='whitespace-nowrap text-[clamp(2rem,7vw,4.5rem)] font-bold leading-[1.1] tracking-[-0.03em]'>
          <span className='bg-gradient-to-b from-foreground/90 to-foreground/65 dark:from-white dark:to-white/75 bg-clip-text text-transparent'>
            多档渠道，
          </span>
          <span className='bg-gradient-to-r from-indigo-500 via-sky-400 to-violet-500 dark:from-indigo-400 dark:via-sky-300 dark:to-violet-400 bg-clip-text text-transparent'>
            任君选择
          </span>
        </h1>

        {/* 副标题 */}
        <p className='mx-auto mt-7 max-w-2xl text-[clamp(15px,2vw,18px)] leading-[1.7] text-foreground/50'>
          无需魔法 · 无需官方账号 · 无需国外信用卡
          <br />
          <span className='text-foreground/35'>——</span>{' '}
          {name} 聚合{' '}
          <span className='font-semibold text-indigo-500 dark:text-indigo-400'>57+</span> 厂商、
          <span className='font-semibold text-sky-500 dark:text-sky-400'>500+</span> 模型，特价/pool/企业多档位、多密钥，按预算自由搭配
        </p>

        {/* CTA 按钮 */}
        <div className='mt-10 flex flex-wrap items-center justify-center gap-3'>
          {auth.user ? (
            <Link
              to='/console'
              className='glass-btn-primary glass-shimmer inline-flex items-center gap-2 rounded-2xl px-8 py-3.5 text-[15px] font-semibold text-white'
            >
              进入控制台
              <ArrowRight className='size-4' />
            </Link>
          ) : (
            <button
              onClick={onSignUp}
              className='glass-btn-primary glass-shimmer inline-flex items-center gap-2 rounded-2xl px-8 py-3.5 text-[15px] font-semibold text-white'
            >
              🚀 免费开始
              <ArrowRight className='size-4' />
            </button>
          )}
          <Link
            to='/pricing'
            className='glass-btn glass-shimmer inline-flex items-center gap-2 rounded-2xl px-8 py-3.5 text-[15px] font-medium'
          >
            查看定价
            <ArrowUpRight className='size-4' />
          </Link>
        </div>

        {/* 实时汇率呼吸卡 */}
        <div className='mt-10 w-full max-w-md'>
          <ExchangeRateCard />
        </div>

        {/* 模型 badge 列 */}
        <div className='mt-12 flex flex-wrap items-center justify-center gap-2'>
          {[
            { label: 'Claude Code', tw: 'border-orange-500/25 bg-orange-500/10 text-orange-600/90 dark:text-orange-300/80' },
            { label: 'OpenAI Codex', tw: 'border-green-500/25 bg-green-500/10 text-green-600/90 dark:text-green-300/80' },
            { label: 'Gemini CLI', tw: 'border-blue-500/25 bg-blue-500/10 text-blue-600/90 dark:text-blue-300/80' },
            { label: 'GPT-4o', tw: 'border-indigo-500/25 bg-indigo-500/10 text-indigo-600/90 dark:text-indigo-300/80' },
            { label: 'DeepSeek', tw: 'border-violet-500/25 bg-violet-500/10 text-violet-600/90 dark:text-violet-300/80' },
            { label: '500+ 更多', tw: 'border-black/10 dark:border-white/10 bg-black/[0.04] dark:bg-white/[0.05] text-foreground/35' },
          ].map(b => (
            <span key={b.label} className={`rounded-xl border px-3.5 py-1 text-[12.5px] font-medium backdrop-blur-sm ${b.tw}`}>
              {b.label}
            </span>
          ))}
        </div>
      </div>

      {/* 底部渐隐 */}
      <div aria-hidden className='pointer-events-none absolute bottom-0 inset-x-0 h-40 bg-gradient-to-t from-background to-transparent' />
    </section>
  )
}

/* ─────────────────────────────────────────────────────────────────────
   双入口 — 移到最上面（Hero 之后）
   ───────────────────────────────────────────────────────────────────── */
function EntryCards() {
  return (
    <section className='relative px-4 pb-28 pt-4'>
      <div className='mx-auto max-w-5xl'>
        <div className='mb-12 text-center'>
          <p className='mb-3 text-[12px] font-semibold tracking-[0.18em] text-indigo-500/80 dark:text-indigo-400/80 uppercase'>选择您的入口</p>
          <h2 className='text-[clamp(1.8rem,4vw,2.8rem)] font-bold tracking-tight text-foreground'>
            个人 · 企业，各取所需
          </h2>
        </div>

        <div className='grid grid-cols-1 gap-5 md:grid-cols-2'>
          {/* 个人卡 */}
          <EntryCard
            icon={<User className='size-6 text-indigo-500 dark:text-indigo-300' />}
            iconBg='bg-indigo-500/15 ring-1 ring-indigo-500/30'
            glow='bg-indigo-600/10'
            accent='text-indigo-500 dark:text-indigo-400'
            dot='bg-indigo-500'
            borderHover='hover:border-indigo-500/30'
            title='个人开发者'
            desc='一个账号，畅享 Claude / GPT / Gemini / DeepSeek / Moonshot / MiniMax 等 40+ 家上游，月卡 / 按量灵活选择。'
            features={[
              'Claude Code / Codex / Gemini-CLI / Cursor / Cline 原生支持',
              '500+ 模型，一个密钥，无需多账号切换',
              '粘性会话调度 + 自动 CLI 配置',
              '月卡 · 按量计费 · 加油包 · 中国移动包月 任选',
            ]}
            cta='进入控制台'
            href='/console'
          />

          {/* 企业卡 */}
          <EntryCard
            icon={<Users className='size-6 text-sky-500 dark:text-sky-300' />}
            iconBg='bg-sky-500/15 ring-1 ring-sky-500/30'
            glow='bg-sky-600/10'
            accent='text-sky-500 dark:text-sky-400'
            dot='bg-sky-500'
            borderHover='hover:border-sky-500/30'
            title='企业团队'
            desc='工作区隔离、RBAC 权限、SSO 单点登录，满足团队协作与合规需求。'
            features={[
              '多工作区 · 组织层级 · 项目隔离',
              'RBAC 细粒度权限 + 小组配额管理',
              'SSO / OIDC / SAML / SCIM 企业集成',
              '审计日志 · 发票 · SLA 状态页',
            ]}
            cta='进入企业控制台'
            href='/console/enterprise'
          />
        </div>
      </div>
    </section>
  )
}

function EntryCard({
  icon, iconBg, glow, accent, dot, borderHover,
  title, desc, features, cta, href,
}: {
  icon: React.ReactNode; iconBg: string; glow: string; accent: string; dot: string; borderHover: string
  title: string; desc: string; features: string[]; cta: string; href: string
}) {
  return (
    <div className={`glass-card glass-shimmer group relative overflow-hidden rounded-3xl p-8 transition-all duration-300 ${borderHover} hover:-translate-y-1`}>
      {/* 彩色背景光晕 */}
      <div className={`aurora-orb absolute -right-12 -top-12 h-48 w-48 ${glow}`} style={{ filter: 'blur(48px)', animationDuration: '18s' }} />

      <div className='relative'>
        <div className={`mb-5 inline-flex size-12 items-center justify-center rounded-2xl ${iconBg}`}>
          {icon}
        </div>
        <h3 className='mb-2 text-[21px] font-bold text-foreground'>{title}</h3>
        <p className='mb-7 text-[14px] leading-relaxed text-foreground/50'>{desc}</p>

        <ul className='mb-8 space-y-2.5'>
          {features.map(f => (
            <li key={f} className='flex items-start gap-3 text-[13.5px] text-foreground/55'>
              <span className={`mt-[3px] size-1.5 shrink-0 rounded-full ${dot}`} />
              {f}
            </li>
          ))}
        </ul>

        <Link
          to={href}
          className={`glass-btn glass-shimmer inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-[13.5px] font-semibold ${accent}`}
        >
          {cta}
          <ArrowRight className='size-3.5 transition-transform group-hover:translate-x-0.5' />
        </Link>
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────
   统计数据条
   ───────────────────────────────────────────────────────────────────── */
function StatsBar() {
  const stats = [
    { value: '57+', label: '上游厂商' },
    { value: '500+', label: '可用模型' },
    { value: '99.95%', label: 'SLA' },
    { value: '<120ms', label: '路由延迟' },
    { value: '24/7', label: '稳定运行' },
  ]
  return (
    <section className='relative overflow-hidden py-10'>
      <div className='glass-card mx-auto max-w-4xl rounded-2xl px-6 py-6'>
        <div className='grid grid-cols-3 gap-6 md:grid-cols-5'>
          {stats.map(s => (
            <div key={s.label} className='flex flex-col items-center gap-1 text-center'>
              <span className='text-[1.75rem] font-bold text-foreground md:text-[2rem]'>{s.value}</span>
              <span className='text-[11px] font-medium tracking-wide text-foreground/35 uppercase'>{s.label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ─────────────────────────────────────────────────────────────────────
   核心特性 — 玻璃卡片网格
   ───────────────────────────────────────────────────────────────────── */
const FEATURES = [
  { icon: <Layers />, color: 'text-indigo-500 dark:text-indigo-400', bg: 'bg-indigo-500/12 ring-indigo-500/25', title: '三平台一键接入', desc: 'Claude Code、Codex、Gemini CLI 原生协议直通，无需修改代码，复制密钥即用。' },  { icon: <Globe />, color: 'text-sky-500 dark:text-sky-400', bg: 'bg-sky-500/12 ring-sky-500/25', title: '无需魔法上网', desc: '国内直连，稳定低延迟，无需代理，账号永不因封禁失效，国内团队首选。' },
  { icon: <Key />, color: 'text-violet-500 dark:text-violet-400', bg: 'bg-violet-500/12 ring-violet-500/25', title: '高可用调度', desc: '多密钥负载均衡 + 自动容灾调度，稳定不限流。' },
  { icon: <Zap />, color: 'text-amber-500 dark:text-amber-400', bg: 'bg-amber-500/12 ring-amber-500/25', title: '粘性会话调度', desc: '智能哈希保持对话上下文在同一节点，多轮对话不中断、不丢状态。' },
  { icon: <BarChart3 />, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-500/12 ring-emerald-500/25', title: '弹性计费方式', desc: '月卡、按量、加油包三选一，额度永久有效，按需付费无浪费。' },
  { icon: <Lock />, color: 'text-rose-500 dark:text-rose-400', bg: 'bg-rose-500/12 ring-rose-500/25', title: '企业级安全', desc: 'RBAC 细粒度权限、SSO 单点登录、完整审计日志，满足企业合规要求。' },
]

function Features() {
  return (
    <section className='relative px-4 py-24'>
      <AuroraBg />
      <div className='relative z-10 mx-auto max-w-6xl'>
        <div className='mb-14 text-center'>
          <p className='mb-3 text-[12px] font-semibold tracking-[0.18em] text-indigo-500/80 dark:text-indigo-400/80 uppercase'>核心优势</p>
          <h2 className='text-[clamp(1.8rem,4vw,2.8rem)] font-bold tracking-tight text-foreground'>为什么选择我们？</h2>
          <p className='mx-auto mt-4 max-w-lg text-[15px] text-foreground/45'>专为中国开发者打造，解决使用顶级 AI 编程工具的所有痛点</p>
        </div>

        <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3'>
          {FEATURES.map(f => (
            <div key={f.title} className='glass-card glass-shimmer group rounded-2xl p-6 transition-all duration-300 hover:-translate-y-1'>
              <div className={`mb-4 inline-flex size-10 items-center justify-center rounded-xl ring-1 [&_svg]:size-5 ${f.bg} ${f.color}`}>
                {f.icon}
              </div>
              <h3 className='mb-2 text-[15.5px] font-semibold text-foreground'>{f.title}</h3>
              <p className='text-[13.5px] leading-relaxed text-foreground/48'>{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ─────────────────────────────────────────────────────────────────────
   厂商跑马灯
   ───────────────────────────────────────────────────────────────────── */
const PROVIDERS = [
  'OpenAI', 'Anthropic', 'Google Gemini', 'Mistral', 'Meta Llama',
  'DeepSeek', 'xAI Grok', 'Azure OpenAI', 'AWS Bedrock',
  '月之暗面 Kimi', '智谱 GLM', '通义千问', '混元', '豆包',
  'MiniMax', '讯飞星火', 'Groq', 'Perplexity', 'Together AI',
  'Stability AI', 'Midjourney', 'Suno', 'Cloudflare AI',
]

function Marquee() {
  return (
    <section className='py-10'>
      <p className='mb-5 text-center text-[11px] font-medium tracking-[0.2em] text-foreground/22 uppercase'>兼容 57+ 主流模型协议 · 商标归各自所有者所有</p>
      <div className='marquee'>
        <div className='marquee__track'>
          {[...PROVIDERS, ...PROVIDERS].map((p, i) => (
            <span key={i} className='flex items-center gap-3 text-[13.5px] text-foreground/30 whitespace-nowrap'>
              <span className='size-[3px] rounded-full bg-indigo-500/50' aria-hidden />
              {p}
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ─────────────────────────────────────────────────────────────────────
   终章 CTA
   ───────────────────────────────────────────────────────────────────── */
function FinalCTA({ onSignUp }: { onSignUp: () => void }) {
  const { auth } = useAuthStore()
  return (
    <section className='relative overflow-hidden px-4 py-32'>
      <AuroraBg />
      <div className='relative z-10 mx-auto max-w-2xl text-center'>
        <h2 className='text-[clamp(2.2rem,6vw,4rem)] font-bold leading-[1.1] tracking-tight'>
          <span className='bg-gradient-to-b from-foreground/90 to-foreground/65 dark:from-white dark:to-white/70 bg-clip-text text-transparent'>立即开始，</span>
          <span className='bg-gradient-to-r from-indigo-500 to-sky-500 dark:from-indigo-400 dark:to-sky-400 bg-clip-text text-transparent'>首次免费</span>
        </h2>
        <p className='mx-auto mt-5 max-w-md text-[15.5px] leading-relaxed text-foreground/45'>
          两分钟完成注册，一行命令接入，<br />
          Claude Code / Codex / Gemini CLI 全部可用。
        </p>

        <div className='mt-10 flex flex-wrap items-center justify-center gap-3'>
          {auth.user ? (
            <Link
              to='/console'
              className='glass-btn-primary glass-shimmer inline-flex items-center gap-2 rounded-2xl px-9 py-4 text-[15px] font-semibold text-white'
            >
              进入控制台
              <ArrowRight className='size-4' />
            </Link>
          ) : (
            <button
              onClick={onSignUp}
              className='glass-btn-primary glass-shimmer inline-flex items-center gap-2 rounded-2xl px-9 py-4 text-[15px] font-semibold text-white'
            >
              🚀 免费注册
              <ArrowRight className='size-4' />
            </button>
          )}
          <Link
            to='/doc'
            className='glass-btn glass-shimmer inline-flex items-center gap-2 rounded-2xl px-9 py-4 text-[15px] font-medium'
          >
            查看接入文档
            <ArrowUpRight className='size-4' />
          </Link>
        </div>

        <p className='mt-6 text-[12px] text-foreground/25'>无需信用卡 · 无需代理 · 注册即可使用</p>
      </div>
    </section>
  )
}

/* ─────────────────────────────────────────────────────────────────────
   页面入口
   ───────────────────────────────────────────────────────────────────── */
export function LandingPage() {
  const [authModal, setAuthModal] = useState<{ open: boolean; tab: AuthTab }>({
    open: false,
    tab: 'sign-in',
  })

  const openSignIn = () => setAuthModal({ open: true, tab: 'sign-in' })
  const openSignUp = () => setAuthModal({ open: true, tab: 'sign-up' })

  return (
    <div className='relative min-h-svh overflow-x-clip bg-background text-foreground'>
      <Nav onSignIn={openSignIn} onSignUp={openSignUp} />
      <main>
        <Hero onSignUp={openSignUp} />
        <EntryCards />
        <StatsBar />
        <SubscriptionPackages onSignUp={openSignUp} />
        <SmartRelayShowcase />
        <Features />
        <Marquee />
        <FinalCTA onSignUp={openSignUp} />
      </main>
      <Footer />

      <AuthModal
        open={authModal.open}
        tab={authModal.tab}
        onTabChange={(tab) => setAuthModal((prev) => ({ ...prev, tab }))}
        onOpenChange={(open) => setAuthModal((prev) => ({ ...prev, open }))}
      />
    </div>
  )
}
