import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { ExternalLink, Copy, CheckCircle2, ChevronRight, Loader2 } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { api } from '@/lib/api'
import { createSubscriptionAccount } from '../api'
import { useSubscriptionAccounts } from './subscription-accounts-provider'

// ─── 平台 & 账号类型配置 ───────────────────────────────────────────────────

type AuthMethod = 'oauth' | 'refresh_token' | 'api_key'

interface AccountType {
  id: string
  label: string
  desc: string
  methods: AuthMethod[]
  platform: string   // 传给后端的 platform 字段
  icon: string
}

interface Platform {
  id: string
  label: string
  icon: string
  types: AccountType[]
}

const PLATFORMS: Platform[] = [
  {
    id: 'anthropic',
    label: 'Anthropic',
    icon: '✦',
    types: [
      {
        id: 'claude_code',
        label: 'Claude Code',
        desc: 'OAuth / Setup Token',
        methods: ['oauth', 'refresh_token'],
        platform: 'claude',
        icon: '⚡',
      },
      {
        id: 'claude_console',
        label: 'Claude Console',
        desc: 'API Key',
        methods: ['api_key'],
        platform: 'claude',
        icon: '🔑',
      },
    ],
  },
  {
    id: 'openai',
    label: 'OpenAI',
    icon: '⚡',
    types: [
      {
        id: 'codex',
        label: 'Codex',
        desc: 'OAuth / Refresh Token',
        methods: ['oauth', 'refresh_token'],
        platform: 'codex',
        icon: '⚡',
      },
      {
        id: 'openai_api',
        label: 'API Key',
        desc: 'Direct API Key',
        methods: ['api_key'],
        platform: 'codex',
        icon: '🔑',
      },
    ],
  },
  {
    id: 'gemini',
    label: 'Gemini',
    icon: '✦',
    types: [
      {
        id: 'gemini_advanced',
        label: 'Gemini Advanced',
        desc: 'OAuth / Refresh Token',
        methods: ['oauth', 'refresh_token'],
        platform: 'gemini',
        icon: '✦',
      },
      {
        id: 'gemini_api',
        label: 'API Key',
        desc: 'Direct API Key',
        methods: ['api_key'],
        platform: 'gemini',
        icon: '🔑',
      },
    ],
  },
]

const METHOD_LABELS: Record<AuthMethod, string> = {
  oauth: 'OAuth',
  refresh_token: 'Setup Token（长期有效）',
  api_key: 'API Key',
}

// ─── 基本信息表单 ─────────────────────────────────────────────────────────

interface BaseInfo {
  accountName: string
  proxyUrl: string
  usageLimit: string
  groupId: string
  rpm: string
  maxConcurrent: string
  disabled: boolean
}

function BaseInfoForm({ value, onChange }: { value: BaseInfo; onChange: (v: BaseInfo) => void }) {
  const { t } = useTranslation()
  const set = (k: keyof BaseInfo, v: string | boolean) => onChange({ ...value, [k]: v })
  return (
    <div className='space-y-3'>
      <div>
        <Label>{t('Account Name')} *</Label>
        <Input value={value.accountName} onChange={e => set('accountName', e.target.value)} placeholder='e.g. Claude Pro #1' className='mt-1' />
      </div>
      <div>
        <Label>{t('Proxy URL')}</Label>
        <Input value={value.proxyUrl} onChange={e => set('proxyUrl', e.target.value)} placeholder='socks5://user:pass@host:port' className='mt-1' />
      </div>
      <div className='grid grid-cols-2 gap-3'>
        <div>
          <Label>{t('Usage Limit')} <span className='text-muted-foreground text-xs'>(0=∞)</span></Label>
          <Input type='number' value={value.usageLimit} onChange={e => set('usageLimit', e.target.value)} min={0} className='mt-1' />
        </div>
        <div>
          <Label>{t('Group ID')}</Label>
          <Input type='number' value={value.groupId} onChange={e => set('groupId', e.target.value)} min={0} className='mt-1' />
        </div>
        <div>
          <Label>RPM <span className='text-muted-foreground text-xs'>(0=∞)</span></Label>
          <Input type='number' value={value.rpm} onChange={e => set('rpm', e.target.value)} min={0} className='mt-1' />
        </div>
        <div>
          <Label>{t('Max Concurrent')} <span className='text-muted-foreground text-xs'>(0=∞)</span></Label>
          <Input type='number' value={value.maxConcurrent} onChange={e => set('maxConcurrent', e.target.value)} min={0} className='mt-1' />
        </div>
      </div>
      <div className='flex items-center justify-between rounded-lg border px-4 py-2.5'>
        <div className='text-sm'>
          <div className='font-medium'>{t('临时不可调度')}</div>
          <div className='text-muted-foreground text-xs'>{t('添加后暂不参与账号调度')}</div>
        </div>
        <Switch checked={value.disabled} onCheckedChange={v => set('disabled', v)} />
      </div>
    </div>
  )
}

// ─── Step 2: OAuth flow ──────────────────────────────────────────────────────

function OAuthStep({
  platform, proxyUrl, onSuccess,
}: { platform: string; proxyUrl: string; onSuccess: (state: string, code: string) => void }) {
  const { t } = useTranslation()
  const [authorizeUrl, setAuthorizeUrl] = useState('')
  const [state, setState] = useState('')
  const [callbackInput, setCallbackInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [initiated, setInitiated] = useState(false)

  const initOAuth = async () => {
    setLoading(true)
    try {
      const res = await api.post('/api/admin/subscription/oauth/init', { platform, proxy_url: proxyUrl || undefined })
      if (res.data.success) {
        setAuthorizeUrl(res.data.data.authorize_url)
        setState(res.data.data.state)
        setInitiated(true)
      } else {
        toast.error(res.data.message || t('Failed to generate OAuth URL'))
      }
    } catch {
      toast.error(t('Request failed'))
    } finally {
      setLoading(false)
    }
  }

  const extractCode = (input: string): string => {
    // 支持粘贴完整 URL 或只粘贴 code
    try {
      const u = new URL(input)
      return u.searchParams.get('code') || input.trim()
    } catch {
      return input.trim()
    }
  }

  const handleConfirm = () => {
    const code = extractCode(callbackInput)
    if (!code) { toast.error(t('Please paste the callback URL or code')); return }
    onSuccess(state, code)
  }

  if (!initiated) {
    return (
      <div className='space-y-4'>
        <p className='text-muted-foreground text-sm'>
          {t('点击下方按钮生成 OAuth 授权链接。在浏览器中完成授权后，将跳转到 localhost 错误页面，把地址栏的完整 URL 复制粘贴回来即可。')}
        </p>
        <Button onClick={initOAuth} disabled={loading} className='w-full'>
          {loading ? <Loader2 className='mr-2 size-4 animate-spin' /> : <ExternalLink className='mr-2 size-4' />}
          {t('生成 OAuth 授权链接')}
        </Button>
      </div>
    )
  }

  return (
    <div className='space-y-4'>
      <div className='rounded-lg border p-3 space-y-2'>
        <div className='flex items-center gap-2'>
          <CheckCircle2 className='size-4 text-green-500' />
          <span className='text-sm font-medium'>{t('OAuth 链接已生成')}</span>
        </div>
        <div className='flex items-center gap-2'>
          <code className='bg-muted flex-1 break-all rounded p-2 text-xs leading-relaxed'>{authorizeUrl}</code>
          <Button variant='outline' size='icon' className='shrink-0' onClick={() => { navigator.clipboard.writeText(authorizeUrl); toast.success(t('Copied')) }}>
            <Copy className='size-3.5' />
          </Button>
        </div>
        <Button variant='outline' size='sm' className='w-full' onClick={() => window.open(authorizeUrl, '_blank')}>
          <ExternalLink className='mr-1.5 size-3.5' />
          {t('在新标签页打开授权页面')}
        </Button>
      </div>

      <div className='rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2.5 text-xs text-amber-700 dark:text-amber-400 space-y-1'>
        <p className='font-medium'>授权后的操作步骤：</p>
        <ol className='list-decimal list-inside space-y-0.5'>
          <li>在打开的页面完成账号登录授权</li>
          <li>浏览器会跳转到 localhost 并显示「无法访问」错误</li>
          <li>从地址栏复制完整的 URL（含 ?code=... 参数）</li>
          <li>粘贴到下方输入框</li>
        </ol>
      </div>

      <div>
        <Label>{t('粘贴回调 URL 或 code')}</Label>
        <Textarea
          value={callbackInput}
          onChange={e => setCallbackInput(e.target.value)}
          placeholder='http://localhost:1455/auth/callback?code=xxx&state=xxx'
          rows={3}
          className='mt-1 font-mono text-xs'
        />
      </div>

      <Button onClick={handleConfirm} disabled={!callbackInput.trim()} className='w-full'>
        {t('验证并创建账号')}
        <ChevronRight className='ml-1 size-4' />
      </Button>
    </div>
  )
}

// ─── Step 2: Refresh Token / Setup Token ────────────────────────────────────

function RefreshTokenStep({ onSubmit, loading }: { onSubmit: (token: string) => void; loading: boolean }) {
  const { t } = useTranslation()
  const [token, setToken] = useState('')
  return (
    <div className='space-y-4'>
      <div className='rounded-lg bg-muted/50 px-3 py-2.5 text-xs text-muted-foreground space-y-1'>
        <p className='font-medium'>{t('如何获取 Setup Token（Refresh Token）：')}</p>
        <ul className='list-disc list-inside space-y-0.5'>
          <li>Claude Code：从 ~/.claude/.credentials.json 获取 refreshToken</li>
          <li>Codex：从 ~/.codex/auth.json 获取 refresh_token</li>
          <li>Gemini：从 ~/.config/gcloud/application_default_credentials.json 获取</li>
        </ul>
      </div>
      <div>
        <Label>{t('Refresh Token / Setup Token')} *</Label>
        <Textarea
          value={token}
          onChange={e => setToken(e.target.value)}
          placeholder='eyJ...'
          rows={4}
          className='mt-1 font-mono text-xs'
        />
      </div>
      <Button onClick={() => onSubmit(token)} disabled={!token.trim() || loading} className='w-full'>
        {loading ? <Loader2 className='mr-2 size-4 animate-spin' /> : null}
        {t('验证 Token 并创建账号')}
      </Button>
    </div>
  )
}

// ─── Step 2: API Key ─────────────────────────────────────────────────────────

function ApiKeyStep({ onSubmit, loading }: { onSubmit: (key: string) => void; loading: boolean }) {
  const { t } = useTranslation()
  const [key, setKey] = useState('')
  return (
    <div className='space-y-4'>
      <div>
        <Label>{t('API Key')} *</Label>
        <Input
          value={key}
          onChange={e => setKey(e.target.value)}
          placeholder='sk-ant-api03-... / sk-...'
          type='password'
          className='mt-1 font-mono'
        />
      </div>
      <Button onClick={() => onSubmit(key)} disabled={!key.trim() || loading} className='w-full'>
        {loading ? <Loader2 className='mr-2 size-4 animate-spin' /> : null}
        {t('添加账号')}
      </Button>
    </div>
  )
}

// ─── 主向导组件 ──────────────────────────────────────────────────────────────

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function AddAccountWizard({ open, onOpenChange }: Props) {
  const { t } = useTranslation()
  const { triggerRefresh } = useSubscriptionAccounts()

  const [step, setStep] = useState(1)
  const [platformId, setPlatformId] = useState('anthropic')
  const [accountTypeId, setAccountTypeId] = useState('claude_code')
  const [method, setMethod] = useState<AuthMethod>('oauth')
  const [baseInfo, setBaseInfo] = useState<BaseInfo>({
    accountName: '',
    proxyUrl: '',
    usageLimit: '0',
    groupId: '0',
    rpm: '0',
    maxConcurrent: '0',
    disabled: false,
  })
  const [submitting, setSubmitting] = useState(false)

  const platform = PLATFORMS.find(p => p.id === platformId)!
  const accountType = platform.types.find(t => t.id === accountTypeId) ?? platform.types[0]

  const resetAndClose = () => {
    setStep(1)
    setPlatformId('anthropic')
    setAccountTypeId('claude_code')
    setMethod('oauth')
    setBaseInfo({ accountName: '', proxyUrl: '', usageLimit: '0', groupId: '0', rpm: '0', maxConcurrent: '0', disabled: false })
    setSubmitting(false)
    onOpenChange(false)
  }

  const handlePlatformChange = (pid: string) => {
    setPlatformId(pid)
    const p = PLATFORMS.find(x => x.id === pid)!
    setAccountTypeId(p.types[0].id)
    setMethod(p.types[0].methods[0])
  }

  const handleTypeChange = (tid: string) => {
    setAccountTypeId(tid)
    const at = platform.types.find(x => x.id === tid)!
    setMethod(at.methods[0])
  }

  const goToStep2 = () => {
    if (!baseInfo.accountName.trim()) { toast.error(t('Account Name is required')); return }
    setStep(2)
  }

  const buildPayload = () => ({
    account_name: baseInfo.accountName.trim(),
    proxy_url: baseInfo.proxyUrl.trim() || undefined,
    usage_limit: parseFloat(baseInfo.usageLimit) || 0,
    group_id: parseInt(baseInfo.groupId) || 0,
    rpm: parseInt(baseInfo.rpm) || 0,
    max_concurrent: parseInt(baseInfo.maxConcurrent) || 0,
    disabled: baseInfo.disabled,
  })

  // OAuth → step 2 内部流程会回调这里
  const handleOAuthSuccess = async (state: string, code: string) => {
    setSubmitting(true)
    try {
      const res = await api.post('/api/admin/subscription/oauth/exchange', {
        state,
        code,
        ...buildPayload(),
      })
      if (res.data.success) {
        toast.success(t('Account added successfully'))
        triggerRefresh()
        resetAndClose()
      } else {
        toast.error(res.data.message || t('Failed to exchange code'))
      }
    } catch {
      toast.error(t('Request failed'))
    } finally {
      setSubmitting(false)
    }
  }

  const handleRefreshToken = async (refreshToken: string) => {
    setSubmitting(true)
    try {
      const res = await api.post('/api/admin/subscription/oauth/refresh-exchange', {
        platform: accountType.platform,
        refresh_token: refreshToken,
        ...buildPayload(),
      })
      if (res.data.success) {
        toast.success(t('Account added successfully'))
        triggerRefresh()
        resetAndClose()
      } else {
        toast.error(res.data.message || t('Failed to verify token'))
      }
    } catch {
      toast.error(t('Request failed'))
    } finally {
      setSubmitting(false)
    }
  }

  const handleApiKey = async (apiKey: string) => {
    setSubmitting(true)
    try {
      const res = await createSubscriptionAccount({
        platform: accountType.platform,
        account_name: baseInfo.accountName.trim(),
        access_token: apiKey,
        proxy_url: baseInfo.proxyUrl.trim() || undefined,
        usage_limit: parseFloat(baseInfo.usageLimit) || undefined,
        group_id: parseInt(baseInfo.groupId) || undefined,
        rpm: parseInt(baseInfo.rpm) || undefined,
        max_concurrent: parseInt(baseInfo.maxConcurrent) || undefined,
        status: baseInfo.disabled ? 'disabled' : 'active',
      })
      if (res.success) {
        toast.success(t('Account added successfully'))
        triggerRefresh()
        resetAndClose()
      } else {
        toast.error(res.message || t('Failed to create account'))
      }
    } catch {
      toast.error(t('Request failed'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && resetAndClose()}>
      <DialogContent className='sm:max-w-[520px]'>
        <DialogHeader>
          <DialogTitle>{t('添加账号')}</DialogTitle>
        </DialogHeader>

        {/* Step indicator */}
        <div className='flex items-center justify-center gap-3 pb-1'>
          {[
            { n: 1, label: t('授权方式') },
            { n: 2, label: accountType.id === 'claude_code' || accountType.id === 'codex' || accountType.id === 'gemini_advanced'
              ? t('账号授权') : t('填写凭证') },
          ].map((s, i) => (
            <div key={s.n} className='flex items-center gap-3'>
              {i > 0 && <div className={cn('h-px w-10', step >= s.n ? 'bg-primary' : 'bg-border')} />}
              <div className='flex items-center gap-1.5'>
                <div className={cn(
                  'flex size-6 items-center justify-center rounded-full text-xs font-semibold transition-colors',
                  step >= s.n ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                )}>
                  {s.n}
                </div>
                <span className={cn('text-xs font-medium', step >= s.n ? 'text-foreground' : 'text-muted-foreground')}>
                  {s.label}
                </span>
              </div>
            </div>
          ))}
        </div>

        <div className='max-h-[70vh] overflow-y-auto space-y-5 pr-1'>
          {step === 1 ? (
            <>
              {/* Platform tabs */}
              <div>
                <Label className='mb-2 block'>{t('平台')}</Label>
                <div className='flex gap-1 rounded-lg border p-1'>
                  {PLATFORMS.map(p => (
                    <button
                      key={p.id}
                      onClick={() => handlePlatformChange(p.id)}
                      className={cn(
                        'flex-1 flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                        platformId === p.id
                          ? 'bg-primary text-primary-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      <span>{p.icon}</span>
                      <span>{p.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Account type cards */}
              <div>
                <Label className='mb-2 block'>{t('账号类型')}</Label>
                <div className='grid grid-cols-1 gap-2 sm:grid-cols-2'>
                  {platform.types.map(at => (
                    <button
                      key={at.id}
                      onClick={() => handleTypeChange(at.id)}
                      className={cn(
                        'flex items-center gap-3 rounded-xl border p-3 text-left transition-all',
                        accountTypeId === at.id
                          ? 'border-primary bg-primary/5 ring-1 ring-primary'
                          : 'hover:border-foreground/30 hover:bg-muted/30'
                      )}
                    >
                      <div className={cn(
                        'flex size-9 shrink-0 items-center justify-center rounded-lg text-lg',
                        accountTypeId === at.id ? 'bg-primary/10' : 'bg-muted'
                      )}>
                        {at.icon}
                      </div>
                      <div>
                        <div className='text-sm font-medium leading-none'>{at.label}</div>
                        <div className='text-muted-foreground mt-1 text-xs'>{at.desc}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Auth method */}
              {accountType.methods.length > 1 && (
                <div>
                  <Label className='mb-2 block'>{t('添加方式')}</Label>
                  <div className='flex flex-col gap-2'>
                    {accountType.methods.map(m => (
                      <label
                        key={m}
                        onClick={() => setMethod(m)}
                        className={cn(
                          'flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-2.5 transition-colors',
                          method === m ? 'border-primary bg-primary/5' : 'hover:bg-muted/30'
                        )}
                      >
                        <div className={cn(
                          'size-4 rounded-full border-2 transition-colors',
                          method === m ? 'border-primary bg-primary' : 'border-muted-foreground/40'
                        )}>
                          {method === m && <div className='m-0.5 size-2 rounded-full bg-white' />}
                        </div>
                        <span className='text-sm font-medium'>{METHOD_LABELS[m]}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Base info */}
              <BaseInfoForm value={baseInfo} onChange={setBaseInfo} />

              <div className='flex justify-end gap-2 pt-1'>
                <Button variant='outline' onClick={resetAndClose}>{t('取消')}</Button>
                <Button onClick={goToStep2}>
                  {t('下一步')}
                  <ChevronRight className='ml-1 size-4' />
                </Button>
              </div>
            </>
          ) : (
            <>
              {/* Step 2 */}
              <div className='rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground'>
                <span className='font-medium'>{platform.label}</span>
                {' · '}
                <span>{accountType.label}</span>
                {' · '}
                <span>{METHOD_LABELS[method]}</span>
                {' · '}
                <span className='font-medium text-foreground'>{baseInfo.accountName}</span>
              </div>

              {method === 'oauth' && (
                <OAuthStep
                  platform={accountType.platform}
                  proxyUrl={baseInfo.proxyUrl}
                  onSuccess={handleOAuthSuccess}
                />
              )}
              {method === 'refresh_token' && (
                <RefreshTokenStep onSubmit={handleRefreshToken} loading={submitting} />
              )}
              {method === 'api_key' && (
                <ApiKeyStep onSubmit={handleApiKey} loading={submitting} />
              )}

              <div className='flex justify-start pt-1'>
                <Button variant='ghost' size='sm' onClick={() => setStep(1)}>
                  ← {t('返回修改')}
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
