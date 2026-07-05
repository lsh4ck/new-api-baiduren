import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { Main } from '@/components/layout'
import { Playground } from '@/features/playground'

// 接收来自「智能体超市」的预设(点「立即使用」带过来)
const playgroundSearchSchema = z.object({
  agentModel: z.string().optional(),
  agentPrompt: z.string().optional(),
  agentName: z.string().optional(),
})

export const Route = createFileRoute('/_authenticated/playground/')({
  validateSearch: playgroundSearchSchema,
  component: PlaygroundPage,
})

function PlaygroundPage() {
  return (
    <Main className='p-0'>
      <Playground />
    </Main>
  )
}
