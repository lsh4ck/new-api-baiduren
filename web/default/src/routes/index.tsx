import { createFileRoute } from '@tanstack/react-router'
import { LandingPage } from '@/features/home/LandingPage'

export const Route = createFileRoute('/')({
  component: LandingPage,
})
