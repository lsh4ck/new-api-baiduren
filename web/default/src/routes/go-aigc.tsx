import { createFileRoute } from '@tanstack/react-router'
import { useEffect } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { api } from '@/lib/api'

/**
 * NewAPI → 唐伯虎AIGC 的 SSO 跳板页。
 * 已登录:取后端签名的 SSO 链接(免注册免登录)→ 跳 AIGC;
 * 未登录:直接跳 AIGC 普通登录页(带 from=newapi 提示)。
 */
const AIGC_FALLBACK = 'https://aigc.apiai.xin/login?from=newapi'

export const Route = createFileRoute('/go-aigc')({
  component: GoAigc,
})

function GoAigc() {
  useEffect(() => {
    const user = useAuthStore.getState().auth.user
    if (!user) {
      window.location.replace(AIGC_FALLBACK)
      return
    }
    api
      .get('/api/user/aigc-sso')
      .then((res) => {
        window.location.replace(res.data?.url || AIGC_FALLBACK)
      })
      .catch(() => {
        window.location.replace(AIGC_FALLBACK)
      })
  }, [])

  return (
    <div className='grid min-h-svh place-items-center bg-background'>
      <div className='flex flex-col items-center gap-3 text-center'>
        <span className='inline-block size-6 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent' />
        <p className='text-sm text-foreground/60'>正在登录唐伯虎AIGC…</p>
      </div>
    </div>
  )
}
