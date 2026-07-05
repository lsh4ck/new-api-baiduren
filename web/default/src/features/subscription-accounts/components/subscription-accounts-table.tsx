import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  type SortingState,
  type VisibilityState,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { useTranslation } from 'react-i18next'
import { DataTablePage } from '@/components/data-table'
import { getSubscriptionAccounts } from '../api'
import { useSubscriptionAccountsColumns } from './subscription-accounts-columns'
import { useSubscriptionAccounts } from './subscription-accounts-provider'

export function SubscriptionAccountsTable() {
  const { t } = useTranslation()
  const columns = useSubscriptionAccountsColumns()
  const { refreshTrigger } = useSubscriptionAccounts()
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})

  const { data, isLoading } = useQuery({
    queryKey: ['admin-subscription-accounts', refreshTrigger],
    queryFn: async () => {
      const result = await getSubscriptionAccounts({ page: 1, size: 100 })
      return result.data?.accounts || []
    },
    placeholderData: (prev) => prev,
  })

  const accounts = useMemo(() => data || [], [data])

  const table = useReactTable({
    data: accounts,
    columns,
    state: { sorting, columnVisibility },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  return (
    <DataTablePage
      table={table}
      columns={columns}
      isLoading={isLoading}
      emptyTitle={t('No subscription accounts yet')}
      emptyDescription={t(
        'Click "Add Account" to add your first sub2api account'
      )}
      skeletonKeyPrefix='subscription-accounts-skeleton'
    />
  )
}
