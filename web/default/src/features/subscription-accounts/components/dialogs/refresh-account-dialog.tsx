import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { refreshSubscriptionAccount } from '../../api'
import { useSubscriptionAccounts } from '../subscription-accounts-provider'

export function RefreshAccountDialog() {
  const { t } = useTranslation()
  const { open, setOpen, currentRow, triggerRefresh } = useSubscriptionAccounts()
  const [isSubmitting, setIsSubmitting] = useState(false)

  const onConfirm = async () => {
    if (!currentRow) return
    setIsSubmitting(true)
    try {
      const res = await refreshSubscriptionAccount(currentRow.id)
      if (res.success) {
        toast.success(t('Token refresh succeeded'))
        setOpen(null)
        triggerRefresh()
      } else {
        toast.error(res.message || t('Token refresh failed'))
      }
    } catch {
      toast.error(t('Request failed'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <AlertDialog open={open === 'refresh'} onOpenChange={() => setOpen(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('Confirm Refresh Token')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('Refresh access token for account')}{' '}
            <strong>{currentRow?.account_name}</strong>?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => setOpen(null)}>
            {t('Cancel')}
          </AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} disabled={isSubmitting}>
            {isSubmitting ? t('Refreshing...') : t('Refresh')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
