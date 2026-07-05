import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useSystemConfig } from '@/hooks/use-system-config'
import { Skeleton } from '@/components/ui/skeleton'

type AuthLayoutProps = {
  children: React.ReactNode
}

export function AuthLayout({ children }: AuthLayoutProps) {
  const { t } = useTranslation()
  const { systemName, logo, loading } = useSystemConfig()

  return (
    <div className='auth-page-bg relative min-h-svh overflow-hidden'>
      {/* Aurora orbs */}
      <div className='pointer-events-none absolute inset-0'>
        <div
          className='aurora-orb auth-aurora-indigo absolute h-[560px] w-[560px]'
          style={{ left: '-6%', top: '4%', animationDuration: '22s' }}
        />
        <div
          className='aurora-orb aurora-orb-2 auth-aurora-violet absolute h-[460px] w-[460px]'
          style={{ right: '-2%', bottom: '10%' }}
        />
        <div
          className='aurora-orb aurora-orb-3 auth-aurora-sky absolute h-[380px] w-[380px]'
          style={{ left: '40%', top: '48%' }}
        />
      </div>

      {/* Noise texture */}
      <div
        className='pointer-events-none absolute inset-0 opacity-[0.22] dark:opacity-[0.12] mix-blend-multiply dark:mix-blend-screen'
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.4'/%3E%3C/svg%3E\")",
        }}
      />

      {/* Logo — top left */}
      <Link
        to='/'
        className='absolute top-6 left-8 z-10 flex items-center gap-2.5 transition-opacity hover:opacity-75'
      >
        <div className='relative size-8 shrink-0'>
          {loading ? (
            <Skeleton className='absolute inset-0 rounded-lg' />
          ) : (
            <img src={logo} alt={t('Logo')} className='size-8 rounded-lg object-cover' />
          )}
        </div>
        {loading ? (
          <Skeleton className='h-5 w-24' />
        ) : (
          <span className='text-sm font-semibold tracking-tight'>{systemName}</span>
        )}
      </Link>

      {/* Centered glass card */}
      <div className='relative z-10 flex min-h-svh flex-col items-center justify-center px-4 py-20'>
        <div className='auth-glass-card w-full max-w-[440px] px-8 py-10'>
          {children}
        </div>
        {/* 独立中转 · 品牌无隶属免责声明（降低钓鱼误判） */}
        <p className='text-muted-foreground/45 mt-6 max-w-[440px] text-center text-[11px] leading-relaxed'>
          {t('affiliationDisclaimer', {
            name: systemName,
            defaultValue:
              '{{name}} 是独立的第三方 API 聚合中转服务，与 OpenAI、Anthropic、Google 等公司无隶属或合作关系；所提及的各商标归其各自所有者所有。',
          })}
        </p>
      </div>
    </div>
  )
}
