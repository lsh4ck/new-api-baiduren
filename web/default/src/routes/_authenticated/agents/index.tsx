import { createFileRoute } from '@tanstack/react-router'
import { Main } from '@/components/layout'
import { AgentMarketplace } from '@/features/agents'

export const Route = createFileRoute('/_authenticated/agents/')({
  component: AgentsPage,
})

function AgentsPage() {
  return (
    <Main className='p-0'>
      <AgentMarketplace />
    </Main>
  )
}
