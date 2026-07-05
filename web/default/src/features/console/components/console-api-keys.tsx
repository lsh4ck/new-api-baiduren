import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Copy, Trash2, Key, Check, Eye, EyeOff } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
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
import { getApiKeys, createApiKey, deleteApiKey } from '@/features/keys/api'
import { formatDate, maskKey } from '../lib/utils'

function formatStatus(status: number): string {
  switch (status) {
    case 1:
      return 'active'
    case 2:
      return 'disabled'
    case 3:
      return 'expired'
    default:
      return 'disabled'
  }
}

// ─── 创建 Key 对话框 ───

interface CreateKeyDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

function CreateKeyDialog({ open, onOpenChange }: CreateKeyDialogProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [modelLimits, setModelLimits] = useState('')

  const createMutation = useMutation({
    mutationFn: () =>
      createApiKey({
        name,
        remain_quota: 0,
        expired_time: -1,
        unlimited_quota: true,
        model_limits_enabled: !!modelLimits.trim(),
        model_limits: modelLimits.trim(),
        allow_ips: '',
        group: '',
        cross_group_retry: false,
      }),
    onSuccess: () => {
      toast.success(t('API Key created'))
      setName('')
      setModelLimits('')
      onOpenChange(false)
      queryClient.invalidateQueries({ queryKey: ['console', 'api-keys'] })
    },
    onError: () => {
      toast.error(t('Failed to create API Key'))
    },
  })

  const handleCreate = async () => {
    if (!name.trim()) return
    createMutation.mutate()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('Create API Key')}</DialogTitle>
          <DialogDescription>
            {t('Enter a name and optional model restrictions')}
          </DialogDescription>
        </DialogHeader>
        <div className='space-y-4 py-2'>
          <div>
            <Label>{t('Key Name')}</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder='e.g. Production API'
            />
          </div>
          <div>
            <Label>{t('Model Restrictions')} ({t('Optional')})</Label>
            <Input
              value={modelLimits}
              onChange={(e) => setModelLimits(e.target.value)}
              placeholder='e.g. gpt-4o, claude-sonnet-4'
            />
            <p className='text-muted-foreground mt-1 text-xs'>
              {t('Comma-separated model names. Leave empty for all models.')}
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant='outline' onClick={() => onOpenChange(false)}>
            {t('Cancel')}
          </Button>
          <Button onClick={handleCreate} disabled={createMutation.isPending || !name.trim()}>
            {createMutation.isPending ? t('Creating...') : t('Create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── 主组件 ───

export function ConsoleApiKeys() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null)
  const [copiedId, setCopiedId] = useState<number | null>(null)
  const [visibleKeys, setVisibleKeys] = useState<Set<number>>(new Set())

  const { data, isLoading } = useQuery({
    queryKey: ['console', 'api-keys'],
    queryFn: async () => {
      const res = await getApiKeys({ p: 1, size: 100 })
      return res.data?.items ?? []
    },
  })

  const keys = data ?? []

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteApiKey(id),
    onSuccess: () => {
      toast.success(t('API Key deleted'))
      setDeleteTarget(null)
      queryClient.invalidateQueries({ queryKey: ['console', 'api-keys'] })
    },
    onError: () => {
      toast.error(t('Failed to delete API Key'))
    },
  })

  const handleCopy = (keyStr: string, id: number) => {
    void navigator.clipboard.writeText(keyStr)
    setCopiedId(id)
    toast.success(t('API Key copied to clipboard'))
    setTimeout(() => setCopiedId(null), 2000)
  }

  const handleDelete = () => {
    if (deleteTarget == null) return
    deleteMutation.mutate(deleteTarget)
  }

  const toggleVisibility = (id: number) => {
    setVisibleKeys((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className='space-y-4'>
      <div className='flex items-center justify-between'>
        <div>
          <h3 className='text-lg font-semibold'>{t('API Keys')}</h3>
          <p className='text-muted-foreground text-sm'>
            {t('Manage your API keys for accessing the service')}
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className='mr-1 size-4' />
          {t('Create Key')}
        </Button>
      </div>

      <Card>
        <CardContent className='p-0'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('Name')}</TableHead>
                <TableHead>{t('Key')}</TableHead>
                <TableHead>{t('Status')}</TableHead>
                <TableHead className='text-right'>{t('Usage')}</TableHead>
                <TableHead className='text-right'>{t('Last Used')}</TableHead>
                <TableHead className='text-right'>{t('Actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className='h-4 w-24' /></TableCell>
                    <TableCell><Skeleton className='h-4 w-32' /></TableCell>
                    <TableCell><Skeleton className='h-4 w-16' /></TableCell>
                    <TableCell><Skeleton className='h-4 w-20' /></TableCell>
                    <TableCell><Skeleton className='h-4 w-16' /></TableCell>
                    <TableCell><Skeleton className='h-4 w-8' /></TableCell>
                  </TableRow>
                ))
              ) : keys.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className='text-center text-muted-foreground py-8'>
                    {t('No API keys found')}
                  </TableCell>
                </TableRow>
              ) : (
                keys.map((key) => {
                  const statusLabel = formatStatus(key.status)
                  return (
                    <TableRow key={key.id}>
                      <TableCell>
                        <div className='flex items-center gap-2'>
                          <Key className='size-3.5 text-muted-foreground' />
                          <span className='font-medium'>{key.name}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className='flex items-center gap-2 font-mono text-sm'>
                          <span className='text-muted-foreground'>
                            {visibleKeys.has(key.id) ? maskKey(key.key) : maskKey(key.key)}
                          </span>
                          <Button
                            variant='ghost'
                            size='icon'
                            className='size-6'
                            onClick={() => toggleVisibility(key.id)}
                          >
                            {visibleKeys.has(key.id) ? (
                              <EyeOff className='size-3' />
                            ) : (
                              <Eye className='size-3' />
                            )}
                          </Button>
                          <Button
                            variant='ghost'
                            size='icon'
                            className='size-6'
                            onClick={() => handleCopy(key.key, key.id)}
                          >
                            {copiedId === key.id ? (
                              <Check className='size-3 text-green-500' />
                            ) : (
                              <Copy className='size-3' />
                            )}
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={statusLabel === 'active' ? 'default' : statusLabel === 'disabled' ? 'secondary' : 'destructive'}
                        >
                          {statusLabel === 'active'
                            ? t('Active')
                            : statusLabel === 'disabled'
                            ? t('Disabled')
                            : t('Expired')}
                        </Badge>
                      </TableCell>
                      <TableCell className='text-right'>
                        <div className='text-sm'>
                          <div>{(key.used_quota ?? 0).toLocaleString()}</div>
                          <div className='text-muted-foreground text-xs'>
                            {key.unlimited_quota ? t('Unlimited') : `${(key.remain_quota ?? 0).toLocaleString()} ${t('remaining')}`}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className='text-right'>
                        <span className='text-muted-foreground text-xs'>
                          {key.accessed_time > 0 ? formatDate(new Date(key.accessed_time * 1000).toISOString()) : t('Never')}
                        </span>
                      </TableCell>
                      <TableCell className='text-right'>
                        <Button
                          variant='ghost'
                          size='icon'
                          className='size-7 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950'
                          onClick={() => setDeleteTarget(key.id)}
                        >
                          <Trash2 className='size-3.5' />
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* 创建 Key 对话框 */}
      <CreateKeyDialog open={createOpen} onOpenChange={setCreateOpen} />

      {/* 删除确认对话框 */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('Delete API Key')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('Are you sure you want to delete this API key? This action cannot be undone.')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('Cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className='bg-red-500 hover:bg-red-600'>
              {t('Delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
