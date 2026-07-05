import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Building2, Bell } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { enterpriseApi, type WorkspaceSettings } from '../enterprise-api'

export function EnterpriseWorkspaceSettings() {
  const { t } = useTranslation()
  const [settings, setSettings] = useState<WorkspaceSettings>({
    workspace_name: '',
    monthly_budget: 0,
    budget_alert_thresholds: [50, 75, 90, 100],
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [thresholdStr, setThresholdStr] = useState('')

  useEffect(() => {
    enterpriseApi.getSettings().then(res => {
      if (res.success && res.data) {
        setSettings(res.data)
        setThresholdStr(res.data.budget_alert_thresholds.join(', '))
      }
    }).finally(() => setLoading(false))
  }, [])

  const handleSave = async () => {
    setSaving(true)
    const thresholds = thresholdStr.split(',')
      .map(s => parseInt(s.trim()))
      .filter(n => !isNaN(n) && n > 0 && n <= 100)
    try {
      const res = await enterpriseApi.updateSettings({
        ...settings,
        budget_alert_thresholds: thresholds,
      })
      if (res.success) {
        toast.success(t('Settings saved'))
        setSettings(prev => ({ ...prev, budget_alert_thresholds: thresholds }))
      } else {
        toast.error(res.message || t('Operation failed'))
      }
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <p className='text-muted-foreground text-sm'>{t('Loading...')}</p>

  return (
    <div className='mx-auto max-w-3xl space-y-6'>
      {/* 基本信息 */}
      <Card>
        <CardHeader>
          <div className='flex items-center gap-2'>
            <Building2 className='size-4' />
            <CardTitle>{t('Basic Information')}</CardTitle>
          </div>
          <CardDescription>{t('Workspace name displayed throughout the system')}</CardDescription>
        </CardHeader>
        <CardContent className='space-y-4'>
          <div>
            <Label>{t('Workspace Name')}</Label>
            <Input
              value={settings.workspace_name}
              onChange={(e) => setSettings(prev => ({ ...prev, workspace_name: e.target.value }))}
              placeholder={t('My Company')}
            />
          </div>
        </CardContent>
      </Card>

      {/* 预算与告警 */}
      <Card>
        <CardHeader>
          <div className='flex items-center gap-2'>
            <Bell className='size-4' />
            <CardTitle>{t('Budget & Alerts')}</CardTitle>
          </div>
          <CardDescription>{t('Set monthly budget and alert thresholds')}</CardDescription>
        </CardHeader>
        <CardContent className='space-y-4'>
          <div className='grid gap-4 sm:grid-cols-2'>
            <div>
              <Label>{t('Monthly Budget')} (USD $)</Label>
              <Input
                type='number'
                value={settings.monthly_budget}
                onChange={(e) => setSettings(prev => ({ ...prev, monthly_budget: parseFloat(e.target.value) || 0 }))}
              />
            </div>
            <div>
              <Label>{t('Alert Thresholds')} (%)</Label>
              <Input
                value={thresholdStr}
                onChange={(e) => setThresholdStr(e.target.value)}
                placeholder='50, 75, 90, 100'
              />
              <p className='text-muted-foreground mt-1 text-xs'>{t('Comma-separated percentages')}</p>
            </div>
          </div>
          <div className='flex flex-wrap gap-2'>
            {settings.budget_alert_thresholds.map((v) => (
              <Badge key={v} variant='secondary'>{v}%</Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className='flex justify-end'>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? t('Saving...') : t('Save Changes')}
        </Button>
      </div>
    </div>
  )
}
