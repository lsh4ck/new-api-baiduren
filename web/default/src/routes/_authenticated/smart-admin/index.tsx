import { createFileRoute } from '@tanstack/react-router'
import { Main } from '@/components/layout'
import { SmartAdmin } from '@/features/smart-admin'

export const Route = createFileRoute('/_authenticated/smart-admin/')({
  component: SmartAdminPage,
})

function SmartAdminPage() {
  return (
    <Main className='p-0'>
      <SmartAdmin />
    </Main>
  )
}
