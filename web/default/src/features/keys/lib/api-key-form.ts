import { z } from 'zod'
import { parseQuotaFromDollars, quotaUnitsToDollars } from '@/lib/format'
import { DEFAULT_GROUP } from '../constants'
import { type ApiKeyFormData, type ApiKey } from '../types'

// ============================================================================
// Form Schema
// ============================================================================

export const apiKeyFormSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  // 不在这里 .min(0) —— 历史 unlimited key 数据库里 remain_quota 可能为负，
  // 启用 unlimited 时这个字段不参与计算；提交前会被 Math.max(0, ...) clamp。
  remain_quota_dollars: z.number().optional(),
  expired_time: z.date().optional(),
  unlimited_quota: z.boolean(),
  model_limits: z.array(z.string()),
  allow_ips: z.string().optional(),
  group: z.string().optional(),
  cross_group_retry: z.boolean().optional(),
  tokenCount: z.number().min(1).optional(),
})

export type ApiKeyFormValues = z.infer<typeof apiKeyFormSchema>

// ============================================================================
// Form Defaults
// ============================================================================

export const API_KEY_FORM_DEFAULT_VALUES: ApiKeyFormValues = {
  name: '',
  remain_quota_dollars: 10,
  expired_time: undefined,
  unlimited_quota: true,
  model_limits: [],
  allow_ips: '',
  group: DEFAULT_GROUP,
  cross_group_retry: true,
  tokenCount: 1,
}

export function getApiKeyFormDefaultValues(
  defaultUseAutoGroup: boolean
): ApiKeyFormValues {
  return {
    ...API_KEY_FORM_DEFAULT_VALUES,
    group: defaultUseAutoGroup ? 'auto' : DEFAULT_GROUP,
    cross_group_retry: defaultUseAutoGroup,
  }
}

// ============================================================================
// Form Data Transformation
// ============================================================================

/**
 * Transform form data to API payload
 */
export function transformFormDataToPayload(
  data: ApiKeyFormValues
): ApiKeyFormData {
  return {
    name: data.name,
    remain_quota: data.unlimited_quota
      ? 0
      : parseQuotaFromDollars(Math.max(0, data.remain_quota_dollars || 0)),
    expired_time: data.expired_time
      ? Math.floor(data.expired_time.getTime() / 1000)
      : -1,
    unlimited_quota: data.unlimited_quota,
    model_limits_enabled: data.model_limits.length > 0,
    model_limits: data.model_limits.join(','),
    allow_ips: data.allow_ips || '',
    group: data.group || '',
    cross_group_retry: data.group === 'auto' ? !!data.cross_group_retry : false,
  }
}

/**
 * Transform API key data to form defaults
 */
export function transformApiKeyToFormDefaults(
  apiKey: ApiKey
): ApiKeyFormValues {
  // 兼容历史数据：unlimited key 的 remain_quota 在数据库里有时是负数（如 -1 占位）
  // 直接读出来会让 z.number().min(0) 校验失败。clamp 到 0。
  const quotaDollars = Math.max(0, quotaUnitsToDollars(apiKey.remain_quota))
  return {
    name: apiKey.name,
    remain_quota_dollars: quotaDollars,
    expired_time:
      apiKey.expired_time > 0
        ? new Date(apiKey.expired_time * 1000)
        : undefined,
    unlimited_quota: apiKey.unlimited_quota,
    model_limits: apiKey.model_limits
      ? apiKey.model_limits.split(',').filter(Boolean)
      : [],
    allow_ips: apiKey.allow_ips || '',
    group: apiKey.group || DEFAULT_GROUP,
    cross_group_retry: !!apiKey.cross_group_retry,
    tokenCount: 1,
  }
}
