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
import { createSubscriptionProxy, updateSubscriptionProxy } from '../../subscription-accounts/api'
import type { SubscriptionProxy } from '../../subscription-accounts/types'

interface Props {
  open: boolean
  proxy: SubscriptionProxy | null
  onClose: () => void
  onSuccess: () => void
}

export function SubscriptionProxyMutateDialog({ open, proxy, onClose, onSuccess }: Props) {
  const { t } = useTranslation()
  const isEdit = !!proxy

  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [status, setStatus] = useState('active')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (proxy) {
      setName(proxy.name)
      setUrl(proxy.url)
      setStatus(proxy.status)
      setDescription(proxy.description || '')
    } else {
      setName('')
      setUrl('')
      setStatus('active')
      setDescription('')
    }
  }, [proxy, open])

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error(t('Name is required'))
      return
    }
    if (!url.trim()) {
      toast.error(t('URL is required'))
      return
    }
    setLoading(true)
    try {
      const payload = { name: name.trim(), url: url.trim(), status, description: description.trim() }
      const res = isEdit
        ? await updateSubscriptionProxy(proxy!.id, payload)
        : await createSubscriptionProxy(payload)
      if (res.success) {
        toast.success(isEdit ? t('Proxy updated') : t('Proxy created'))
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
      <DialogContent className='max-w-md'>
        <DialogHeader>
          <DialogTitle>{isEdit ? t('Edit Proxy') : t('Add Proxy')}</DialogTitle>
          <DialogDescription>
            {t('Supports HTTP, HTTPS, SOCKS5 proxy URLs')}
          </DialogDescription>
        </DialogHeader>

        <div className='grid gap-4 py-2'>
          <div className='grid gap-1.5'>
            <Label>{t('Name')} *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder='e.g. LA-SOCKS5' />
          </div>
          <div className='grid gap-1.5'>
            <Label>{t('URL')} *</Label>
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder='socks5://user:pass@127.0.0.1:1080'
              className='font-mono text-sm'
            />
          </div>
          <div className='grid gap-1.5'>
            <Label>{t('Description')}</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} />
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

        <DialogFooter>
          <Button variant='outline' onClick={onClose}>{t('Cancel')}</Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? t('Saving...') : isEdit ? t('Save') : t('Add')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
