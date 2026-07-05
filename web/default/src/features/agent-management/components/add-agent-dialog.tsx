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
import { searchUsersForAgent, setAgentLevel } from '../api'
import type { UserSearchResult } from '../types'

type Props = {
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

export function AddAgentDialog({ open, onClose, onSuccess }: Props) {
  const { t } = useTranslation()
  const [keyword, setKeyword] = useState('')
  const [results, setResults] = useState<UserSearchResult[]>([])
  const [selected, setSelected] = useState<UserSearchResult | null>(null)
  const [level, setLevel] = useState('1')
  const [rate, setRate] = useState('10')
  const [searching, setSearching] = useState(false)
  const [saving, setSaving] = useState(false)

  const handleSearch = async () => {
    if (!keyword.trim()) return
    setSearching(true)
    try {
      const res = await searchUsersForAgent(keyword)
      setResults(res.data || [])
    } finally {
      setSearching(false)
    }
  }

  const handleSave = async () => {
    if (!selected) return
    const lvl = parseInt(level)
    const rateVal = parseFloat(rate) / 100
    setSaving(true)
    try {
      const res = await setAgentLevel(selected.id, lvl, rateVal)
      if (res.success) {
        toast.success(t('Agent added successfully'))
        onSuccess()
        onClose()
        setKeyword('')
        setResults([])
        setSelected(null)
      } else {
        toast.error(res.message || t('Operation failed'))
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className='sm:max-w-lg'>
        <DialogHeader>
          <DialogTitle>{t('Add Agent')}</DialogTitle>
        </DialogHeader>
        <div className='space-y-4 py-2'>
          <div className='space-y-1'>
            <Label>{t('Search User')}</Label>
            <div className='flex gap-2'>
              <Input
                placeholder={t('Username or email')}
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              />
              <Button variant='outline' onClick={handleSearch} disabled={searching}>
                {searching ? t('Searching...') : t('Search')}
              </Button>
            </div>
          </div>

          {results.length > 0 && (
            <div className='space-y-1'>
              <Label>{t('Select User')}</Label>
              <div className='max-h-40 overflow-y-auto rounded-md border'>
                {results.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => setSelected(u)}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-muted ${
                      selected?.id === u.id ? 'bg-primary/10 font-medium' : ''
                    }`}
                  >
                    <span className='font-medium'>{u.username}</span>
                    <span className='text-muted-foreground'>{u.email}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {selected && (
            <>
              <div className='space-y-1'>
                <Label>{t('Agent Level')}</Label>
                <Select value={level} onValueChange={setLevel}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
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
                />
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant='outline' onClick={onClose} disabled={saving}>
            {t('Cancel')}
          </Button>
          <Button onClick={handleSave} disabled={saving || !selected}>
            {saving ? t('Saving...') : t('Confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
