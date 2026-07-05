import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { StatusBadge } from '@/components/status-badge'
import { getSubscriptionGroups } from '../../subscription-accounts/api'
import type { SubscriptionGroup } from '../../subscription-accounts/types'
import { useSubscriptionGroups } from './subscription-groups-provider'

export function SubscriptionGroupsTable() {
  const { t } = useTranslation()
  const { setOpen, setCurrentRow, refreshTrigger } = useSubscriptionGroups()
  const [groups, setGroups] = useState<SubscriptionGroup[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    getSubscriptionGroups({ size: 100 })
      .then((res) => {
        if (res.success && res.data) setGroups(res.data.groups)
        else toast.error(res.message || t('Failed to load groups'))
      })
      .catch(() => toast.error(t('Request failed')))
      .finally(() => setLoading(false))
  }, [refreshTrigger, t])

  if (loading) {
    return <div className='text-muted-foreground py-8 text-center text-sm'>{t('Loading...')}</div>
  }

  if (groups.length === 0) {
    return (
      <div className='text-muted-foreground py-8 text-center text-sm'>
        {t('No groups yet. Click "Add Group" to create one.')}
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
            <th className='px-4 py-3 text-left font-medium'>{t('Platform')}</th>
            <th className='px-4 py-3 text-left font-medium'>{t('Status')}</th>
            <th className='px-4 py-3 text-left font-medium'>{t('RPM Limit')}</th>
            <th className='px-4 py-3 text-left font-medium'>{t('MCP XML')}</th>
            <th className='px-4 py-3 text-left font-medium'>{t('Monthly Limit')}</th>
            <th className='px-4 py-3 text-right font-medium'>{t('Actions')}</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <tr key={g.id} className='border-b last:border-0 hover:bg-muted/20 transition-colors'>
              <td className='text-muted-foreground px-4 py-3 text-xs'>#{g.id}</td>
              <td className='px-4 py-3 font-medium'>
                <div>{g.name}</div>
                {g.description && (
                  <div className='text-muted-foreground text-xs truncate max-w-[200px]'>{g.description}</div>
                )}
              </td>
              <td className='px-4 py-3'>
                <StatusBadge
                  label={g.platform}
                  variant={g.platform === 'claude' ? 'warning' : g.platform === 'gemini' ? 'success' : 'info'}
                  copyable={false}
                />
              </td>
              <td className='px-4 py-3'>
                <StatusBadge
                  label={t(g.status)}
                  variant={g.status === 'active' ? 'success' : 'neutral'}
                  copyable={false}
                />
              </td>
              <td className='text-muted-foreground px-4 py-3 text-xs'>
                {g.rpm_limit > 0 ? g.rpm_limit : '∞'}
              </td>
              <td className='px-4 py-3'>
                {g.mcp_xml_enabled ? (
                  <StatusBadge label={t('On')} variant='success' copyable={false} />
                ) : (
                  <span className='text-muted-foreground text-xs'>-</span>
                )}
              </td>
              <td className='text-muted-foreground px-4 py-3 text-xs'>
                {g.monthly_spending_limit > 0 ? `$${g.monthly_spending_limit}` : '∞'}
              </td>
              <td className='px-4 py-3 text-right'>
                <DropdownMenu>
                  <DropdownMenuTrigger render={<Button variant='ghost' className='h-8 w-8 p-0' />}>
                    <MoreHorizontal className='h-4 w-4' />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align='end'>
                    <DropdownMenuItem
                      onClick={() => {
                        setCurrentRow(g)
                        setOpen('update')
                      }}
                    >
                      <Pencil className='mr-2 h-4 w-4' />
                      {t('Edit')}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => {
                        setCurrentRow(g)
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
