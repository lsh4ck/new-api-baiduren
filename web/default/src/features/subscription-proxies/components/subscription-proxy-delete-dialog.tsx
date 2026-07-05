import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
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
import { deleteSubscriptionProxy } from '../../subscription-accounts/api'
import type { SubscriptionProxy } from '../../subscription-accounts/types'

interface Props {
  open: boolean
  proxy: SubscriptionProxy
  onClose: () => void
  onSuccess: () => void
}

export function SubscriptionProxyDeleteDialog({ open, proxy, onClose, onSuccess }: Props) {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(false)

  const handleDelete = async () => {
    setLoading(true)
    try {
      const res = await deleteSubscriptionProxy(proxy.id)
      if (res.success) {
        toast.success(t('Proxy deleted'))
        onSuccess()
      } else {
        toast.error(res.message || t('Delete failed'))
      }
    } catch {
      toast.error(t('Request failed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={(v) => !v && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('Delete Proxy')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('Are you sure you want to delete proxy')} <strong>{proxy.name}</strong>?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onClose}>{t('Cancel')}</AlertDialogCancel>
          <AlertDialogAction asChild>
            <Button variant='destructive' onClick={handleDelete} disabled={loading}>
              {loading ? t('Deleting...') : t('Delete')}
            </Button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
