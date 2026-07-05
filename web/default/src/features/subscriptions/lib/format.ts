import type { TFunction } from 'i18next'
import dayjs from '@/lib/dayjs'
import type { SubscriptionPlan } from '../types'

export function formatDuration(
  plan: Partial<SubscriptionPlan>,
  t: TFunction
): string {
  const unit = plan?.duration_unit || 'month'
  const value = plan?.duration_value || 1
  const unitLabels: Record<string, string> = {
    year: t('years'),
    month: t('months'),
    day: t('days'),
    hour: t('hours'),
    custom: t('Custom (seconds)'),
  }
  if (unit === 'custom') {
    const seconds = plan?.custom_seconds || 0
    if (seconds >= 86400) return `${Math.floor(seconds / 86400)} ${t('days')}`
    if (seconds >= 3600) return `${Math.floor(seconds / 3600)} ${t('hours')}`
    return `${seconds} ${t('seconds')}`
  }
  return `${value} ${unitLabels[unit] || unit}`
}

export function formatResetPeriod(
  plan: Partial<SubscriptionPlan>,
  t: TFunction
): string {
  const period = plan?.quota_reset_period || 'never'
  if (period === 'daily') return t('Daily')
  if (period === 'weekly') return t('Weekly')
  if (period === 'monthly') return t('Monthly')
  if (period === 'custom') {
    const seconds = Number(plan?.quota_reset_custom_seconds || 0)
    if (seconds >= 86400) return `${Math.floor(seconds / 86400)} ${t('days')}`
    if (seconds >= 3600) return `${Math.floor(seconds / 3600)} ${t('hours')}`
    if (seconds >= 60) return `${Math.floor(seconds / 60)} ${t('minutes')}`
    return `${seconds} ${t('seconds')}`
  }
  return t('No Reset')
}

export function formatTimestamp(ts: number): string {
  if (!ts) return '-'
  return dayjs(ts * 1000).format('YYYY-MM-DD HH:mm:ss')
}

// 内部订阅分组 key → 对客友好通道名。避免把 sub-/sau- 等内部分组前缀直接暴露给客户；
// 未知 key 一律回落到中性「专属通道」，杜绝任何内部命名泄露。
const UPGRADE_CHANNEL_LABELS: Record<string, string> = {
  'sub-trial': '体验通道',
  'sub-cc-std': 'Claude Code 标准通道',
  'sub-cc-pro': 'Claude Code 旗舰通道',
  'sub-codex': 'Codex 编程通道',
  'sub-gpt': 'GPT 标准通道',
  'sub-domestic': '国产全家桶通道',
  'sub-all': 'AI 全家桶通道',
}

export function formatUpgradeChannel(group: string | null | undefined): string {
  const key = group?.trim()
  if (!key) return ''
  return UPGRADE_CHANNEL_LABELS[key] ?? '专属通道'
}
