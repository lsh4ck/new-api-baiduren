import { createFileRoute } from '@tanstack/react-router'
import { ChangelogPage } from '@/features/changelog/Changelog'

export const Route = createFileRoute('/changelog')({
  component: ChangelogPage,
})
