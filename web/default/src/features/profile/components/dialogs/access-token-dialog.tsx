import { useEffect, useState } from 'react'
import { RefreshCw, Loader2, ShieldCheck } from 'lucide-react'
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
import { Textarea } from '@/components/ui/textarea'
import { CopyButton } from '@/components/copy-button'
import { useAccessToken } from '../../hooks'
import { updateAccessTokenAllowIps } from '../../api'
import { useAuthStore } from '@/stores/auth-store'

// ============================================================================
// Access Token Dialog Component
// ============================================================================

interface AccessTokenDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function AccessTokenDialog({
  open,
  onOpenChange,
}: AccessTokenDialogProps) {
  const { t } = useTranslation()
  const { token, generating, generate } = useAccessToken()
  const user = useAuthStore((s) => s.auth.user) as
    | { access_token_allow_ips?: string }
    | null
  const [allowIps, setAllowIps] = useState(user?.access_token_allow_ips || '')
  const [savingIps, setSavingIps] = useState(false)

  // Auto-generate token when dialog opens if no token exists
  useEffect(() => {
    if (open && !token) {
      generate()
    }
  }, [open, token, generate])

  useEffect(() => {
    if (open) {
      setAllowIps(user?.access_token_allow_ips || '')
    }
  }, [open, user?.access_token_allow_ips])

  const handleSaveAllowIps = async () => {
    setSavingIps(true)
    try {
      const res = await updateAccessTokenAllowIps(allowIps.trim())
      if (res.success) {
        toast.success(t('IP whitelist saved'))
      } else {
        toast.error(res.message || t('Save failed'))
      }
    } finally {
      setSavingIps(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>{t('Access Token')}</DialogTitle>
          <DialogDescription>
            {t(
              "Your system access token for API authentication. Keep it secure and don't share it with others."
            )}
          </DialogDescription>
        </DialogHeader>

        <div className='my-6 space-y-4'>
          <div className='space-y-2'>
            <Label htmlFor='token'>{t('Token')}</Label>
            <div className='flex gap-2'>
              <Input
                id='token'
                type='text'
                value={token}
                readOnly
                className='font-mono text-xs'
                placeholder={t('Click "Generate" to create a token')}
              />
              <CopyButton
                value={token}
                variant='outline'
                className='size-9'
                iconClassName='size-4'
                tooltip={t('Copy token')}
                aria-label={t('Copy token')}
              />
            </div>
            <p className='text-muted-foreground text-xs'>
              {t('Use this token for API authentication')}
            </p>
          </div>

          <div className='space-y-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3'>
            <div className='flex items-center gap-2'>
              <ShieldCheck className='size-4 text-amber-500' />
              <Label htmlFor='allow_ips' className='text-sm font-medium'>
                {t('IP Whitelist')}
              </Label>
            </div>
            <Textarea
              id='allow_ips'
              value={allowIps}
              onChange={(e) => setAllowIps(e.target.value)}
              placeholder={t(
                'Allow only specific IPs to use this access token. One per line; supports CIDR (e.g. 10.0.0.0/8). Leave empty to allow any IP.'
              )}
              rows={3}
              className='font-mono text-xs'
            />
            <div className='flex items-center justify-between'>
              <p className='text-muted-foreground text-xs'>
                {allowIps.trim()
                  ? t('Only listed IPs can call the API with this token.')
                  : t('Currently unrestricted — any IP can use this token.')}
              </p>
              <Button
                size='sm'
                variant='outline'
                onClick={handleSaveAllowIps}
                disabled={savingIps}
              >
                {savingIps ? t('Saving...') : t('Save')}
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            type='button'
            variant='outline'
            onClick={() => onOpenChange(false)}
          >
            {t('Close')}
          </Button>
          <Button
            type='button'
            onClick={generate}
            disabled={generating}
            className='gap-2'
          >
            {generating ? (
              <Loader2 className='h-4 w-4 animate-spin' />
            ) : (
              <RefreshCw className='h-4 w-4' />
            )}
            {generating ? t('Generating...') : t('Regenerate')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
