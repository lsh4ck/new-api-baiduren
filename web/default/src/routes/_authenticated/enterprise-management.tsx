import { createFileRoute, redirect } from '@tanstack/react-router'
import { useAuthStore } from '@/stores/auth-store'
import { EnterpriseManagement } from '@/features/enterprise-management'

export const Route = createFileRoute('/_authenticated/enterprise-management')({
  beforeLoad: ({ location }) => {
    const user = useAuthStore.getState().auth.user
    if (!user) {
      throw redirect({ to: '/sign-in', search: { redirect: location.href } })
    }
    // 仅平台管理员 / 销售 / 企业管理员可见
    const role = user.role ?? 0
    const isSales = Boolean(
      (user as { is_sales?: boolean }).is_sales
    )
    const enterpriseAdminOf =
      (user as { enterprise_admin_of?: number }).enterprise_admin_of ?? 0
    if (role < 10 && !isSales && enterpriseAdminOf === 0) {
      throw redirect({ to: '/' })
    }
  },
  component: EnterpriseManagement,
})
