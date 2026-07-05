import { createFileRoute, redirect } from '@tanstack/react-router'
import { useAuthStore } from '@/stores/auth-store'
import { SalesCustomersPage } from '@/features/sales-customers'

export const Route = createFileRoute('/_authenticated/sales-customers')({
  beforeLoad: ({ location }) => {
    const user = useAuthStore.getState().auth.user
    if (!user) {
      throw redirect({ to: '/sign-in', search: { redirect: location.href } })
    }
    if (!user.is_sales) {
      throw redirect({ to: '/' })
    }
  },
  component: SalesCustomersPage,
})
