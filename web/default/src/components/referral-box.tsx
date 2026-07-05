import { useEffect, useMemo, useRef, useState } from 'react'
import { Copy, Download, EyeOff, RefreshCw, Share2 } from 'lucide-react'
import { QRCodeCanvas } from 'qrcode.react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'

interface ReferralBoxProps {
  /** 推荐码（如 MBB6GXA3 或 sales 自定义码） */
  code: string
  /** 标题文字 */
  title?: string
  /** 副标题描述 */
  description?: string
  /** 右下角小行展示的奖励信息（"当前返佣 X%" / "新人首付奖金 ¥Y" 等） */
  rewardLines?: Array<{ label: string; value: string }>
  /** 默认是否启用隐藏推广痕迹模式 */
  defaultStealth?: boolean
  /** 手动刷新（重新拉接口）回调 */
  onRefresh?: () => void
  /** 是否在加载中 */
  loading?: boolean
  className?: string
}

/**
 * ReferralBox 推广卡片组件
 *
 * 两个核心功能：
 * 1. 隐藏推广痕迹 — 切换 `?aff=` 链接 ↔ `/g/<code>` 短链；后端有 /g/:code → 302 重定向
 * 2. 二维码 — Canvas 渲染当前链接，支持下载 PNG
 */
export function ReferralBox({
  code,
  title,
  description,
  rewardLines,
  defaultStealth = true,
  onRefresh,
  loading,
  className,
}: ReferralBoxProps) {
  const { t } = useTranslation()
  const [stealth, setStealth] = useState(defaultStealth)
  const qrRef = useRef<HTMLCanvasElement>(null)

  // 链接根域：window.location.origin 兜底
  const origin = typeof window !== 'undefined' ? window.location.origin : ''

  const fullLink = useMemo(() => {
    if (!code) return ''
    return stealth ? `${origin}/g/${code}` : `${origin}/sign-up?aff=${code}`
  }, [code, stealth, origin])

  const handleDownloadQR = () => {
    const canvas = qrRef.current
    if (!canvas) return
    const dataUrl = canvas.toDataURL('image/png')
    const a = document.createElement('a')
    a.href = dataUrl
    a.download = `referral-${code || 'qr'}.png`
    a.click()
  }

  useEffect(() => {
    setStealth(defaultStealth)
  }, [defaultStealth])

  if (loading) {
    return (
      <Card className={cn('bg-muted/20', className)}>
        <CardContent className='p-4'>
          <div className='text-muted-foreground text-sm'>{t('Loading...')}</div>
        </CardContent>
      </Card>
    )
  }

  if (!code) {
    return (
      <Card className={cn('bg-muted/20', className)}>
        <CardContent className='p-4 text-center text-sm text-muted-foreground'>
          {t('No referral code yet.')}
        </CardContent>
      </Card>
    )
  }

  const handleCopy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(label + ' ' + t('copied'))
    } catch {
      toast.error(t('Copy failed'))
    }
  }

  return (
    <Card className={cn('overflow-hidden border-emerald-500/20 bg-emerald-50/40 dark:bg-emerald-950/20', className)}>
      <CardContent className='space-y-4 p-4 sm:p-5'>
        {/* 标题区 */}
        <div className='flex items-start justify-between gap-2'>
          <div className='min-w-0'>
            <h3 className='flex items-center gap-2 text-base font-bold'>
              <Share2 className='size-4 text-emerald-600 dark:text-emerald-400' />
              {title || t('Referral Rewards')}
            </h3>
            {description && (
              <p className='text-muted-foreground mt-1 text-xs leading-relaxed'>
                {description}
              </p>
            )}
          </div>
          {onRefresh && (
            <Button
              variant='outline'
              size='icon'
              onClick={onRefresh}
              className='size-8 shrink-0'
              title={t('Refresh')}
            >
              <RefreshCw className='size-3.5' />
            </Button>
          )}
        </div>

        {/* 隐藏推广痕迹开关（独立一行，避免和链接行打架） */}
        <div className='flex items-center justify-between gap-3 rounded-md border border-emerald-500/15 bg-background/60 px-3 py-2'>
          <div className='flex items-center gap-2 min-w-0'>
            <EyeOff className='size-3.5 text-emerald-600 dark:text-emerald-400 shrink-0' />
            <div className='min-w-0'>
              <div className='text-xs font-medium'>{t('Hide referral trace')}</div>
              <div className='text-[10px] text-muted-foreground truncate'>
                {stealth
                  ? t('Shared link looks like a clean redirect — recipients won\'t notice the referral.')
                  : t('Use classic ?aff= link with visible referral parameter.')}
              </div>
            </div>
          </div>
          <Switch checked={stealth} onCheckedChange={setStealth} />
        </div>

        {/* 主内容：左侧链接区 + 右侧二维码 */}
        <div className='grid gap-4 md:grid-cols-[minmax(0,1fr)_140px] md:items-stretch'>
          {/* 左：链接 + 邀请码 */}
          <div className='space-y-3 min-w-0'>
            {/* 邀请链接 */}
            <div className='space-y-1.5'>
              <Label className='text-xs font-medium'>
                {t('My Referral Link')}
              </Label>
              <div className='flex gap-2'>
                <Input
                  value={fullLink}
                  readOnly
                  className='bg-background h-9 min-w-0 flex-1 font-mono text-xs'
                />
                <Button
                  type='button'
                  variant='default'
                  size='icon'
                  onClick={() => handleCopy(fullLink, t('Link'))}
                  className='h-9 w-9 shrink-0'
                  title={t('Copy link')}
                  aria-label={t('Copy link')}
                >
                  <Copy className='size-4' />
                </Button>
              </div>
            </div>

            {/* 邀请码 */}
            <div className='space-y-1.5'>
              <Label className='text-xs font-medium'>
                {t('My Referral Code')}
              </Label>
              <div className='flex gap-2'>
                <Input
                  value={code}
                  readOnly
                  className='bg-background h-9 min-w-0 flex-1 font-mono text-sm tracking-wider'
                />
                <Button
                  type='button'
                  variant='outline'
                  size='icon'
                  onClick={() => handleCopy(code, t('Code'))}
                  className='bg-background h-9 w-9 shrink-0'
                  title={t('Copy code')}
                  aria-label={t('Copy code')}
                >
                  <Copy className='size-4' />
                </Button>
              </div>
            </div>
          </div>

          {/* 右：QR */}
          <div className='flex flex-col items-center justify-between gap-2 rounded-lg bg-background p-3 shadow-sm md:py-3'>
            <QRCodeCanvas
              ref={qrRef}
              value={fullLink}
              size={104}
              level='H'
              marginSize={1}
              className='rounded'
            />
            <Button
              variant='ghost'
              size='sm'
              onClick={handleDownloadQR}
              className='h-7 w-full gap-1 text-xs'
            >
              <Download className='size-3' />
              {t('Save QR')}
            </Button>
          </div>
        </div>

        {/* 奖励信息 */}
        {rewardLines && rewardLines.length > 0 && (
          <div className='flex flex-wrap gap-x-6 gap-y-1 border-t border-emerald-500/20 pt-3 text-xs'>
            {rewardLines.map((r) => (
              <div key={r.label} className='flex items-center gap-1.5'>
                <span className='text-muted-foreground'>{r.label}：</span>
                <span className='font-semibold text-emerald-600 dark:text-emerald-400'>
                  {r.value}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
