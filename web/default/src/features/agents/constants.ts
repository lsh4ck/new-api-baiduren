// 智能体超市分类(轻量版:仅 chat/coding 文本类)
export const AGENT_CATEGORIES = [
  '编程',
  '办公',
  '营销',
  '数据',
  '企业',
] as const

export type AgentCategory = (typeof AGENT_CATEGORIES)[number]

// 收藏本地存储 key
export const FAVORITES_STORAGE_KEY = 'agent_marketplace_favorites'
