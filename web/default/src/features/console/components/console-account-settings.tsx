import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CreditCard, Copy, Gift, Wallet, User, Mail, KeyRound, Bell, Shield } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth-store'
import { formatCost } from '../lib/utils'

// ─── 个人资料卡片 ───

function ProfileCard() {
  const { t } = useTranslation()
  const { auth } = useAuthStore()
  const user = auth.user
  const [displayName, setDisplayName] = useState(user?.display_name || '')
  const [email, setEmail] = useState(user?.email || '')

  const handleSave = () => {
    toast.success(t('Profile updated'))
  }

  if (!user) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className='h-5 w-32' />
        </CardHeader>
        <CardContent>
          <Skeleton className='h-20 w-full' />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className='flex items-center gap-2'>
          <User className='size-4' />
          <CardTitle>{t('Profile')}</CardTitle>
        </div>
        <CardDescription>{t('Manage your personal information')}</CardDescription>
      </CardHeader>
      <CardContent className='space-y-4'>
        <div className='flex items-center gap-4'>
          <div className='flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground text-lg font-bold'>
            {(displayName || user.username).charAt(0)}
          </div>
          <div>
            <div className='font-medium'>{displayName || user.display_name || user.username}</div>
            <div className='text-muted-foreground text-sm'>@{user.username}</div>
          </div>
        </div>
        <Separator />
        <div className='grid gap-4 sm:grid-cols-2'>
          <div>
            <Label>{t('Display Name')}</Label>
            <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </div>
          <div>
            <Label>{t('Username')}</Label>
            <Input value={user.username} disabled />
            <p className='text-muted-foreground mt-1 text-xs'>{t('Username cannot be changed')}</p>
          </div>
          <div>
            <Label>
              <Mail className='mr-1 inline size-3' />
              {t('Email')}
            </Label>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <Label>{t('User ID')}</Label>
            <Input value={String(user.id)} disabled />
          </div>
        </div>
        <div className='flex justify-end'>
          <Button onClick={handleSave}>{t('Save Changes')}</Button>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── 余额与充值 ───

function BalanceCard() {
  const { t } = useTranslation()
  const { auth } = useAuthStore()
  const user = auth.user

  const balance = (user?.quota ?? 0) / 500000
  const used = (user?.used_quota ?? 0) / 500000
  const affCode = user?.aff_code || ''

  const copyAffCode = () => {
    if (!affCode) return
    void navigator.clipboard.writeText(affCode)
    toast.success(t('Affiliate code copied'))
  }

  return (
    <Card>
      <CardHeader>
        <div className='flex items-center gap-2'>
          <Wallet className='size-4' />
          <CardTitle>{t('Balance & Billing')}</CardTitle>
        </div>
        <CardDescription>{t('Manage your balance, subscriptions and top-ups')}</CardDescription>
      </CardHeader>
      <CardContent className='space-y-4'>
        <div className='grid gap-4 sm:grid-cols-3'>
          <div className='rounded-lg border p-4'>
            <div className='text-sm text-muted-foreground'>{t('Current Balance')}</div>
            <div className='mt-1 text-2xl font-bold text-green-600'>{formatCost(balance)}</div>
          </div>
          <div className='rounded-lg border p-4'>
            <div className='text-sm text-muted-foreground'>{t('Total Used')}</div>
            <div className='mt-1 text-2xl font-bold'>{formatCost(used)}</div>
          </div>
          <div className='rounded-lg border p-4'>
            <div className='text-sm text-muted-foreground'>{t('Affiliate Count')}</div>
            <div className='mt-1 text-2xl font-bold'>{user?.aff_count ?? 0}</div>
          </div>
        </div>
        <div className='flex flex-wrap gap-2'>
          <Button variant='outline' size='sm'>
            <CreditCard className='mr-1 size-3' />
            {t('Recharge')}
          </Button>
          <Button variant='outline' size='sm'>
            <Gift className='mr-1 size-3' />
            {t('Redeem Code')}
          </Button>
        </div>

        <Separator />

        {/* 邀请码 */}
        {affCode && (
          <div className='flex items-center justify-between rounded-lg border p-3'>
            <div>
              <div className='text-sm font-medium'>{t('Affiliate Code')}</div>
              <div className='font-mono text-sm text-muted-foreground'>{affCode}</div>
            </div>
            <Button variant='ghost' size='sm' onClick={copyAffCode}>
              <Copy className='mr-1 size-3' />
              {t('Copy')}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ─── 通知与安全 ───

function SecurityCard() {
  const { t } = useTranslation()
  const [emailNotif, setEmailNotif] = useState(true)
  const [usageAlert, setUsageAlert] = useState(true)
  const [twoFA, setTwoFA] = useState(false)

  return (
    <Card>
      <CardHeader>
        <div className='flex items-center gap-2'>
          <Shield className='size-4' />
          <CardTitle>{t('Notifications & Security')}</CardTitle>
        </div>
        <CardDescription>{t('Configure notification preferences and security settings')}</CardDescription>
      </CardHeader>
      <CardContent className='space-y-4'>
        {/* 通知设置 */}
        <div>
          <h4 className='mb-3 flex items-center gap-2 text-sm font-medium'>
            <Bell className='size-3.5' />
            {t('Notifications')}
          </h4>
          <div className='space-y-3'>
            <div className='flex items-center justify-between'>
              <div>
                <div className='text-sm'>{t('Email Notifications')}</div>
                <div className='text-muted-foreground text-xs'>
                  {t('Receive billing and usage alerts via email')}
                </div>
              </div>
              <Switch checked={emailNotif} onCheckedChange={setEmailNotif} />
            </div>
            <div className='flex items-center justify-between'>
              <div>
                <div className='text-sm'>{t('Usage Alerts')}</div>
                <div className='text-muted-foreground text-xs'>
                  {t('Get notified when approaching quota limits')}
                </div>
              </div>
              <Switch checked={usageAlert} onCheckedChange={setUsageAlert} />
            </div>
          </div>
        </div>

        <Separator />

        {/* 安全设置 */}
        <div>
          <h4 className='mb-3 flex items-center gap-2 text-sm font-medium'>
            <KeyRound className='size-3.5' />
            {t('Security')}
          </h4>
          <div className='space-y-3'>
            <div className='flex items-center justify-between'>
              <div>
                <div className='text-sm'>{t('Two-Factor Authentication')}</div>
                <div className='text-muted-foreground text-xs'>
                  {twoFA ? t('2FA is enabled') : t('Add an extra layer of security')}
                </div>
              </div>
              <Badge variant={twoFA ? 'default' : 'secondary'}>{twoFA ? t('Enabled') : t('Disabled')}</Badge>
            </div>
            <div className='flex items-center justify-between'>
              <div>
                <div className='text-sm'>{t('Change Password')}</div>
                <div className='text-muted-foreground text-xs'>{t('Update your account password')}</div>
              </div>
              <Button variant='outline' size='sm'>{t('Change')}</Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── 兑换码 ───

function RedeemCodeCard() {
  const { t } = useTranslation()
  const [code, setCode] = useState('')
  const [redeeming, setRedeeming] = useState(false)

  const handleRedeem = async () => {
    if (!code.trim()) return
    setRedeeming(true)
    await new Promise((r) => setTimeout(r, 800))
    toast.success(t('Code redeemed successfully'))
    setCode('')
    setRedeeming(false)
  }

  return (
    <Card>
      <CardHeader>
        <div className='flex items-center gap-2'>
          <Gift className='size-4' />
          <CardTitle>{t('Redeem Code')}</CardTitle>
        </div>
        <CardDescription>{t('Enter a redemption code to add balance to your account')}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className='flex gap-2'>
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder='XXXX-XXXX-XXXX'
            className='font-mono'
          />
          <Button onClick={handleRedeem} disabled={redeeming || !code.trim()}>
            {redeeming ? t('Redeeming...') : t('Redeem')}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── 主组件 ───

export function ConsoleAccountSettings() {
  return (
    <div className='mx-auto max-w-3xl space-y-6'>
      <ProfileCard />
      <BalanceCard />
      <RedeemCodeCard />
      <SecurityCard />
    </div>
  )
}
