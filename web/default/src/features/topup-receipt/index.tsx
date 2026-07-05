import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearch } from '@tanstack/react-router'
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Copy,
  Download,
  FileText,
  Printer,
  XCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'
import { useSystemConfig } from '@/hooks/use-system-config'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'

interface TopUpRecord {
  id: number
  user_id: number
  amount: number
  money: number
  trade_no: string
  payment_method: string
  payment_provider?: string
  create_time: number
  complete_time: number
  status: string
}

type Status = 'success' | 'pending' | 'failed' | 'expired' | 'unknown'

function classifyStatus(s: string): Status {
  const v = (s || '').toLowerCase()
  if (v === 'success' || v === 'paid' || v === 'completed') return 'success'
  if (v === 'pending' || v === 'wait_pay' || v === 'created') return 'pending'
  if (v === 'failed') return 'failed'
  if (v === 'expired') return 'expired'
  return 'unknown'
}

function formatDate(ts: number): string {
  if (!ts) return '—'
  const d = new Date(ts * 1000)
  return d.toLocaleString('zh-CN', { hour12: false })
}

function formatPaymentMethod(m: string): string {
  const map: Record<string, string> = {
    alipay: '支付宝',
    wxpay: '微信支付',
    qqpay: 'QQ 钱包',
    stripe: 'Stripe 信用卡',
    creem: 'Creem',
    waffo: 'Waffo',
  }
  return map[m] || m || '—'
}

export function TopUpReceiptPage() {
  // @ts-expect-error tanstack-router validates path-level types, query is unknown
  const search = useSearch({ strict: false }) as { trade_no?: string }
  const tradeNo = search?.trade_no
  const { auth } = useAuthStore()
  const { systemName } = useSystemConfig()
  const [data, setData] = useState<TopUpRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const receiptRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!tradeNo) {
      setError('缺少订单号参数')
      setLoading(false)
      return
    }
    let stop = false
    let attempts = 0
    const max = 8
    const fetchOnce = async () => {
      attempts++
      try {
        const res = await api.get(
          `/api/user/topup/self/trade/${encodeURIComponent(tradeNo)}`
        )
        const d = res.data
        if (!stop && d?.success && d.data) {
          setData(d.data)
          // 若仍 pending 且还没到极限，轮询一次
          const st = classifyStatus(d.data.status)
          if (st === 'pending' && attempts < max) {
            setTimeout(fetchOnce, 2000)
          } else {
            setLoading(false)
          }
        } else if (!stop) {
          setError(d?.message || '查询失败')
          setLoading(false)
        }
      } catch (_e) {
        if (!stop) {
          setError('网络异常')
          setLoading(false)
        }
      }
    }
    fetchOnce()
    return () => {
      stop = true
    }
  }, [tradeNo])

  const status = classifyStatus(data?.status || '')

  const receiptText = useMemo(() => {
    if (!data) return ''
    return [
      `=========================================`,
      `${systemName || '摆渡人'} · 充值回单`,
      `=========================================`,
      ``,
      `订单号：${data.trade_no}`,
      `用户：${auth.user?.username ?? data.user_id} (ID ${data.user_id})`,
      `金额：¥${data.money?.toFixed?.(2) ?? data.money}`,
      `额度：${data.amount.toLocaleString()} quota`,
      `支付方式：${formatPaymentMethod(data.payment_method)}`,
      `状态：${status === 'success' ? '已成功' : status}`,
      `创建时间：${formatDate(data.create_time)}`,
      `完成时间：${formatDate(data.complete_time)}`,
      ``,
      `本回单由系统自动生成，可作为对账凭证。`,
      `如需开具发票，请联系平台客服。`,
    ].join('\n')
  }, [data, status, auth.user, systemName])

  const handleCopy = async () => {
    if (!receiptText) return
    try {
      await navigator.clipboard.writeText(receiptText)
      toast.success('回单内容已复制到剪贴板')
    } catch {
      toast.error('复制失败')
    }
  }

  const handlePrintOrPdf = () => {
    // 使用 window.print —— 用户选 "另存为 PDF" 即可
    window.print()
  }

  const renderStatusBadge = () => {
    if (status === 'success')
      return (
        <Badge className='gap-1 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'>
          <CheckCircle2 className='size-3.5' /> 已成功
        </Badge>
      )
    if (status === 'pending')
      return (
        <Badge className='gap-1 bg-amber-500/15 text-amber-700 dark:text-amber-400'>
          <Clock className='size-3.5' /> 处理中
        </Badge>
      )
    if (status === 'failed' || status === 'expired')
      return (
        <Badge variant='destructive' className='gap-1'>
          <XCircle className='size-3.5' /> {status === 'failed' ? '失败' : '已过期'}
        </Badge>
      )
    return <Badge variant='secondary'>{data?.status || '未知'}</Badge>
  }

  return (
    <div className='min-h-svh bg-gradient-to-b from-background to-muted/30'>
      {/* Print-only style: hide non-essential blocks */}
      <style>{`
        @media print {
          body { background: white !important; }
          .no-print { display: none !important; }
          .receipt-page { box-shadow: none !important; border: none !important; }
          .receipt-card { box-shadow: none !important; border: 1px solid #d4d4d8 !important; }
        }
      `}</style>

      <div className='mx-auto max-w-3xl px-4 py-8 sm:py-12'>
        {/* 顶栏 (不打印) */}
        <div className='no-print mb-6 flex items-center justify-between'>
          <Link
            to='/wallet'
            className='text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm'
          >
            <ArrowLeft className='size-4' />
            返回钱包
          </Link>
          <div className='flex gap-2'>
            <Button variant='outline' size='sm' onClick={handleCopy} disabled={!data}>
              <Copy className='mr-1 size-3.5' />
              复制全文
            </Button>
            <Button variant='outline' size='sm' onClick={handlePrintOrPdf} disabled={!data}>
              <Printer className='mr-1 size-3.5' />
              打印
            </Button>
            <Button size='sm' onClick={handlePrintOrPdf} disabled={!data}>
              <Download className='mr-1 size-3.5' />
              导出 PDF
            </Button>
          </div>
        </div>

        {/* 回单卡片 */}
        <div
          ref={receiptRef}
          className='receipt-card relative overflow-hidden rounded-2xl border bg-card shadow-sm'
        >
          {/* 顶部色条 */}
          <div className='h-1.5 bg-gradient-to-r from-indigo-500 via-fuchsia-500 to-orange-500' />

          {/* Header */}
          <div className='flex items-start justify-between gap-4 border-b p-6 sm:p-8'>
            <div>
              <div className='inline-flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground'>
                <FileText className='size-3.5' />
                充值回单 / Topup Receipt
              </div>
              <h1 className='mt-2 text-2xl font-bold tracking-tight'>
                {systemName || '摆渡人'}
              </h1>
              <p className='text-muted-foreground mt-0.5 text-xs'>
                由系统自动生成，可作为对账凭证
              </p>
            </div>
            <div>{loading ? <Skeleton className='h-7 w-20' /> : renderStatusBadge()}</div>
          </div>

          {/* Body */}
          <div className='p-6 sm:p-8'>
            {loading ? (
              <ReceiptSkeleton />
            ) : error ? (
              <ErrorView msg={error} />
            ) : data ? (
              <div className='space-y-5'>
                <Row label='订单号' value={data.trade_no} mono />
                <Row
                  label='用户'
                  value={`${auth.user?.username ?? data.user_id} · UID ${data.user_id}`}
                />
                <Separator />
                <div className='grid grid-cols-2 gap-4'>
                  <BigStat label='支付金额' value={`¥${data.money?.toFixed?.(2) ?? data.money}`} />
                  <BigStat
                    label='充值额度'
                    value={data.amount.toLocaleString()}
                    sub='quota'
                  />
                </div>
                <Separator />
                <Row label='支付方式' value={formatPaymentMethod(data.payment_method)} />
                {data.payment_provider && (
                  <Row label='支付通道' value={data.payment_provider} mono />
                )}
                <Row label='创建时间' value={formatDate(data.create_time)} />
                <Row label='完成时间' value={formatDate(data.complete_time)} />

                {status === 'pending' && (
                  <div className='mt-4 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-400'>
                    订单仍在处理中。如果你已经完成支付但状态仍未更新，请稍候几秒页面会自动刷新。
                  </div>
                )}
                {(status === 'failed' || status === 'expired') && (
                  <div className='mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive'>
                    此订单未成功，金额不会被扣款。如有扣款异常请联系客服并提供订单号。
                  </div>
                )}
              </div>
            ) : null}
          </div>

          {/* Footer */}
          <div className='border-t bg-muted/30 px-6 py-4 text-center text-xs text-muted-foreground sm:px-8'>
            如需开具发票或合并报销凭证，请联系客服并提供订单号 ·{' '}
            <span className='font-mono'>{data?.trade_no ?? tradeNo ?? ''}</span>
          </div>
        </div>

        {/* 客户备注（不打印） */}
        <div className='no-print mt-6 rounded-lg border bg-muted/20 p-4 text-xs text-muted-foreground'>
          <p className='leading-relaxed'>
            <strong className='text-foreground'>提示：</strong>
            导出 PDF 使用浏览器的"另存为 PDF"功能 —— 点击右上角"导出 PDF"按钮后，在弹出的打印对话框中选择
            <span className='font-medium text-foreground'> "另存为 PDF" </span>
            即可。可调整页面边距、缩放比例。
          </p>
        </div>
      </div>
    </div>
  )
}

function Row({
  label,
  value,
  mono,
}: {
  label: string
  value: React.ReactNode
  mono?: boolean
}) {
  return (
    <div className='flex items-start justify-between gap-4'>
      <span className='text-muted-foreground text-sm'>{label}</span>
      <span
        className={`text-right text-sm ${mono ? 'font-mono text-xs' : 'font-medium'} break-all`}
      >
        {value}
      </span>
    </div>
  )
}

function BigStat({
  label,
  value,
  sub,
}: {
  label: string
  value: string
  sub?: string
}) {
  return (
    <div className='rounded-lg border bg-muted/20 p-4'>
      <div className='text-muted-foreground text-[11px] uppercase tracking-wide'>
        {label}
      </div>
      <div className='mt-1 text-2xl font-bold tracking-tight'>{value}</div>
      {sub && <div className='text-muted-foreground mt-0.5 text-xs'>{sub}</div>}
    </div>
  )
}

function ReceiptSkeleton() {
  return (
    <div className='space-y-5'>
      <Skeleton className='h-5 w-2/3' />
      <Skeleton className='h-5 w-1/2' />
      <Separator />
      <div className='grid grid-cols-2 gap-4'>
        <Skeleton className='h-20' />
        <Skeleton className='h-20' />
      </div>
      <Skeleton className='h-5 w-1/3' />
      <Skeleton className='h-5 w-1/3' />
    </div>
  )
}

function ErrorView({ msg }: { msg: string }) {
  return (
    <div className='flex flex-col items-center gap-3 py-8 text-center'>
      <XCircle className='size-10 text-destructive/60' />
      <h3 className='text-base font-semibold'>找不到订单</h3>
      <p className='text-muted-foreground max-w-sm text-sm'>{msg}</p>
      <Link
        to='/wallet'
        className='text-primary mt-2 inline-flex items-center gap-1 text-sm hover:underline'
      >
        返回钱包查看订单列表 <ArrowLeft className='size-3.5 rotate-180' />
      </Link>
    </div>
  )
}
