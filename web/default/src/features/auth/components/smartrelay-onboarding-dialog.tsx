import { useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Sparkles, Layers, ArrowRight } from 'lucide-react'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'

/**
 * 摆渡人智能 / SmartRelay 使用引导弹窗（一次性，每客户一次，跨设备）。
 * - 标记存服务端 user.setting.onboarding_smartrelay_seen（任意一次关闭即写入）。
 * - 登录后若未看过、且没有待补资料弹窗，则展示一次。
 */
export function SmartRelayOnboardingDialog() {
  const user = useAuthStore((s) => s.auth.user)
  const setUser = useAuthStore((s) => s.auth.setUser)
  const navigate = useNavigate()
  const [dismissed, setDismissed] = useState(false)
  const [busy, setBusy] = useState(false)

  const settingObj = useMemo<Record<string, unknown>>(() => {
    const s = user?.setting
    if (!s) return {}
    if (typeof s === 'string') {
      try {
        return JSON.parse(s) as Record<string, unknown>
      } catch {
        return {}
      }
    }
    return s as Record<string, unknown>
  }, [user?.setting])

  const seen = Boolean(settingObj.onboarding_smartrelay_seen)
  const open = Boolean(
    user && !user.require_profile_setup && !seen && !dismissed
  )

  const handleClose = async (goExperience: boolean) => {
    setBusy(true)
    setDismissed(true)
    try {
      await api.put('/api/user/onboarding-seen')
      if (user) {
        setUser({
          ...user,
          setting: { ...settingObj, onboarding_smartrelay_seen: true },
        })
      }
    } catch {
      // 写入失败也已本地关闭，不阻塞用户；下次登录会再拉一次 setting
    } finally {
      setBusy(false)
      if (goExperience) navigate({ to: '/pricing' })
    }
  }

  if (!open) return null

  return (
    <Dialog open={true}>
      <DialogContent
        className='gap-0 overflow-hidden p-0 sm:max-w-lg'
        onEscapeKeyDown={() => handleClose(false)}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        {/* 顶部品牌渐变条 */}
        <div className='relative isolate overflow-hidden bg-gradient-to-br from-emerald-500/15 via-teal-500/10 to-sky-500/15 px-7 pb-6 pt-7'>
          <div className='pointer-events-none absolute -right-16 -top-20 size-56 rounded-full bg-emerald-400/25 blur-3xl' />
          <div className='relative'>
            <span className='inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold tracking-wide text-emerald-600 dark:text-emerald-300'>
              <Sparkles className='size-3.5' /> 新功能上线
            </span>
            <h2 className='mt-3.5 text-[26px] font-extrabold leading-tight tracking-tight'>
              让网关替你{' '}
              <span className='bg-gradient-to-r from-emerald-500 to-sky-500 bg-clip-text text-transparent'>
                选模型 · 省 Token
              </span>
            </h2>
            <p className='mt-2 text-sm leading-relaxed text-muted-foreground'>
              两个开箱即用的能力,帮你少花钱、少操心 —— 看一眼怎么用
            </p>
          </div>
        </div>

        {/* 内容 */}
        <div className='space-y-3 px-7 py-5'>
          <div className='flex items-start gap-3.5 rounded-xl border bg-card/40 p-3.5'>
            <span className='grid size-10 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-emerald-500/20 to-sky-500/10 text-emerald-500'>
              <Sparkles className='size-5' />
            </span>
            <div className='min-w-0'>
              <h3 className='text-[15px] font-bold'>摆渡人智能选模</h3>
              <p className='mt-1 text-[13px] leading-relaxed text-muted-foreground'>
                按任务难度自动挑最划算的模型:简单任务用便宜模型、高难开发用顶级模型,
                <span className='font-medium text-foreground'>按实际模型计费</span>。
              </p>
            </div>
          </div>

          <div className='flex items-start gap-3.5 rounded-xl border bg-card/40 p-3.5'>
            <span className='grid size-10 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-fuchsia-500/20 to-sky-500/10 text-fuchsia-500'>
              <Layers className='size-5' />
            </span>
            <div className='min-w-0 flex-1'>
              <div className='flex items-center justify-between gap-2'>
                <h3 className='text-[15px] font-bold'>SmartRelay 4 层优化</h3>
                <span className='shrink-0 rounded-md bg-emerald-500/15 px-2 py-0.5 text-xs font-bold text-emerald-600 dark:text-emerald-400'>
                  省 30-50%
                </span>
              </div>
              <p className='mt-1 text-[13px] leading-relaxed text-muted-foreground'>
                响应缓存 · 上下文压缩 · 上游缓存优化 · 工具截断,后台默默工作,无需配置。
              </p>
            </div>
          </div>

          {/* 用法 */}
          <div className='rounded-xl border border-emerald-500/25 bg-emerald-500/[0.06] p-4'>
            <div className='mb-2.5 text-xs font-semibold tracking-wide text-emerald-600 dark:text-emerald-400'>
              ▸ 智能选模怎么用 —— 只改一个字段
            </div>
            <pre className='overflow-x-auto rounded-lg border border-emerald-500/20 bg-background/70 px-3.5 py-3 font-mono text-[13px] leading-relaxed'>
              <code>
                <span className='text-muted-foreground'>"model"</span>:{' '}
                <span className='font-bold text-fuchsia-500'>"bdr-auto"</span>
                <span className='text-muted-foreground'>
                  {'   '}// 或 "摆渡人智能"
                </span>
              </code>
            </pre>
            <p className='mt-2.5 text-[12.5px] leading-relaxed text-muted-foreground'>
              其余跟平常调用一模一样。系统自动分类任务 → 选最佳模型 →
              按实际跑的模型计费。SmartRelay 则对所有请求自动生效。
            </p>
          </div>
        </div>

        {/* 底部 */}
        <div className='flex items-center justify-end gap-2.5 border-t bg-muted/30 px-7 py-4'>
          <Button variant='ghost' disabled={busy} onClick={() => handleClose(false)}>
            知道了
          </Button>
          <Button
            disabled={busy}
            onClick={() => handleClose(true)}
            className='gap-1.5 bg-gradient-to-r from-emerald-500 to-teal-500 text-white hover:opacity-90'
          >
            去模型广场体验 <ArrowRight className='size-4' />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
