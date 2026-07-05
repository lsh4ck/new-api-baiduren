import { Link, useLocation } from '@tanstack/react-router'
import { Wallet } from 'lucide-react'
import { useNotifications } from '@/hooks/use-notifications'
import { useTopNavLinks } from '@/hooks/use-top-nav-links'
import { useSidebarData } from '@/hooks/use-sidebar-data'
import { useAuthStore } from '@/stores/auth-store'
import { formatQuota } from '@/lib/format'
import { ConfigDrawer } from '@/components/config-drawer'
import { LanguageSwitcher } from '@/components/language-switcher'
import { NotificationButton } from '@/components/notification-button'
import { NotificationDialog } from '@/components/notification-dialog'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { Search } from '@/components/search'
import { defaultTopNavLinks } from '../config/top-nav.config'
import { checkIsActive } from '../lib/url-utils'
import { type TopNavLink } from '../types'
import { Header } from './header'
import { TopNav } from './top-nav'

/** 当前页标题：从侧边栏导航树按路由匹配（sub2api header 左侧显示页名）。 */
function HeaderPageTitle() {
  const { navGroups } = useSidebarData()
  const href = useLocation({ select: (l) => l.href })
  let title = ''
  for (const group of navGroups) {
    for (const item of group.items) {
      if ('items' in item && Array.isArray(item.items)) {
        for (const sub of item.items) {
          if (checkIsActive(href, sub)) title = sub.title
        }
      }
      if (checkIsActive(href, item)) title = item.title
    }
  }
  if (!title) return null
  return (
    <span className='text-foreground ms-1 truncate text-sm font-semibold sm:text-base'>
      {title}
    </span>
  )
}

/** 余额胶囊（sub2api 风格：青底显示余额，点击去充值）。 */
function HeaderBalancePill() {
  const user = useAuthStore((s) => s.auth.user)
  const display = formatQuota(Number(user?.quota ?? 0))
  return (
    <Link
      to='/wallet'
      className='bg-primary/10 text-primary hover:bg-primary/15 inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-sm font-medium tabular-nums transition-colors'
    >
      <Wallet className='size-3.5' aria-hidden='true' />
      <span className='hidden sm:inline'>{display}</span>
    </Link>
  )
}

/**
 * General application Header component
 * Integrates navigation bar, search, configuration and profile functions
 *
 * @example
 * // Basic usage
 * <AppHeader />
 *
 * @example
 * // Custom navigation links
 * <AppHeader navLinks={customLinks} />
 *
 * @example
 * // Hide navigation bar and search box
 * <AppHeader showTopNav={false} showSearch={false} />
 *
 * @example
 * // Fully customize left and right content
 * <AppHeader
 *   leftContent={<CustomLeft />}
 *   rightContent={<CustomRight />}
 * />
 */
type AppHeaderProps = {
  /**
   * Custom navigation links, uses default global navigation or dynamically generated from backend if not provided
   */
  navLinks?: TopNavLink[]
  /**
   * Whether to show top navigation bar
   * @default true
   */
  showTopNav?: boolean
  /**
   * Left content, overrides TopNav if provided
   */
  leftContent?: React.ReactNode
  /**
   * Whether to show search box
   * @default true
   */
  showSearch?: boolean
  /**
   * Custom right content, overrides default right content if provided
   */
  rightContent?: React.ReactNode
  /**
   * Whether to show notification button
   * @default true
   */
  showNotifications?: boolean
  /**
   * Whether to show config drawer
   * @default true
   */
  showConfigDrawer?: boolean
  /**
   * Whether to show profile dropdown
   * @default true
   */
  showProfileDropdown?: boolean
}

export function AppHeader({
  navLinks = defaultTopNavLinks,
  showTopNav = true,
  leftContent,
  showSearch = true,
  rightContent,
  showNotifications = true,
  showConfigDrawer = true,
  showProfileDropdown = true,
}: AppHeaderProps) {
  // Prioritize dynamically generated links from backend
  const dynamicLinks = useTopNavLinks()
  const links = dynamicLinks.length > 0 ? dynamicLinks : navLinks

  // Notifications hook
  const notifications = useNotifications()

  return (
    <>
      <Header>
        <HeaderPageTitle />
        {leftContent ? (
          <div className='ms-2 flex items-center'>{leftContent}</div>
        ) : null}

        {rightContent ?? (
          <div className='ms-auto flex items-center gap-1 sm:gap-2'>
            {showTopNav && (
              <div className='me-1 hidden lg:block'>
                <TopNav links={links} />
              </div>
            )}
            <HeaderBalancePill />
            {showSearch && <Search />}
            {showNotifications && (
              <NotificationButton
                unreadCount={notifications.unreadCount}
                onClick={() => notifications.openDialog()}
              />
            )}
            <LanguageSwitcher />
            {showConfigDrawer && <ConfigDrawer />}
            {showProfileDropdown && <ProfileDropdown />}
          </div>
        )}
      </Header>

      {/* Notification Dialog */}
      {showNotifications && (
        <NotificationDialog
          open={notifications.dialogOpen}
          onOpenChange={notifications.setDialogOpen}
          activeTab={notifications.activeTab}
          onTabChange={notifications.setActiveTab}
          notice={notifications.notice}
          announcements={notifications.announcements}
          loading={notifications.loading}
          onCloseToday={notifications.closeToday}
        />
      )}
    </>
  )
}
