import { useEffect, useState } from 'react'
import { RefreshCw, Check, X } from 'lucide-react'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

type SalesApplication = {
  id: number
  user_id: number
  user_name: string
  user_email: string
  user_display_name: string
  inviter_id: number
  inviter_name?: string
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

const STATUS_CLASS: Record<string, string> = {
  pending: 'bg-amber-500/20 text-amber-700 dark:text-amber-400',
  approved: 'bg-green-500/20 text-green-700 dark:text-green-400',
  rejected: 'bg-red-500/20 text-red-700 dark:text-red-400',
}
const STATUS_LABEL: Record<string, string> = {
  pending: '待审批',
  approved: '已通过',
  rejected: '已拒绝',
}

function LevelBadge({ level }: { level: number }) {
  if (level === 1)
    return (
      <Badge className='bg-blue-500/20 text-blue-700 dark:text-blue-400'>
        L1
      </Badge>
    )
  if (level === 2)
    return (
      <Badge className='bg-yellow-500/20 text-yellow-700 dark:text-yellow-400'>
        L2
      </Badge>
    )
  if (level === 3)
    return (
      <Badge className='bg-purple-500/20 text-purple-700 dark:text-purple-400'>
        L3
      </Badge>
    )
  return <Badge variant='secondary'>—</Badge>
}

export function ApplicationsTab() {
  const [list, setList] = useState<SalesApplication[]>([])
  const [loading, setLoading] = useState(false)
  const [statusFilter, setStatusFilter] = useState<string>('pending')
  const [total, setTotal] = useState(0)
  const [reviewing, setReviewing] = useState<SalesApplication | null>(null)
  const [reviewAction, setReviewAction] = useState<'approve' | 'reject'>(
    'approve'
  )
  const [adminRemark, setAdminRemark] = useState('')
  const [overrideLevel, setOverrideLevel] = useState<number>(0)
  const [submitting, setSubmitting] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const url = `/api/admin/agents/applications?page=1&size=100${
        statusFilter ? `&status=${statusFilter}` : ''
      }`
      const res = await api.get(url)
      if (res.data?.success) {
        setList(res.data.data ?? [])
        setTotal(res.data.total ?? 0)
      }
    } catch (_e) {
      toast.error('加载申请失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter])

  const openReview = (app: SalesApplication, action: 'approve' | 'reject') => {
    setReviewing(app)
    setReviewAction(action)
    setAdminRemark('')
    setOverrideLevel(0)
  }

  const submitReview = async () => {
    if (!reviewing) return
    setSubmitting(true)
    try {
      const res = await api.post(
        `/api/agent/applications/${reviewing.id}/review`,
        {
          action: reviewAction,
          admin_remark: adminRemark,
          override_level: overrideLevel,
        }
      )
      if (res.data?.success) {
        toast.success(reviewAction === 'approve' ? '已通过' : '已拒绝')
        setReviewing(null)
        load()
      } else {
        toast.error(res.data?.message || '审批失败')
      }
    } catch (e: any) {
      toast.error(e?.response?.data?.message || '审批失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className='space-y-4'>
      <div className='flex items-center justify-between gap-2'>
        <div className='flex items-center gap-2'>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className='w-32'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='pending'>待审批</SelectItem>
              <SelectItem value='approved'>已通过</SelectItem>
              <SelectItem value='rejected'>已拒绝</SelectItem>
              <SelectItem value='all'>全部</SelectItem>
            </SelectContent>
          </Select>
          <span className='text-muted-foreground text-sm'>共 {total} 条</span>
        </div>
        <Button
          size='sm'
          variant='outline'
          onClick={load}
          disabled={loading}
        >
          <RefreshCw className={cn('mr-2 size-4', loading && 'animate-spin')} />
          刷新
        </Button>
      </div>

      {list.length === 0 && !loading && (
        <Alert>
          <AlertDescription>暂无申请</AlertDescription>
        </Alert>
      )}

      {list.length > 0 && (
        <div className='rounded-lg border overflow-hidden'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>状态</TableHead>
                <TableHead>用户</TableHead>
                <TableHead>申请人姓名</TableHead>
                <TableHead>手机/微信</TableHead>
                <TableHead>主推平台</TableHead>
                <TableHead>邀请人</TableHead>
                <TableHead>预计 Level</TableHead>
                <TableHead>提交时间</TableHead>
                <TableHead className='text-right'>操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map((app) => (
                <TableRow key={app.id}>
                  <TableCell>
                    <Badge className={STATUS_CLASS[app.status]}>
                      {STATUS_LABEL[app.status]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className='font-medium'>{app.user_name}</div>
                    <div className='text-muted-foreground text-xs'>
                      #{app.user_id} · {app.user_email}
                    </div>
                  </TableCell>
                  <TableCell>{app.real_name}</TableCell>
                  <TableCell>
                    <div className='text-sm'>{app.phone}</div>
                    {app.wechat_id && (
                      <div className='text-muted-foreground text-xs'>
                        {app.wechat_id}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className='text-sm'>
                    {app.sales_channel || '—'}
                  </TableCell>
                  <TableCell>
                    {app.inviter_id > 0 ? (
                      <span className='text-sm'>
                        {app.inviter_name || `#${app.inviter_id}`}
                      </span>
                    ) : (
                      <span className='text-muted-foreground text-xs'>
                        无（新账号）
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <LevelBadge level={app.proposed_level} />
                  </TableCell>
                  <TableCell className='text-muted-foreground text-xs'>
                    {new Date(app.created_at * 1000).toLocaleString('zh-CN', {
                      hour12: false,
                    })}
                  </TableCell>
                  <TableCell className='text-right'>
                    {app.status === 'pending' ? (
                      <div className='flex justify-end gap-2'>
                        <Button
                          size='sm'
                          variant='outline'
                          onClick={() => openReview(app, 'approve')}
                          className='gap-1'
                        >
                          <Check className='size-3 text-green-600' />
                          通过
                        </Button>
                        <Button
                          size='sm'
                          variant='outline'
                          onClick={() => openReview(app, 'reject')}
                          className='gap-1'
                        >
                          <X className='size-3 text-red-600' />
                          拒绝
                        </Button>
                      </div>
                    ) : (
                      <div className='text-muted-foreground text-xs'>
                        {app.reviewed_by_name && (
                          <div>由 {app.reviewed_by_name} 审批</div>
                        )}
                        {app.admin_remark && (
                          <div className='mt-1'>备注：{app.admin_remark}</div>
                        )}
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog
        open={!!reviewing}
        onOpenChange={(open) => !open && setReviewing(null)}
      >
        <DialogContent className='sm:max-w-md'>
          <DialogHeader>
            <DialogTitle>
              {reviewAction === 'approve' ? '通过申请' : '拒绝申请'}
            </DialogTitle>
            <DialogDescription>
              {reviewing && (
                <span>
                  申请人：<b>{reviewing.user_name}</b>（{reviewing.real_name}）·{' '}
                  预计级别 <b>L{reviewing.proposed_level}</b>
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className='space-y-3 py-2'>
            {reviewing?.reason && (
              <div className='bg-muted/40 rounded-md border p-3 text-sm'>
                <div className='text-muted-foreground mb-1 text-xs'>申请话术</div>
                <div className='whitespace-pre-wrap'>{reviewing.reason}</div>
              </div>
            )}

            {reviewAction === 'approve' && (
              <div className='grid gap-1.5'>
                <Label htmlFor='override_level'>
                  Level 覆盖（留 0 用预计 L{reviewing?.proposed_level}）
                </Label>
                <Select
                  value={String(overrideLevel)}
                  onValueChange={(v) => setOverrideLevel(Number(v))}
                >
                  <SelectTrigger id='override_level'>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='0'>不覆盖（用预计 level）</SelectItem>
                    <SelectItem value='1'>强制 L1（5% 提成）</SelectItem>
                    <SelectItem value='2'>强制 L2（3% 提成）</SelectItem>
                    <SelectItem value='3'>强制 L3（3% 提成）</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className='grid gap-1.5'>
              <Label htmlFor='admin_remark'>
                {reviewAction === 'reject' ? '拒绝原因' : '备注'}
              </Label>
              <Textarea
                id='admin_remark'
                value={adminRemark}
                onChange={(e) => setAdminRemark(e.target.value)}
                placeholder={
                  reviewAction === 'reject'
                    ? '简短说明拒绝理由，申请人可见'
                    : '内部备注（申请人也可见）'
                }
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant='outline'
              onClick={() => setReviewing(null)}
              disabled={submitting}
            >
              取消
            </Button>
            <Button
              onClick={submitReview}
              disabled={submitting}
              variant={reviewAction === 'reject' ? 'destructive' : 'default'}
            >
              {submitting
                ? '提交中…'
                : reviewAction === 'approve'
                  ? '确认通过'
                  : '确认拒绝'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
