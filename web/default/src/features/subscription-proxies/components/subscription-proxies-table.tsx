import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, MoreHorizontal, Pencil, TestTube2, Trash2, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { StatusBadge } from '@/components/status-badge'
import { getSubscriptionProxies, testSubscriptionProxy } from '../../subscription-accounts/api'
import type { SubscriptionProxy } from '../../subscription-accounts/types'
import { useSubscriptionProxies } from './subscription-proxies-provider'

export function SubscriptionProxiesTable() {
  const { t } = useTranslation()
  const { setOpen, setCurrentRow, refreshTrigger, triggerRefresh } = useSubscriptionProxies()
  const [proxies, setProxies] = useState<SubscriptionProxy[]>([])
  const [loading, setLoading] = useState(true)
  const [testingId, setTestingId] = useState<number | null>(null)

  useEffect(() => {
    setLoading(true)
    getSubscriptionProxies({ size: 100 })
      .then((res) => {
        if (res.success && res.data) setProxies(res.data.proxies)
        else toast.error(res.message || t('Failed to load proxies'))
      })
      .catch(() => toast.error(t('Request failed')))
      .finally(() => setLoading(false))
  }, [refreshTrigger, t])

  const handleTest = async (proxy: SubscriptionProxy) => {
    setTestingId(proxy.id)
    try {
      const res = await testSubscriptionProxy(proxy.id)
      if (res.success && res.data?.ok) {
        toast.success(`${proxy.name}: ${res.data.message}`)
      } else {
        toast.error(`${proxy.name}: ${res.data?.message || res.message}`)
      }
      triggerRefresh()
    } catch {
      toast.error(t('Request failed'))
    } finally {
      setTestingId(null)
    }
  }

  if (loading) {
    return <div className='text-muted-foreground py-8 text-center text-sm'>{t('Loading...')}</div>
  }

  if (proxies.length === 0) {
    return (
      <div className='text-muted-foreground py-8 text-center text-sm'>
        {t('No proxies yet. Click "Add Proxy" to create one.')}
      </div>
    )
  }

  return (
    <div className='rounded-md border'>
      <table className='w-full text-sm'>
        <thead>
          <tr className='border-b bg-muted/40'>
            <th className='px-4 py-3 text-left font-medium'>ID</th>
            <th className='px-4 py-3 text-left font-medium'>{t('Name')}</th>
            <th className='px-4 py-3 text-left font-medium'>{t('URL')}</th>
            <th className='px-4 py-3 text-left font-medium'>{t('Status')}</th>
            <th className='px-4 py-3 text-left font-medium'>{t('Health')}</th>
            <th className='px-4 py-3 text-left font-medium'>{t('Fail Count')}</th>
            <th className='px-4 py-3 text-left font-medium'>{t('Last Checked')}</th>
            <th className='px-4 py-3 text-right font-medium'>{t('Actions')}</th>
          </tr>
        </thead>
        <tbody>
          {proxies.map((p) => (
            <tr key={p.id} className='border-b last:border-0 hover:bg-muted/20 transition-colors'>
              <td className='text-muted-foreground px-4 py-3 text-xs'>#{p.id}</td>
              <td className='px-4 py-3 font-medium'>
                <div>{p.name}</div>
                {p.description && (
                  <div className='text-muted-foreground text-xs truncate max-w-[150px]'>{p.description}</div>
                )}
              </td>
              <td className='px-4 py-3'>
                <code className='text-muted-foreground text-xs bg-muted rounded px-1.5 py-0.5 max-w-[220px] block truncate'>
                  {p.url}
                </code>
              </td>
              <td className='px-4 py-3'>
                <StatusBadge
                  label={t(p.status)}
                  variant={p.status === 'active' ? 'success' : 'neutral'}
                  copyable={false}
                />
              </td>
              <td className='px-4 py-3'>
                {p.is_healthy ? (
                  <CheckCircle2 className='h-4 w-4 text-emerald-500' />
                ) : (
                  <XCircle className='h-4 w-4 text-destructive' />
                )}
              </td>
              <td className='text-muted-foreground px-4 py-3 text-xs'>
                {p.fail_count > 0 ? (
                  <span className='text-destructive'>{p.fail_count}</span>
                ) : (
                  '0'
                )}
              </td>
              <td className='text-muted-foreground px-4 py-3 text-xs'>
                {p.last_checked_at
                  ? new Date(p.last_checked_at).toLocaleString()
                  : '-'}
              </td>
              <td className='px-4 py-3 text-right'>
                <DropdownMenu>
                  <DropdownMenuTrigger render={<Button variant='ghost' className='h-8 w-8 p-0' />}>
                    <MoreHorizontal className='h-4 w-4' />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align='end'>
                    <DropdownMenuItem onClick={() => handleTest(p)} disabled={testingId === p.id}>
                      <TestTube2 className='mr-2 h-4 w-4' />
                      {testingId === p.id ? t('Testing...') : t('Test Proxy')}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => {
                        setCurrentRow(p)
                        setOpen('update')
                      }}
                    >
                      <Pencil className='mr-2 h-4 w-4' />
                      {t('Edit')}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => {
                        setCurrentRow(p)
                        setOpen('delete')
                      }}
                      className='text-destructive'
                    >
                      <Trash2 className='mr-2 h-4 w-4' />
                      {t('Delete')}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
