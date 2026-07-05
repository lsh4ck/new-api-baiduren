import { createFileRoute } from '@tanstack/react-router'
import { FeedbackPage } from '@/features/feedback/FeedbackPage'

export const Route = createFileRoute('/feedback')({
  component: FeedbackPage,
})
