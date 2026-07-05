import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
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
import { Switch } from '@/components/ui/switch'
import { createSubscriptionGroup, updateSubscriptionGroup } from '../../subscription-accounts/api'
import type { SubscriptionGroup } from '../../subscription-accounts/types'

interface Props {
  open: boolean
  group: SubscriptionGroup | null
  onClose: () => void
  onSuccess: () => void
}

const PLATFORMS = ['claude', 'codex', 'gemini', 'antigravity']

export function SubscriptionGroupMutateDialog({ open, group, onClose, onSuccess }: Props) {
  const { t } = useTranslation()
  const isEdit = !!group

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [platform, setPlatform] = useState('claude')
  const [status, setStatus] = useState('active')
  const [modelRouting, setModelRouting] = useState('')
  const [dailyLimit, setDailyLimit] = useState('0')
  const [weeklyLimit, setWeeklyLimit] = useState('0')
  const [monthlyLimit, setMonthlyLimit] = useState('0')
  const [rpmLimit, setRpmLimit] = useState('0')
  const [maxConcurrent, setMaxConcurrent] = useState('0')
  const [mcpXml, setMcpXml] = useState(false)
  const [claudeCodeOnly, setClaudeCodeOnly] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (group) {
      setName(group.name)
      setDescription(group.description || '')
      setPlatform(group.platform || 'claude')
      setStatus(group.status || 'active')
      setModelRouting(group.model_routing || '')
      setDailyLimit(String(group.daily_spending_limit || 0))
      setWeeklyLimit(String(group.weekly_spending_limit || 0))
      setMonthlyLimit(String(group.monthly_spending_limit || 0))
      setRpmLimit(String(group.rpm_limit || 0))
      setMaxConcurrent(String(group.max_concurrent || 0))
      setMcpXml(group.mcp_xml_enabled || false)
      setClaudeCodeOnly(group.claude_code_only || false)
    } else {
      setName('')
      setDescription('')
      setPlatform('claude')
      setStatus('active')
      setModelRouting('')
      setDailyLimit('0')
      setWeeklyLimit('0')
      setMonthlyLimit('0')
      setRpmLimit('0')
      setMaxConcurrent('0')
      setMcpXml(false)
      setClaudeCodeOnly(false)
    }
  }, [group, open])

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error(t('Group name is required'))
      return
    }
    if (modelRouting.trim()) {
      try {
        JSON.parse(modelRouting)
      } catch {
        toast.error(t('Model routing must be valid JSON'))
        return
      }
    }
    setLoading(true)
    try {
      const payload = {
        name: name.trim(),
        description: description.trim(),
        platform,
        status,
        model_routing: modelRouting.trim(),
        daily_spending_limit: parseFloat(dailyLimit) || 0,
        weekly_spending_limit: parseFloat(weeklyLimit) || 0,
        monthly_spending_limit: parseFloat(monthlyLimit) || 0,
        rpm_limit: parseInt(rpmLimit) || 0,
        max_concurrent: parseInt(maxConcurrent) || 0,
        mcp_xml_enabled: mcpXml,
        claude_code_only: claudeCodeOnly,
      }
      const res = isEdit
        ? await updateSubscriptionGroup(group!.id, payload)
        : await createSubscriptionGroup(payload)

      if (res.success) {
        toast.success(isEdit ? t('Group updated') : t('Group created'))
        onSuccess()
      } else {
        toast.error(res.message || t('Operation failed'))
      }
    } catch {
      toast.error(t('Request failed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className='max-w-lg max-h-[90vh] overflow-y-auto'>
        <DialogHeader>
          <DialogTitle>{isEdit ? t('Edit Group') : t('Create Group')}</DialogTitle>
          <DialogDescription>
            {t('Configure account pool group with routing and limits')}
          </DialogDescription>
        </DialogHeader>

        <div className='grid gap-4 py-2'>
          <div className='grid gap-1.5'>
            <Label>{t('Name')} *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder='e.g. claude-pro-group' />
          </div>

          <div className='grid gap-1.5'>
            <Label>{t('Description')}</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>

          <div className='grid grid-cols-2 gap-4'>
            <div className='grid gap-1.5'>
              <Label>{t('Platform')}</Label>
              <select
                className='border-input bg-background rounded-md border px-3 py-2 text-sm'
                value={platform}
                onChange={(e) => setPlatform(e.target.value)}
              >
                {PLATFORMS.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
            <div className='grid gap-1.5'>
              <Label>{t('Status')}</Label>
              <select
                className='border-input bg-background rounded-md border px-3 py-2 text-sm'
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value='active'>{t('active')}</option>
                <option value='disabled'>{t('disabled')}</option>
              </select>
            </div>
          </div>

          <div className='grid gap-1.5'>
            <Label>{t('Model Routing')} <span className='text-muted-foreground text-xs'>(JSON)</span></Label>
            <textarea
              className='border-input bg-background rounded-md border px-3 py-2 text-sm font-mono'
              rows={3}
              value={modelRouting}
              onChange={(e) => setModelRouting(e.target.value)}
              placeholder={'{"claude-3-5-sonnet-20241022":"claude-3-7-sonnet-20250219"}'}
            />
          </div>

          <div className='grid grid-cols-3 gap-3'>
            <div className='grid gap-1.5'>
              <Label className='text-xs'>{t('Daily Limit')} ($)</Label>
              <Input type='number' min='0' step='0.01' value={dailyLimit} onChange={(e) => setDailyLimit(e.target.value)} />
            </div>
            <div className='grid gap-1.5'>
              <Label className='text-xs'>{t('Weekly Limit')} ($)</Label>
              <Input type='number' min='0' step='0.01' value={weeklyLimit} onChange={(e) => setWeeklyLimit(e.target.value)} />
            </div>
            <div className='grid gap-1.5'>
              <Label className='text-xs'>{t('Monthly Limit')} ($)</Label>
              <Input type='number' min='0' step='0.01' value={monthlyLimit} onChange={(e) => setMonthlyLimit(e.target.value)} />
            </div>
          </div>

          <div className='grid grid-cols-2 gap-4'>
            <div className='grid gap-1.5'>
              <Label className='text-xs'>{t('RPM Limit')} <span className='text-muted-foreground'>(0=∞)</span></Label>
              <Input type='number' min='0' value={rpmLimit} onChange={(e) => setRpmLimit(e.target.value)} />
            </div>
            <div className='grid gap-1.5'>
              <Label className='text-xs'>{t('Max Concurrent')} <span className='text-muted-foreground'>(0=∞)</span></Label>
              <Input type='number' min='0' value={maxConcurrent} onChange={(e) => setMaxConcurrent(e.target.value)} />
            </div>
          </div>

          <div className='flex items-center justify-between rounded-lg border p-3'>
            <div>
              <Label>{t('MCP XML Injection')}</Label>
              <p className='text-muted-foreground text-xs'>{t('Inject MCP tools XML into Claude system prompt')}</p>
            </div>
            <Switch checked={mcpXml} onCheckedChange={setMcpXml} />
          </div>

          <div className='flex items-center justify-between rounded-lg border p-3'>
            <div>
              <Label>{t('Claude Code Only')}</Label>
              <p className='text-muted-foreground text-xs'>{t('Only allow Claude Code client requests')}</p>
            </div>
            <Switch checked={claudeCodeOnly} onCheckedChange={setClaudeCodeOnly} />
          </div>
        </div>

        <DialogFooter>
          <Button variant='outline' onClick={onClose}>{t('Cancel')}</Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? t('Saving...') : isEdit ? t('Save') : t('Create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
