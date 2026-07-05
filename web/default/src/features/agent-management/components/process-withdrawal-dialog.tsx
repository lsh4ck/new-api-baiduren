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
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { processWithdrawal } from '../api'
import type { Withdrawal } from '../types'

type Props = {
  withdrawal: Withdrawal | null
  action: 'approved' | 'rejected' | null
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

export function ProcessWithdrawalDialog({ withdrawal, action, open, onClose, onSuccess }: Props) {
  const { t } = useTranslation()
  const [remark, setRemark] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSubmit = async () => {
    if (!withdrawal || !action) return
    setSaving(true)
    try {
      const res = await processWithdrawal(withdrawal.id, action, remark)
      if (res.success) {
        toast.success(action === 'approved' ? t('Withdrawal approved') : t('Withdrawal rejected'))
        onSuccess()
        onClose()
        setRemark('')
      } else {
        toast.error(res.message || t('Operation failed'))
      }
    } finally {
      setSaving(false)
    }
  }

  const isApprove = action === 'approved'

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>
            {isApprove ? t('Approve Withdrawal') : t('Reject Withdrawal')}
          </DialogTitle>
        </DialogHeader>
        {withdrawal && (
          <div className='space-y-4 py-2'>
            <div className='rounded-lg border p-3 text-sm'>
              <p><span className='text-muted-foreground'>{t('Agent')}: </span>{withdrawal.agent_name}</p>
              <p><span className='text-muted-foreground'>{t('Amount')}: </span>
                <span className='font-semibold'>¥{withdrawal.amount.toFixed(2)}</span>
              </p>
              {withdrawal.remark && (
                <p><span className='text-muted-foreground'>{t('Note')}: </span>{withdrawal.remark}</p>
              )}
            </div>
            <div className='space-y-1'>
              <Label>{t('Admin Remark')} ({t('optional')})</Label>
              <Textarea
                rows={3}
                placeholder={isApprove ? t('Payment reference, transfer ID, etc.') : t('Reason for rejection')}
                value={remark}
                onChange={(e) => setRemark(e.target.value)}
              />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant='outline' onClick={onClose} disabled={saving}>
            {t('Cancel')}
          </Button>
          <Button
            variant={isApprove ? 'default' : 'destructive'}
            onClick={handleSubmit}
            disabled={saving}
          >
            {saving ? t('Processing...') : isApprove ? t('Approve') : t('Reject')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
