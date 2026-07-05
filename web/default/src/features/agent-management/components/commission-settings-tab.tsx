import { useCallback, useEffect, useMemo, useState } from 'react'
import { Layers, RefreshCw, Save, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { NativeSelect } from '@/components/ui/native-select'
import { Separator } from '@/components/ui/separator'

// 销售佣金设置：叠加全返模型的档位费率(5%/3%/3%) + 计佣口径 + 结算规则 + 风控，全部热配(改完即生效)。
type Cfg = {
  mode: string // SalesCommissionMode: consume | topup
  l1: number // 百分比展示(5 表示 5%)
  l2: number
  l3: number
  lockDays: number
  minWithdraw: number
  cycleDays: number
  fraud: boolean
}

const DEFAULTS: Cfg = {
  mode: 'consume', l1: 5, l2: 3, l3: 3,
  lockDays: 30, minWithdraw: 10, cycleDays: 0, fraud: true,
}

// 档位视觉：与 AgentLevelBadge 保持一致(1档蓝 / 2档黄 / 3档紫)
const TIERS = [
  { key: 'l1' as const, label: '1 档', sub: 'admin 直接指派', dot: 'bg-blue-500', text: 'text-blue-600 dark:text-blue-400' },
  { key: 'l2' as const, label: '2 档', sub: '1 档发展', dot: 'bg-amber-500', text: 'text-amber-600 dark:text-amber-400' },
  { key: 'l3' as const, label: '3 档', sub: '2 档发展（封顶）', dot: 'bg-purple-500', text: 'text-purple-600 dark:text-purple-400' },
]

export function CommissionSettingsTab() {
  const [cfg, setCfg] = useState<Cfg>(DEFAULTS)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const api = await import('@/lib/api').then((m) => m.api)
      const res = await api.get('/api/option/')
      if (res.data?.success) {
        const opts: Array<{ key: string; value: string }> = res.data.data ?? []
        const get = (k: string) => opts.find((o) => o.key === k)?.value
        const num = (k: string, fallback: number) => {
          const v = get(k)
          const n = v == null ? NaN : parseFloat(v)
          return Number.isFinite(n) ? n : fallback
        }
        setCfg({
          mode: get('SalesCommissionMode') || DEFAULTS.mode,
          l1: +(num('SalesL1CommissionRate', 0.05) * 100).toFixed(2),
          l2: +(num('SalesL2CommissionRate', 0.03) * 100).toFixed(2),
          l3: +(num('SalesL3CommissionRate', 0.03) * 100).toFixed(2),
          lockDays: num('SalesLockDays', 30),
          minWithdraw: num('SalesMinWithdrawAmount', 10),
          cycleDays: num('SalesWithdrawCycleDays', 0),
          fraud: get('SalesFraudCheckEnabled') !== 'false',
        })
      }
    } catch {
      toast.error('加载佣金设置失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const save = async () => {
    if (cfg.l1 < 0 || cfg.l2 < 0 || cfg.l3 < 0 || cfg.l1 > 100 || cfg.l2 > 100 || cfg.l3 > 100) {
      toast.error('档位费率须在 0–100% 之间')
      return
    }
    setSaving(true)
    try {
      const api = await import('@/lib/api').then((m) => m.api)
      const pairs: Array<[string, string]> = [
        ['SalesCommissionMode', cfg.mode],
        ['SalesL1CommissionRate', String(cfg.l1 / 100)],
        ['SalesL2CommissionRate', String(cfg.l2 / 100)],
        ['SalesL3CommissionRate', String(cfg.l3 / 100)],
        ['SalesLockDays', String(Math.round(cfg.lockDays))],
        ['SalesMinWithdrawAmount', String(cfg.minWithdraw)],
        ['SalesWithdrawCycleDays', String(Math.round(cfg.cycleDays))],
        ['SalesFraudCheckEnabled', cfg.fraud ? 'true' : 'false'],
      ]
      for (const [key, value] of pairs) {
        const res = await api.put('/api/option/', { key, value })
        if (!res.data?.success) throw new Error(res.data?.message || key)
      }
      toast.success('佣金设置已保存，立即生效')
      load()
    } catch (e) {
      toast.error('保存失败：' + (e instanceof Error ? e.message : ''))
    } finally {
      setSaving(false)
    }
  }

  // ¥100 消费的叠加分润预览（3 级链最深情形）
  const preview = useMemo(() => {
    const rows = TIERS.map((t) => ({ ...t, amt: (cfg[t.key] as number) }))
    const total = rows.reduce((s, r) => s + r.amt, 0)
    return { rows, total }
  }, [cfg])

  const base = cfg.mode === 'consume' ? '消费' : '充值'

  return (
    <div className='space-y-4'>
      <div className='flex items-center justify-end'>
        <Button variant='outline' size='sm' onClick={load} disabled={loading}>
          <RefreshCw className={`mr-1 h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> 刷新
        </Button>
      </div>

      <div className='grid gap-4 lg:grid-cols-5'>
        {/* 左：档位费率 + 模式 */}
        <Card className='lg:col-span-3'>
          <CardHeader>
            <CardTitle className='flex items-center gap-2 text-base'>
              <Layers className='h-4 w-4' /> 档位提成率（叠加全返）
            </CardTitle>
            <CardDescription>
              客户每笔{base}沿邀请链上溯，<b>每级销售按自己档位率全额计佣</b>，最多 3 级。3 档不可再发展下级。
            </CardDescription>
          </CardHeader>
          <CardContent className='space-y-5'>
            <div className='space-y-2'>
              <Label className='text-xs text-muted-foreground'>计佣口径</Label>
              <NativeSelect
                className='w-full'
                value={cfg.mode}
                onChange={(e) => setCfg((c) => ({ ...c, mode: e.target.value }))}
              >
                <option value='consume'>按消费（推荐，防套利 · 现状）</option>
                <option value='topup'>按充值</option>
              </NativeSelect>
            </div>

            <div className='space-y-3'>
              {TIERS.map((t) => (
                <div key={t.key} className='flex items-center gap-3'>
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${t.dot}`} />
                  <div className='flex-1 leading-tight'>
                    <div className={`text-sm font-medium ${t.text}`}>{t.label}</div>
                    <div className='text-xs text-muted-foreground'>{t.sub}</div>
                  </div>
                  <div className='relative w-28'>
                    <Input
                      type='number' step='0.5' min={0} max={100}
                      value={cfg[t.key] as number}
                      onChange={(e) => setCfg((c) => ({ ...c, [t.key]: parseFloat(e.target.value) || 0 }))}
                      className='pr-7 text-right tabular-nums'
                    />
                    <span className='pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground'>%</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* 右：实时分润预览 */}
        <Card className='lg:col-span-2'>
          <CardHeader>
            <CardTitle className='text-base'>分润预览</CardTitle>
            <CardDescription>
              客户（3 档直接发展）{base} <span className='font-mono'>¥100</span>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className='space-y-2'>
              {preview.rows.slice().reverse().map((r) => (
                <div key={r.key} className='flex items-center justify-between'>
                  <span className='flex items-center gap-2 text-sm'>
                    <span className={`h-2 w-2 rounded-full ${r.dot}`} />
                    <span className='text-muted-foreground'>{r.label}</span>
                  </span>
                  <span className={`font-mono tabular-nums text-sm ${r.text}`}>+¥{r.amt.toFixed(2)}</span>
                </div>
              ))}
              <Separator className='my-1' />
              <div className='flex items-center justify-between'>
                <span className='text-sm font-medium'>总支出</span>
                <span className='font-mono tabular-nums text-base font-semibold'>
                  ¥{preview.total.toFixed(2)}
                  <span className='ml-1 text-xs font-normal text-muted-foreground'>({preview.total.toFixed(0)}%)</span>
                </span>
              </div>
            </div>
            <p className='mt-3 text-xs text-muted-foreground'>
              多数客户由 1 档直接发展，仅 1 档拿 {cfg.l1}%。利润护栏请保证毛利 &gt; 总支出比例。
            </p>
          </CardContent>
        </Card>
      </div>

      {/* 结算规则 + 风控 */}
      <Card>
        <CardHeader>
          <CardTitle className='flex items-center gap-2 text-base'>
            <ShieldCheck className='h-4 w-4' /> 结算规则 & 风控
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className='grid gap-5 sm:grid-cols-2 lg:grid-cols-4'>
            <div className='space-y-2'>
              <Label className='text-xs text-muted-foreground'>锁定期（天）</Label>
              <Input type='number' min={0} value={cfg.lockDays}
                onChange={(e) => setCfg((c) => ({ ...c, lockDays: parseFloat(e.target.value) || 0 }))}
                className='tabular-nums' />
              <p className='text-xs text-muted-foreground'>佣金 pending 满此天数才可提（防退款套利）</p>
            </div>
            <div className='space-y-2'>
              <Label className='text-xs text-muted-foreground'>最低提现额（¥）</Label>
              <Input type='number' min={0} step='1' value={cfg.minWithdraw}
                onChange={(e) => setCfg((c) => ({ ...c, minWithdraw: parseFloat(e.target.value) || 0 }))}
                className='tabular-nums' />
              <p className='text-xs text-muted-foreground'>低于此额不允许发起提现</p>
            </div>
            <div className='space-y-2'>
              <Label className='text-xs text-muted-foreground'>提现周期（天）</Label>
              <Input type='number' min={0} value={cfg.cycleDays}
                onChange={(e) => setCfg((c) => ({ ...c, cycleDays: parseFloat(e.target.value) || 0 }))}
                className='tabular-nums' />
              <p className='text-xs text-muted-foreground'>周期内只能申请一次，0 = 不限</p>
            </div>
            <div className='space-y-2'>
              <Label className='text-xs text-muted-foreground'>自邀请检测</Label>
              <div className='flex h-9 items-center gap-2'>
                <Switch checked={cfg.fraud} onCheckedChange={(v: boolean) => setCfg((c) => ({ ...c, fraud: v }))} />
                <span className='text-sm text-muted-foreground'>{cfg.fraud ? '已开启' : '已关闭'}</span>
              </div>
              <p className='text-xs text-muted-foreground'>同 IP/设备/邮箱注册自动标记待审</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className='flex justify-end'>
        <Button onClick={save} disabled={saving || loading}>
          <Save className='mr-1 h-4 w-4' /> {saving ? '保存中…' : '保存设置'}
        </Button>
      </div>
    </div>
  )
}
