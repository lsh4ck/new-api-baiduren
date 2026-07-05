import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { setAgentLevel } from '../api'
import type { Agent } from '../types'

type Props = {
  agent: Agent | null
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

export function SetAgentLevelDialog({ agent, open, onClose, onSuccess }: Props) {
  const { t } = useTranslation()
  const [level, setLevel] = useState<string>(String(agent?.agent_level ?? 0))
  const [rate, setRate] = useState<string>(String(((agent?.commission_rate ?? 0) * 100).toFixed(1)))
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    const lvl = parseInt(level)
    const rateVal = parseFloat(rate) / 100
    if (isNaN(lvl) || lvl < 0 || lvl > 2) {
      toast.error(t('Invalid agent level'))
      return
    }
    if (isNaN(rateVal) || rateVal < 0 || rateVal > 1) {
      toast.error(t('Commission rate must be 0-100'))
      return
    }
    setSaving(true)
    try {
      const res = await setAgentLevel(agent!.id, lvl, rateVal)
      if (res.success) {
        toast.success(t('Saved'))
        onSuccess()
        onClose()
      } else {
        toast.error(res.message || t('Operation failed'))
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>
            {t('Set Agent Level')} — {agent?.username}
          </DialogTitle>
        </DialogHeader>
        <div className='space-y-4 py-2'>
          <div className='space-y-1'>
            <Label>{t('Agent Level')}</Label>
            <Select value={level} onValueChange={setLevel}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='0'>{t('Not Agent')}</SelectItem>
                <SelectItem value='1'>{t('Level 1 Agent')}</SelectItem>
                <SelectItem value='2'>{t('Level 2 Agent')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className='space-y-1'>
            <Label>{t('Commission Rate')} (%)</Label>
            <Input
              type='number'
              min='0'
              max='100'
              step='0.1'
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              placeholder='e.g. 10 = 10%'
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant='outline' onClick={onClose} disabled={saving}>
            {t('Cancel')}
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? t('Saving...') : t('Save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
