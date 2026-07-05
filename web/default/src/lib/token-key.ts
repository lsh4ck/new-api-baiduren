import { api } from '@/lib/api'

// ⚠️ 列表接口 /api/token/ 返回的 key 是脱敏的（前4位 + ********** + 后4位），
// 不能直接用于 Bearer 鉴权（会被网关判为「无效的令牌」）。
// 创作工作台等需要在浏览器侧直接调 /v1/* 的页面，必须按 token id 调用
// POST /api/token/:id/key 取回完整 key（owner 鉴权），再拼 `Bearer sk-<key>`。
export async function fetchTokenRealKey(tokenId: string | number): Promise<string> {
  if (!tokenId && tokenId !== 0) return ''
  const r = await api.post(`/api/token/${tokenId}/key`)
  return r.data?.data?.key || ''
}
