import { createFileRoute } from '@tanstack/react-router'
import { ConsolePage } from '@/features/console/ConsolePage'

export const Route = createFileRoute('/_authenticated/console/')({
  component: ConsolePage,
})
