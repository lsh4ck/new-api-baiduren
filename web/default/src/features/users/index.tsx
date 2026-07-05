import { useQuery } from '@tanstack/react-query'
import { Users as UsersIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { SectionPageLayout } from '@/components/layout'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { getUsers } from './api'
import { UsersDeleteDialog } from './components/users-delete-dialog'
import { UsersMutateDrawer } from './components/users-mutate-drawer'
import { UsersPrimaryButtons } from './components/users-primary-buttons'
import { UsersProvider, useUsers } from './components/users-provider'
import { UsersTable } from './components/users-table'

function UsersTotalBadge() {
  const { data, isLoading } = useQuery({
    queryKey: ['users-total'],
    queryFn: async () => {
      // 拉一页就够拿 total
      const res = await getUsers({ p: 1, page_size: 1 })
      return res.success ? res.data?.total ?? 0 : 0
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  })
  return (
    <Badge
      variant='secondary'
      className='gap-1.5 font-medium tabular-nums'
    >
      <UsersIcon className='size-3' />
      {isLoading ? <Skeleton className='inline-block h-3 w-10' /> : `${(data ?? 0).toLocaleString()} 人`}
    </Badge>
  )
}

function UsersContent() {
  const { t } = useTranslation()
  const { open, setOpen, currentRow } = useUsers()

  return (
    <>
      <SectionPageLayout>
        <SectionPageLayout.Title>
          <span className='inline-flex items-center gap-2'>
            {t('Users')}
            <UsersTotalBadge />
          </span>
        </SectionPageLayout.Title>
        <SectionPageLayout.Description>
          {t('Manage users and their permissions')}
        </SectionPageLayout.Description>
        <SectionPageLayout.Actions>
          <UsersPrimaryButtons />
        </SectionPageLayout.Actions>
        <SectionPageLayout.Content>
          <UsersTable />
        </SectionPageLayout.Content>
      </SectionPageLayout>

      <UsersMutateDrawer
        open={open === 'create' || open === 'update'}
        onOpenChange={(isOpen) => !isOpen && setOpen(null)}
        currentRow={open === 'update' ? currentRow || undefined : undefined}
      />
      <UsersDeleteDialog />
    </>
  )
}

export function Users() {
  return (
    <UsersProvider>
      <UsersContent />
    </UsersProvider>
  )
}
