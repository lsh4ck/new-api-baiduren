export interface Agent {
  id: string
  code: string
  name: string
  category: string
  icon: string
  model: string
  group?: string
  tags: string[]
  description: string
  system_prompt: string
  tips?: string[]
}

export interface AgentsResponse {
  success: boolean
  data: {
    agents: Agent[]
  }
}
