import { createFileRoute, redirect } from '@tanstack/react-router'
import { useAuthStore } from '@/stores/auth-store'
import { ChannelHealthPage } from '@/features/channel-health/ChannelHealthPage'

export const Route = createFileRoute('/_authenticated/channel-health')({
  beforeLoad: () => {
    const user = useAuthStore.getState().auth.user
    if (!user || user.role < 10) {
      throw redirect({ to: '/console' })
    }
  },
  component: ChannelHealthPage,
})
