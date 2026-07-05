import { useMemo } from 'react'
import { type ColumnDef } from '@tanstack/react-table'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, Clock, Zap } from 'lucide-react'
import { DataTableColumnHeader } from '@/components/data-table'
import { StatusBadge } from '@/components/status-badge'
import type { SubscriptionAccount } from '../types'
import { DataTableRowActions } from './data-table-row-actions'

function isRateLimited(account: SubscriptionAccount): boolean {
  if (!account.rate_limit_reset_at) return false
  return new Date(account.rate_limit_reset_at) > new Date()
}

function isOverloaded(account: SubscriptionAccount): boolean {
  if (!account.overload_until) return false
  return new Date(account.overload_until) > new Date()
}

export function useSubscriptionAccountsColumns(): ColumnDef<SubscriptionAccount>[] {
  const { t } = useTranslation()

  return useMemo(
    (): ColumnDef<SubscriptionAccount>[] => [
      {
        accessorFn: (row) => row.id,
        id: 'id',
        meta: { label: 'ID', mobileHidden: true },
        header: ({ column }) => <DataTableColumnHeader column={column} title='ID' />,
        cell: ({ row }) => (
          <span className='text-muted-foreground text-xs'>#{row.original.id}</span>
        ),
        size: 55,
      },
      {
        accessorFn: (row) => row.platform,
        id: 'platform',
        meta: { label: t('Platform'), mobileBadge: true },
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Platform')} />
        ),
        cell: ({ row }) => {
          const platform = row.original.platform
          const label = platform.charAt(0).toUpperCase() + platform.slice(1)
          return (
            <StatusBadge
              label={label}
              variant={
                platform === 'claude'
                  ? 'warning'
                  : platform === 'codex'
                    ? 'info'
                    : platform === 'gemini'
                      ? 'success'
                      : 'neutral'
              }
              copyable={false}
            />
          )
        },
        size: 95,
      },
      {
        accessorFn: (row) => row.account_name,
        id: 'account_name',
        meta: { label: t('Account Name'), mobileTitle: true },
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Account Name')} />
        ),
        cell: ({ row }) => {
          const account = row.original
          const rateLimited = isRateLimited(account)
          const overloaded = isOverloaded(account)
          return (
            <div className='flex items-center gap-1.5 max-w-[200px]'>
              <div className='min-w-0'>
                <div className='truncate font-medium text-sm'>{account.account_name}</div>
                {account.email && (
                  <div className='text-muted-foreground truncate text-xs'>{account.email}</div>
                )}
              </div>
              {rateLimited && (
                <Clock className='text-destructive h-3.5 w-3.5 shrink-0' title={t('Rate Limited')} />
              )}
              {overloaded && !rateLimited && (
                <AlertTriangle className='text-warning h-3.5 w-3.5 shrink-0' title={t('Overloaded')} />
              )}
            </div>
          )
        },
        size: 200,
      },
      {
        accessorFn: (row) => row.status,
        id: 'status',
        meta: { label: t('Status'), mobileBadge: true },
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Status')} />
        ),
        cell: ({ row }) => {
          const account = row.original
          const rateLimited = isRateLimited(account)
          const overloaded = isOverloaded(account)

          if (rateLimited) {
            return <StatusBadge label={t('Rate Limited')} variant='danger' copyable={false} />
          }
          if (overloaded) {
            return <StatusBadge label={t('Overloaded')} variant='warning' copyable={false} />
          }

          const status = account.status
          return (
            <StatusBadge
              label={t(status)}
              variant={
                status === 'active'
                  ? 'success'
                  : status === 'expired'
                    ? 'warning'
                    : status === 'error'
                      ? 'danger'
                      : 'neutral'
              }
              copyable={false}
            />
          )
        },
        size: 100,
      },
      {
        accessorFn: (row) => row.priority,
        id: 'priority',
        meta: { label: t('Priority'), mobileHidden: true },
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Priority')} />
        ),
        cell: ({ row }) => {
          const p = row.original.priority ?? 0
          return (
            <div className='flex items-center gap-1'>
              <Zap className='text-muted-foreground h-3 w-3' />
              <span className='text-muted-foreground text-xs'>{p}</span>
            </div>
          )
        },
        size: 75,
      },
      {
        accessorFn: (row) => row.used_this_month,
        id: 'usage',
        meta: { label: t('Usage'), mobileHidden: true },
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Usage')} />
        ),
        cell: ({ row }) => {
          const used = row.original.used_this_month || 0
          const limit = row.original.usage_limit || 0
          if (limit > 0) {
            const pct = Math.min(100, Math.round((used / limit) * 100))
            const color =
              pct >= 90 ? 'bg-destructive' : pct >= 70 ? 'bg-amber-500' : 'bg-emerald-500'
            return (
              <div className='flex flex-col gap-1'>
                <span className='text-muted-foreground text-xs'>
                  {used.toFixed(0)} / {limit.toFixed(0)}
                </span>
                <div className='bg-muted h-1.5 w-16 overflow-hidden rounded-full'>
                  <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
                </div>
              </div>
            )
          }
          return <span className='text-muted-foreground text-xs'>{used.toFixed(0)}</span>
        },
        size: 110,
      },
      {
        accessorFn: (row) => row.expires_at,
        id: 'expires_at',
        meta: { label: t('Expires At'), mobileHidden: true },
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Expires At')} />
        ),
        cell: ({ row }) => {
          const date = row.original.expires_at
          const accountType = row.original.account_type
          if (!date || accountType === 'api_key' || accountType === 'bedrock') {
            return <span className='text-muted-foreground text-xs'>∞</span>
          }
          const d = new Date(date)
          const isExpired = d.getTime() < Date.now()
          return (
            <span className={isExpired ? 'text-destructive text-xs' : 'text-muted-foreground text-xs'}>
              {d.toLocaleDateString()}
            </span>
          )
        },
        size: 110,
      },
      {
        id: 'actions',
        cell: ({ row }) => <DataTableRowActions row={row} />,
        size: 60,
      },
    ],
    [t]
  )
}
