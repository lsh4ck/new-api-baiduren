import {
  LayoutDashboard,
  Activity,
  Key,
  FileText,
  Wallet,
  Box,
  Users,
  Ticket,
  User,
  Command,
  Radio,
  FlaskConical,
  MessageSquare,
  Bot,
  Palette,
  CreditCard,
  ListTodo,
  Settings,
  Database,
  Shield,
  ShieldCheck,
  BadgeDollarSign,
  Layers,
  Globe,
  Building2,
  Percent,
  HeartPulse,
  Sparkles,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { WORKSPACE_IDS } from '@/components/layout/lib/workspace-registry'
import { type SidebarData, type NavGroup } from '@/components/layout/types'
import { useAuthStore } from '@/stores/auth-store'

export function useSidebarData(): SidebarData {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.auth.user)
  const isSales = Boolean(user?.is_sales)

  const salesGroup: NavGroup | null = isSales
    ? {
        id: 'sales',
        title: t('Sales'),
        items: [
          {
            title: t('My Customers'),
            url: '/sales-customers',
            icon: Percent,
          },
        ],
      }
    : null

  const baseGroups: NavGroup[] = [
      {
        id: 'chat',
        title: t('Chat'),
        items: [
          {
            title: t('Playground'),
            url: '/playground',
            icon: FlaskConical,
          },
          {
            title: '智能体超市',
            url: '/agents',
            icon: Sparkles,
          },
          {
            title: '🎨 唐伯虎AIGC 创作平台',
            url: '/go-aigc',
            icon: Palette,
            highlight: 'marquee' as const,
          },
          {
            title: t('Chat'),
            icon: MessageSquare,
            type: 'chat-presets',
          },
        ],
      },
      {
        id: 'general',
        title: t('General'),
        items: [
          {
            title: t('Overview'),
            url: '/dashboard/overview',
            icon: Activity,
          },
          {
            title: t('Dashboard'),
            url: '/dashboard/models',
            icon: LayoutDashboard,
          },
          {
            title: t('API Keys'),
            url: '/keys',
            icon: Key,
          },
          {
            title: t('Usage Logs'),
            url: '/usage-logs/common',
            icon: FileText,
          },
          {
            title: t('Task Logs'),
            url: '/usage-logs/task',
            activeUrls: ['/usage-logs/drawing'],
            configUrls: ['/usage-logs/drawing', '/usage-logs/task'],
            icon: ListTodo,
          },
        ],
      },
      {
        id: 'personal',
        title: t('Personal'),
        items: [
          {
            title: t('Wallet'),
            url: '/wallet',
            icon: Wallet,
          },
          {
            title: t('Profile'),
            url: '/profile',
            icon: User,
          },
        ],
      },
      {
        id: 'admin',
        title: t('Admin'),
        items: [
          {
            title: '智能管理',
            url: '/smart-admin',
            icon: Bot,
          },
          {
            title: '部署监控',
            url: '/telemetry-admin',
            icon: Database,
          },
          // 渠道管理（sub2api 风格二级折叠组）
          {
            title: '渠道管理',
            icon: Radio,
            items: [
              { title: t('Channels'), url: '/channels', icon: Radio },
              { title: '渠道纯血度', url: '/channel-audit', icon: ShieldCheck },
              { title: '渠道监控', url: '/channel-stability', icon: HeartPulse },
            ],
          },
          {
            title: t('Models'),
            url: '/models/metadata',
            icon: Box,
          },
          {
            title: t('Groups'),
            url: '/system-settings/billing/group-pricing',
            activeUrls: ['/system-settings/billing/group-pricing'],
            icon: Layers,
          },
          {
            title: t('Users'),
            url: '/users',
            icon: Users,
          },
          {
            title: t('Redemption Codes'),
            url: '/redemption-codes',
            icon: Ticket,
          },
          // 订阅管理（sub2api 风格二级折叠组）
          {
            title: '订阅管理',
            icon: CreditCard,
            items: [
              { title: t('Subscription Plans'), url: '/subscriptions', icon: CreditCard },
              { title: t('Subscription Channels'), url: '/subscription-accounts', icon: Database },
              { title: t('Subscription Groups'), url: '/subscription-groups', icon: Layers },
              { title: t('Proxy Settings'), url: '/subscription-proxies', icon: Globe },
            ],
          },
          {
            title: t('Sales Management'),
            url: '/agent-management',
            icon: BadgeDollarSign,
          },
          {
            title: t('Enterprise Console'),
            url: '/enterprise-management',
            icon: Building2,
          },
          {
            title: t('System Settings'),
            url: '/system-settings/site',
            activeUrls: ['/system-settings'],
            icon: Settings,
          },
        ],
      },
    ]

  return {
    workspaces: [
      {
        id: WORKSPACE_IDS.DEFAULT,
        name: '',
        logo: Command,
        plan: '',
      },
    ],
    // 插入销售组：放在 personal 之后、admin 之前更合理
    navGroups: salesGroup
      ? [
          ...baseGroups.slice(0, 3),
          salesGroup,
          ...baseGroups.slice(3),
        ]
      : baseGroups,
  }
}
