import { createFileRoute, redirect } from '@tanstack/react-router'
import { useAuthStore } from '@/stores/auth-store'
import { ChannelAuditPage } from '@/features/channel-audit/ChannelAuditPage'

export const Route = createFileRoute('/_authenticated/channel-audit')({
  beforeLoad: () => {
    const user = useAuthStore.getState().auth.user
    if (!user || user.role < 10) {
      throw redirect({ to: '/console' })
    }
  },
  component: ChannelAuditPage,
})
