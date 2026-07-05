import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { getSelf } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { initialProfileSetup } from '../api'
import { useEmailVerification } from '../hooks/use-email-verification'

const AUTOGEN_RE = /^(wechat|github|discord|oidc|linuxdo)_\d+$/

/**
 * 强制绑定邮箱（不可关闭），密码可选（可跳过）。
 * - 邮箱缺失       → 必填邮箱 + 验证码，密码可选填（密码可跳过）
 * - 邮箱+密码都缺   → 同上：邮箱必填，密码可选填
 * - 仅缺密码       → 不弹窗（require_profile_setup 后端只在缺邮箱时为 true）
 */
export function InitialProfileSetupDialog() {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.auth.user)
  const setUser = useAuthStore((s) => s.auth.setUser)

  const open = Boolean(user && user.require_profile_setup)
  const missingEmail = Boolean(user?.profile_setup_missing?.email)
  const missingPassword = Boolean(user?.profile_setup_missing?.password)
  const autogenUsername = AUTOGEN_RE.test(user?.username || '')
  const showUsername = autogenUsername // 自动生成的用户名才让用户改

  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [wantPassword, setWantPassword] = useState(false) // 用户是否选择顺便设密码
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const { isSending, secondsLeft, isActive, sendCode } = useEmailVerification()

  useEffect(() => {
    if (open && user) {
      setUsername(autogenUsername ? '' : user.username || '')
      setEmail(user.email || '')
      setCode('')
      setWantPassword(false)
      setPassword('')
      setConfirmPassword('')
    }
  }, [open, user, autogenUsername])

  const handleSendCode = async () => {
    if (!email.trim()) {
      toast.error('请先填写邮箱')
      return
    }
    await sendCode(email.trim())
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (showUsername && !username.trim()) {
      toast.error('请填写用户名')
      return
    }
    if (missingEmail) {
      if (!email.trim()) {
        toast.error('请填写邮箱')
        return
      }
      if (!code.trim()) {
        toast.error('请填写邮箱验证码')
        return
      }
    }
    // 密码可选：只有用户主动选择"顺便设置密码"才校验
    const shouldSetPassword = missingPassword && wantPassword
    if (shouldSetPassword) {
      if (password.length < 6) {
        toast.error('密码至少 6 位')
        return
      }
      if (password !== confirmPassword) {
        toast.error('两次密码不一致')
        return
      }
    }

    setIsSubmitting(true)
    try {
      const res = await initialProfileSetup({
        username: showUsername ? username.trim() : (user?.username || ''),
        email: missingEmail ? email.trim() : (user?.email || ''),
        verification_code: missingEmail ? code.trim() : '',
        password: shouldSetPassword ? password : '',
      })
      if (res?.success) {
        toast.success('资料补完成功')
        const fresh = await getSelf()
        if (fresh?.success && fresh.data) {
          setUser(fresh.data)
        } else if (user) {
          setUser({ ...user, require_profile_setup: false })
        }
      } else {
        toast.error(res?.message || '补完失败')
      }
    } catch (_e) {
      toast.error('补完失败，请稍后重试')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!open) return null

  const dialogTitle = '绑定邮箱'
  const dialogDesc = '为了账号安全和密码找回，请绑定一个邮箱。' +
    (missingPassword ? '密码可以一起设置（可选），后续也可在「个人中心」补设。' : '')

  return (
    <Dialog open={true}>
      <DialogContent
        className='sm:max-w-md'
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{dialogTitle}</DialogTitle>
          <DialogDescription>{dialogDesc}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className='space-y-3'>
          {showUsername && (
            <div className='space-y-1.5'>
              <Label htmlFor='ips-username'>{t('Username')}</Label>
              <Input
                id='ips-username'
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder='your-username'
                maxLength={30}
                autoComplete='username'
                required
              />
            </div>
          )}

          {missingEmail && (
            <>
              <div className='space-y-1.5'>
                <Label htmlFor='ips-email'>{t('Email')}</Label>
                <div className='flex gap-2'>
                  <Input
                    id='ips-email'
                    type='email'
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder='you@example.com'
                    autoComplete='email'
                    required
                  />
                  <Button
                    type='button'
                    variant='outline'
                    onClick={handleSendCode}
                    disabled={isSending || isActive}
                    className='shrink-0'
                  >
                    {isActive ? `${secondsLeft}s` : isSending ? '发送中...' : '发送验证码'}
                  </Button>
                </div>
              </div>

              <div className='space-y-1.5'>
                <Label htmlFor='ips-code'>{t('Verification Code')}</Label>
                <Input
                  id='ips-code'
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder='6 位验证码'
                  maxLength={6}
                  required
                />
              </div>
            </>
          )}

          {!missingEmail && user?.email && (
            <div className='bg-muted/40 rounded-md border px-3 py-2 text-xs'>
              当前已绑定邮箱：<span className='font-medium'>{user.email}</span>
            </div>
          )}

          {missingPassword && (
            <div className='space-y-3 rounded-lg border bg-muted/30 p-3'>
              <div className='flex items-start justify-between gap-3'>
                <div className='text-xs'>
                  <div className='font-medium'>顺便设置一个登录密码？</div>
                  <div className='text-muted-foreground mt-0.5'>
                    可选。设置后可以用账号密码登录，不必每次扫码。
                  </div>
                </div>
                <Button
                  type='button'
                  size='sm'
                  variant={wantPassword ? 'default' : 'outline'}
                  onClick={() => setWantPassword(!wantPassword)}
                >
                  {wantPassword ? '不设置' : '设置密码'}
                </Button>
              </div>
              {wantPassword && (
                <>
                  <div className='space-y-1.5'>
                    <Label htmlFor='ips-password'>{t('Password')}</Label>
                    <Input
                      id='ips-password'
                      type='password'
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder='6-32 位'
                      minLength={6}
                      maxLength={32}
                      autoComplete='new-password'
                    />
                  </div>
                  <div className='space-y-1.5'>
                    <Label htmlFor='ips-password2'>
                      {t('Confirm Password')}
                    </Label>
                    <Input
                      id='ips-password2'
                      type='password'
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder='再输入一次'
                      minLength={6}
                      maxLength={32}
                      autoComplete='new-password'
                    />
                  </div>
                </>
              )}
            </div>
          )}

          <Button type='submit' className='w-full' disabled={isSubmitting}>
            {isSubmitting ? '提交中...' : '提交并继续'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
