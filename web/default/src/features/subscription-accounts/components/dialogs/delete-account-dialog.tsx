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
import { deleteSubscriptionAccount } from '../../api'
import { useSubscriptionAccounts } from '../subscription-accounts-provider'

export function DeleteAccountDialog() {
  const { t } = useTranslation()
  const { open, setOpen, currentRow, triggerRefresh } = useSubscriptionAccounts()
  const [isSubmitting, setIsSubmitting] = useState(false)

  const onConfirm = async () => {
    if (!currentRow) return
    setIsSubmitting(true)
    try {
      const res = await deleteSubscriptionAccount(currentRow.id)
      if (res.success) {
        toast.success(t('Delete succeeded'))
        setOpen(null)
        triggerRefresh()
      } else {
        toast.error(res.message || t('Delete failed'))
      }
    } catch {
      toast.error(t('Request failed'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <AlertDialog open={open === 'delete'} onOpenChange={() => setOpen(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('Confirm Delete')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('Are you sure you want to delete account')}{' '}
            <strong>{currentRow?.account_name}</strong>?
            {t('This action cannot be undone.')}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => setOpen(null)}>
            {t('Cancel')}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={isSubmitting}
            className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
          >
            {isSubmitting ? t('Deleting...') : t('Delete')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
