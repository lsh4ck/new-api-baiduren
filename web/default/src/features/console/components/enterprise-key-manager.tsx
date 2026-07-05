import { useEffect, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Trash2, Copy, RefreshCw, Power, PowerOff } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { enterpriseApi, type EnterpriseToken } from '../enterprise-api'

// ─── 新建 Key 对话框 ───

function CreateKeyDialog({ open, onClose, onSuccess }: {
  open: boolean
  onClose: () => void
  onSuccess: () => void
}) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [quota, setQuota] = useState('100000')
  const [unlimited, setUnlimited] = useState(false)
  const [modelLimits, setModelLimits] = useState('')
  const [allowIps, setAllowIps] = useState('')
  const [saving, setSaving] = useState(false)
  const [createdKey, setCreatedKey] = useState<string | null>(null)

  const handleCreate = async () => {
    if (!name.trim()) { toast.error(t('Name is required')); return }
    setSaving(true)
    try {
      const res = await enterpriseApi.createKey({
        name: name.trim(),
        remain_quota: unlimited ? 0 : parseInt(quota) || 100000,
        unlimited_quota: unlimited,
        model_limits: modelLimits ? modelLimits.split(',').map(s => s.trim()).filter(Boolean) : [],
        allow_ips: allowIps,
      })
      if (res.success && res.data) {
        setCreatedKey(res.data.key)
        onSuccess()
      } else {
        toast.error(res.message || t('Operation failed'))
      }
    } finally {
      setSaving(false)
    }
  }

  const handleClose = () => {
    setName('')
    setQuota('100000')
    setUnlimited(false)
    setModelLimits('')
    setAllowIps('')
    setCreatedKey(null)
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className='sm:max-w-lg'>
        <DialogHeader>
          <DialogTitle>{t('Create Enterprise API Key')}</DialogTitle>
          <DialogDescription>{t('Create a new API key with custom limits and restrictions')}</DialogDescription>
        </DialogHeader>

        {createdKey ? (
          <div className='space-y-3'>
            <p className='text-sm font-medium text-green-600'>{t('Key created! Copy it now — it won\'t be shown again.')}</p>
            <div className='flex items-center gap-2'>
              <code className='bg-muted flex-1 break-all rounded p-2 text-xs'>{createdKey}</code>
              <Button variant='outline' size='icon' onClick={() => { navigator.clipboard.writeText(createdKey); toast.success(t('Copied')) }}>
                <Copy className='size-4' />
              </Button>
            </div>
            <DialogFooter>
              <Button onClick={handleClose}>{t('Done')}</Button>
            </DialogFooter>
          </div>
        ) : (
          <>
            <div className='space-y-4 py-2'>
              <div>
                <Label>{t('Key Name')}</Label>
                <Input value={name} onChange={e => setName(e.target.value)} placeholder={t('e.g. Production Key')} />
              </div>
              <div className='flex items-center justify-between rounded-lg border px-4 py-3'>
                <div>
                  <div className='text-sm font-medium'>{t('Unlimited Quota')}</div>
                  <div className='text-muted-foreground text-xs'>{t('No quota limit on this key')}</div>
                </div>
                <Switch checked={unlimited} onCheckedChange={setUnlimited} />
              </div>
              {!unlimited && (
                <div>
                  <Label>{t('Quota Limit')}</Label>
                  <Input type='number' value={quota} onChange={e => setQuota(e.target.value)} />
                  <p className='text-muted-foreground mt-1 text-xs'>{t('In quota units (500000 = $1)')}</p>
                </div>
              )}
              <div>
                <Label>{t('Model Limits')} ({t('optional')})</Label>
                <Input
                  value={modelLimits}
                  onChange={e => setModelLimits(e.target.value)}
                  placeholder='gpt-4o, claude-sonnet-4-20250514'
                />
                <p className='text-muted-foreground mt-1 text-xs'>{t('Comma-separated model names. Empty = all models allowed.')}</p>
              </div>
              <div>
                <Label>{t('IP Whitelist')} ({t('optional')})</Label>
                <Input
                  value={allowIps}
                  onChange={e => setAllowIps(e.target.value)}
                  placeholder='192.168.1.0/24, 10.0.0.1'
                />
                <p className='text-muted-foreground mt-1 text-xs'>{t('Comma-separated IPs or CIDR ranges. Empty = all IPs allowed.')}</p>
              </div>
            </div>
            <DialogFooter>
              <Button variant='outline' onClick={handleClose} disabled={saving}>{t('Cancel')}</Button>
              <Button onClick={handleCreate} disabled={saving}>
                {saving ? t('Creating...') : t('Create Key')}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ─── 主组件 ───

export function EnterpriseKeyManager() {
  const { t } = useTranslation()
  const [tokens, setTokens] = useState<EnterpriseToken[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<EnterpriseToken | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await enterpriseApi.getKeys()
      setTokens(res.data || [])
      setTotal(res.total || 0)
    } catch {
      toast.error(t('Failed to load keys'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => { load() }, [load])

  const handleToggleStatus = async (token: EnterpriseToken) => {
    const newStatus = token.status === 1 ? 2 : 1
    const res = await enterpriseApi.toggleKeyStatus(token.id, newStatus as 1 | 2)
    if (res.success) {
      toast.success(newStatus === 1 ? t('Key enabled') : t('Key disabled'))
      load()
    } else {
      toast.error(res.message || t('Operation failed'))
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    const res = await enterpriseApi.deleteKey(deleteTarget.id)
    if (res.success) {
      toast.success(t('Key deleted'))
      setDeleteTarget(null)
      load()
    } else {
      toast.error(res.message || t('Operation failed'))
    }
  }

  return (
    <div className='space-y-4'>
      <div className='flex items-center justify-between'>
        <div>
          <h3 className='text-lg font-semibold'>{t('Enterprise API Keys')}</h3>
          <p className='text-muted-foreground text-sm'>{t('Total')}: {total}</p>
        </div>
        <div className='flex gap-2'>
          <Button variant='outline' size='sm' onClick={load} disabled={loading}>
            <RefreshCw className={`mr-1 size-4 ${loading ? 'animate-spin' : ''}`} />
            {t('Refresh')}
          </Button>
          <Button size='sm' onClick={() => setCreateOpen(true)}>
            <Plus className='mr-1 size-4' />
            {t('Create Key')}
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className='p-0'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('Name')}</TableHead>
                <TableHead>{t('Key')}</TableHead>
                <TableHead>{t('Status')}</TableHead>
                <TableHead>{t('Created By')}</TableHead>
                <TableHead>{t('Quota')}</TableHead>
                <TableHead>{t('Models')}</TableHead>
                <TableHead>{t('Created')}</TableHead>
                <TableHead className='w-20'>{t('Actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} className='text-muted-foreground py-8 text-center text-sm'>{t('Loading...')}</TableCell>
                </TableRow>
              ) : tokens.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className='text-muted-foreground py-8 text-center text-sm'>
                    {t('No API keys yet. Click Create Key to get started.')}
                  </TableCell>
                </TableRow>
              ) : (
                tokens.map((token) => (
                  <TableRow key={token.id}>
                    <TableCell className='font-medium'>{token.name}</TableCell>
                    <TableCell>
                      <div className='flex items-center gap-1'>
                        <code className='bg-muted rounded px-1.5 py-0.5 text-xs'>{token.key}</code>
                        <Button variant='ghost' size='icon' className='size-6'
                          onClick={() => { navigator.clipboard.writeText(token.key); toast.success(t('Copied')) }}>
                          <Copy className='size-3' />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell>
                      {token.status === 1
                        ? <Badge className='bg-green-500/20 text-green-700 dark:text-green-400'>{t('Active')}</Badge>
                        : <Badge variant='secondary'>{t('Disabled')}</Badge>
                      }
                    </TableCell>
                    <TableCell className='text-muted-foreground text-sm'>{token.creator_name || '—'}</TableCell>
                    <TableCell className='font-mono text-sm'>
                      {token.unlimited_quota ? '∞' : token.remain_quota.toLocaleString()}
                    </TableCell>
                    <TableCell>
                      {token.model_limits_enabled && token.model_limits
                        ? <Badge variant='outline' className='text-xs'>{token.model_limits.split(',').length} {t('models')}</Badge>
                        : <span className='text-muted-foreground text-xs'>{t('All')}</span>
                      }
                    </TableCell>
                    <TableCell className='text-muted-foreground text-xs'>
                      {format(new Date(token.created_time * 1000), 'MM-dd HH:mm')}
                    </TableCell>
                    <TableCell>
                      <div className='flex items-center gap-1'>
                        <Button variant='ghost' size='icon' className='size-7'
                          title={token.status === 1 ? t('Disable') : t('Enable')}
                          onClick={() => handleToggleStatus(token)}>
                          {token.status === 1
                            ? <PowerOff className='size-3.5 text-amber-500' />
                            : <Power className='size-3.5 text-green-500' />
                          }
                        </Button>
                        <Button variant='ghost' size='icon' className='size-7 text-red-500 hover:text-red-600'
                          title={t('Delete')} onClick={() => setDeleteTarget(token)}>
                          <Trash2 className='size-3.5' />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <CreateKeyDialog open={createOpen} onClose={() => setCreateOpen(false)} onSuccess={load} />

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('Delete API Key')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('This will permanently delete')} <strong>{deleteTarget?.name}</strong>. {t('This action cannot be undone.')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('Cancel')}</AlertDialogCancel>
            <AlertDialogAction className='bg-red-500 hover:bg-red-600' onClick={handleDelete}>
              {t('Delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
