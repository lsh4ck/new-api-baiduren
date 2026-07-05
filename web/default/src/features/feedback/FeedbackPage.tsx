import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { ArrowRight, MessageCircle, Send, LogIn } from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth-store'
import { api } from '@/lib/api'
import { PublicLayout } from '@/components/layout'

export function FeedbackPage() {
  const user = useAuthStore((s) => s.auth?.user)
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [contact, setContact] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  const handleSubmit = async () => {
    if (!subject.trim()) return toast.error('请填写主题')
    if (!message.trim()) return toast.error('请填写正文')
    setSubmitting(true)
    try {
      const res = await api.post('/api/user/feedback', { subject, message, contact })
      if (res.data?.success) {
        toast.success('反馈已提交，我们会尽快回复')
        setDone(true)
      } else {
        toast.error(res.data?.message || '提交失败')
      }
    } catch {
      toast.error('提交失败，请稍后重试')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <PublicLayout>
      <div className='mx-auto max-w-2xl px-4 py-12 sm:py-20'>
        <div className='mb-8 text-center'>
          <div className='inline-flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-white shadow-lg shadow-indigo-500/30'>
            <MessageCircle className='size-7' />
          </div>
          <h1 className='mt-4 text-3xl font-bold sm:text-4xl'>反馈 / 联系我们</h1>
          <p className='mt-3 text-sm text-foreground/55'>
            遇到问题、功能建议、商务合作，都可以在这里告诉我们
            <br className='hidden sm:inline' />
            <span className='text-foreground/35'>反馈会直接发送到管理员邮箱，48 小时内回复</span>
          </p>
        </div>

        {!user ? (
          <div className='rounded-2xl border bg-gradient-to-br from-indigo-500/10 to-fuchsia-500/5 p-8 text-center'>
            <LogIn className='mx-auto mb-3 size-9 text-indigo-500' />
            <h2 className='text-lg font-bold'>请先登录或注册</h2>
            <p className='mt-2 text-sm text-foreground/55'>
              为防止匿名刷反馈，我们要求登录后才能提交。
              <br />
              注册免费，30 秒搞定。
            </p>
            <div className='mt-5 flex flex-wrap items-center justify-center gap-2'>
              <Link
                to='/login'
                search={{ next: '/feedback' }}
                className='inline-flex items-center gap-1.5 rounded-xl bg-foreground px-5 py-2.5 text-sm font-semibold text-background hover:opacity-90 transition-opacity'
              >
                登录 / 注册 <ArrowRight className='size-4' />
              </Link>
            </div>
          </div>
        ) : done ? (
          <div className='rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-8 text-center'>
            <div className='mx-auto mb-3 inline-flex size-12 items-center justify-center rounded-full bg-emerald-500/15'>
              <Send className='size-6 text-emerald-600 dark:text-emerald-400' />
            </div>
            <h2 className='text-lg font-bold text-emerald-700 dark:text-emerald-300'>已提交</h2>
            <p className='mt-2 text-sm text-foreground/65'>
              管理员已收到邮件通知，将在 48 小时内回复到你的注册邮箱
            </p>
            <button
              type='button'
              onClick={() => { setDone(false); setSubject(''); setMessage(''); setContact('') }}
              className='mt-4 text-xs text-foreground/45 underline hover:text-foreground/70'
            >
              再提交一条
            </button>
          </div>
        ) : (
          <div className='space-y-4 rounded-2xl border bg-background/40 p-5 sm:p-6 backdrop-blur-sm'>
            <div className='rounded-lg bg-foreground/5 p-3 text-xs text-foreground/55'>
              当前以 <b className='font-mono text-foreground/85'>{user.username}</b>
              （{user.email || '未绑定邮箱'}）身份提交。回复会发到这个邮箱。
            </div>
            <div>
              <label className='mb-1.5 block text-sm font-medium'>主题 *</label>
              <input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder='一句话概括，比如：xxx 模型调用失败'
                maxLength={200}
                className='w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500/30'
              />
              <div className='mt-0.5 text-right text-[10px] text-foreground/40'>
                {subject.length} / 200
              </div>
            </div>
            <div>
              <label className='mb-1.5 block text-sm font-medium'>正文 *</label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder='详细描述：什么场景 / 报错信息 / 已尝试的方案 / 期望效果...&#10;如有报错截图或 request_id 可一并贴上'
                maxLength={5000}
                rows={8}
                className='w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500/30'
              />
              <div className='mt-0.5 text-right text-[10px] text-foreground/40'>
                {message.length} / 5000
              </div>
            </div>
            <div>
              <label className='mb-1.5 block text-sm font-medium'>
                额外联系方式（可选）
              </label>
              <input
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                placeholder='微信 / TG / 备用邮箱（默认回复到注册邮箱）'
                maxLength={200}
                className='w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500/30'
              />
            </div>
            <button
              type='button'
              onClick={handleSubmit}
              disabled={submitting}
              className='inline-flex w-full items-center justify-center gap-2 rounded-xl bg-foreground px-5 py-3 text-sm font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-50'
            >
              <Send className='size-4' />
              {submitting ? '提交中…' : '提交反馈'}
            </button>
            <p className='text-[11px] text-foreground/40 text-center'>
              管理员会在 48 小时内回复到你的注册邮箱（{user.email || '需先绑定邮箱'}）
            </p>
          </div>
        )}

        <div className='mt-8 grid grid-cols-2 gap-3 text-center text-xs'>
          <div className='rounded-xl border bg-background/30 p-3'>
            <div className='font-bold text-foreground/70'>📧 邮箱</div>
            <div className='mt-1 font-mono text-foreground/55'>support@zhuanzhuan.pw</div>
          </div>
          <div className='rounded-xl border bg-background/30 p-3'>
            <div className='font-bold text-foreground/70'>💬 微信</div>
            <div className='mt-1 font-mono text-foreground/55'>lsh4ck（备注摆渡人）</div>
          </div>
        </div>
      </div>
    </PublicLayout>
  )
}
