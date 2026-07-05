import { useEffect, useState } from 'react'
import { Megaphone, Send, CheckCircle2, Clock, XCircle } from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { toast } from 'sonner'

type SalesApplication = {
  id: number
  user_id: number
  inviter_id: number
  proposed_level: number
  real_name: string
  phone: string
  wechat_id: string
  sales_channel: string
  reason: string
  status: 'pending' | 'approved' | 'rejected'
  admin_remark: string
  reviewed_by_name: string
  reviewed_at: number
  created_at: number
}

const STATUS_META: Record<
  string,
  { label: string; class: string; Icon: React.ComponentType<{ className?: string }> }
> = {
  pending: {
    label: '待审批',
    class: 'bg-amber-500/20 text-amber-700 dark:text-amber-400',
    Icon: Clock,
  },
  approved: {
    label: '已通过',
    class: 'bg-green-500/20 text-green-700 dark:text-green-400',
    Icon: CheckCircle2,
  },
  rejected: {
    label: '已拒绝',
    class: 'bg-red-500/20 text-red-700 dark:text-red-400',
    Icon: XCircle,
  },
}

export function SalesApplicationCard() {
  const user = useAuthStore((s) => s.auth.user)
  const isAlreadySales = (user?.agent_level ?? 0) > 0
  const [app, setApp] = useState<SalesApplication | null>(null)
  const [loading, setLoading] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState({
    real_name: '',
    phone: '',
    wechat_id: '',
    sales_channel: '',
    reason: '',
  })
  const [submitting, setSubmitting] = useState(false)

  const loadStatus = async () => {
    if (isAlreadySales) return
    setLoading(true)
    try {
      const res = await api.get('/api/user/agent/apply/self')
      if (res.data?.success) setApp(res.data.data)
    } catch (_e) {
      // 静默
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadStatus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSubmit = async () => {
    if (!form.real_name.trim() || !form.phone.trim()) {
      toast.error('姓名和手机号必填')
      return
    }
    setSubmitting(true)
    try {
      const res = await api.post('/api/user/agent/apply', form)
      if (res.data?.success) {
        toast.success('申请已提交，等待审批')
        setDialogOpen(false)
        loadStatus()
      } else {
        toast.error(res.data?.message || '提交失败')
      }
    } catch (e: any) {
      toast.error(e?.response?.data?.message || '提交失败')
    } finally {
      setSubmitting(false)
    }
  }

  // 已是销售身份 → 不显示申请入口
  if (isAlreadySales) return null

  const statusMeta = app ? STATUS_META[app.status] : null

  return (
    <Card>
      <CardHeader>
        <CardTitle className='flex items-center gap-2 text-base'>
          <Megaphone className='size-4 text-amber-500' />
          销售代理身份
        </CardTitle>
      </CardHeader>
      <CardContent className='space-y-4'>
        {!app && !loading && (
          <>
            <p className='text-muted-foreground text-sm leading-relaxed'>
              申请成为销售代理后，你邀请的客户充值你能拿到 3%~5% 提成，
              <br />
              发展下级销售后可享受 1% 穿透抽成。三级到顶。
            </p>
            <Button
              size='sm'
              onClick={() => setDialogOpen(true)}
              className='gap-2'
            >
              <Send className='size-4' />
              申请销售代理
            </Button>
          </>
        )}

        {app && statusMeta && (
          <>
            <div className='flex items-center gap-3'>
              <Badge className={statusMeta.class}>
                <statusMeta.Icon className='mr-1 size-3' />
                {statusMeta.label}
              </Badge>
              <span className='text-muted-foreground text-xs'>
                提交于{' '}
                {new Date(app.created_at * 1000).toLocaleString('zh-CN', {
                  hour12: false,
                })}
              </span>
            </div>

            <div className='text-muted-foreground space-y-1 text-sm'>
              <div>
                姓名：<span className='text-foreground'>{app.real_name}</span>
              </div>
              <div>
                手机：<span className='text-foreground'>{app.phone}</span>
              </div>
              {app.wechat_id && (
                <div>
                  微信：<span className='text-foreground'>{app.wechat_id}</span>
                </div>
              )}
              {app.sales_channel && (
                <div>
                  推广平台：
                  <span className='text-foreground'>{app.sales_channel}</span>
                </div>
              )}
              <div>
                预计级别：
                <Badge variant='outline' className='ml-1'>
                  L{app.proposed_level}
                </Badge>
              </div>
            </div>

            {app.status === 'rejected' && app.admin_remark && (
              <Alert variant='destructive'>
                <AlertDescription>
                  拒绝原因：{app.admin_remark}
                </AlertDescription>
              </Alert>
            )}
            {app.status === 'approved' && (
              <Alert>
                <AlertDescription>
                  你已通过销售身份审核，前往「推广中心」查看你的佣金与下属。
                </AlertDescription>
              </Alert>
            )}

            {app.status === 'rejected' && (
              <Button
                size='sm'
                variant='outline'
                onClick={() => {
                  setApp(null)
                  setDialogOpen(true)
                }}
              >
                重新申请
              </Button>
            )}
          </>
        )}
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className='sm:max-w-lg'>
          <DialogHeader>
            <DialogTitle>申请销售代理身份</DialogTitle>
            <DialogDescription>
              填写资料后等待审核。审核通过后你将获得佣金提成资格。
            </DialogDescription>
          </DialogHeader>

          <div className='grid gap-3 py-2'>
            <div className='grid gap-1.5'>
              <Label htmlFor='sa-real_name'>
                姓名 <span className='text-red-500'>*</span>
              </Label>
              <Input
                id='sa-real_name'
                value={form.real_name}
                onChange={(e) =>
                  setForm({ ...form, real_name: e.target.value })
                }
                placeholder='你的真实姓名'
              />
            </div>
            <div className='grid gap-1.5'>
              <Label htmlFor='sa-phone'>
                手机号 <span className='text-red-500'>*</span>
              </Label>
              <Input
                id='sa-phone'
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder='常用手机号，方便联系'
              />
            </div>
            <div className='grid gap-1.5'>
              <Label htmlFor='sa-wechat'>微信号</Label>
              <Input
                id='sa-wechat'
                value={form.wechat_id}
                onChange={(e) =>
                  setForm({ ...form, wechat_id: e.target.value })
                }
                placeholder='可选，方便快速沟通'
              />
            </div>
            <div className='grid gap-1.5'>
              <Label htmlFor='sa-channel'>主推平台</Label>
              <Input
                id='sa-channel'
                value={form.sales_channel}
                onChange={(e) =>
                  setForm({ ...form, sales_channel: e.target.value })
                }
                placeholder='如 抖音 / 公众号 / X / V2EX / Telegram 群'
              />
            </div>
            <div className='grid gap-1.5'>
              <Label htmlFor='sa-reason'>申请话术</Label>
              <Textarea
                id='sa-reason'
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
                placeholder='简单说明你的客户群、为什么想做销售'
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant='outline'
              onClick={() => setDialogOpen(false)}
              disabled={submitting}
            >
              取消
            </Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? '提交中…' : '提交申请'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
