import { useState } from 'react'
import { type Row } from '@tanstack/react-table'
import { MoreHorizontal, Pencil, RefreshCw, ShieldOff, TestTube2, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { testSubscriptionAccount, resetAccountRateLimit } from '../api'
import type { SubscriptionAccount } from '../types'
import { useSubscriptionAccounts } from './subscription-accounts-provider'

interface DataTableRowActionsProps {
  row: Row<SubscriptionAccount>
}

export function DataTableRowActions({ row }: DataTableRowActionsProps) {
  const { t } = useTranslation()
  const { setOpen, setCurrentRow, triggerRefresh } = useSubscriptionAccounts()
  const [testLoading, setTestLoading] = useState(false)

  const handleTest = async () => {
    setTestLoading(true)
    try {
      const res = await testSubscriptionAccount(row.original.id)
      if (res.success && res.data?.ok) {
        toast.success(res.data.message || t('Account verified successfully'))
      } else {
        toast.error(res.data?.message || res.message || t('Account verification failed'))
      }
    } catch {
      toast.error(t('Request failed'))
    } finally {
      setTestLoading(false)
    }
  }

  const handleResetRateLimit = async () => {
    try {
      const res = await resetAccountRateLimit(row.original.id)
      if (res.success) {
        toast.success(t('Rate limit cleared'))
        triggerRefresh()
      } else {
        toast.error(res.message || t('Failed to clear rate limit'))
      }
    } catch {
      toast.error(t('Request failed'))
    }
  }

  const isRateLimited =
    row.original.rate_limit_reset_at &&
    new Date(row.original.rate_limit_reset_at) > new Date()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant='ghost' className='h-8 w-8 p-0' />}>
        <MoreHorizontal className='h-4 w-4' />
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end'>
        <DropdownMenuItem
          onClick={() => {
            setCurrentRow(row.original)
            setOpen('update')
          }}
        >
          <Pencil className='mr-2 h-4 w-4' />
          {t('Edit')}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleTest} disabled={testLoading}>
          <TestTube2 className='mr-2 h-4 w-4' />
          {testLoading ? t('Testing...') : t('Test Account')}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            setCurrentRow(row.original)
            setOpen('refresh')
          }}
        >
          <RefreshCw className='mr-2 h-4 w-4' />
          {t('Refresh Token')}
        </DropdownMenuItem>
        {isRateLimited && (
          <DropdownMenuItem onClick={handleResetRateLimit}>
            <ShieldOff className='mr-2 h-4 w-4' />
            {t('Clear Rate Limit')}
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => {
            setCurrentRow(row.original)
            setOpen('delete')
          }}
          className='text-destructive'
        >
          <Trash2 className='mr-2 h-4 w-4' />
          {t('Delete')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
