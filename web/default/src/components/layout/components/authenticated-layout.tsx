import { getCookie } from '@/lib/cookies'
import { cn } from '@/lib/utils'
import { LayoutProvider } from '@/context/layout-provider'
import { SearchProvider } from '@/context/search-provider'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { AnimatedOutlet } from '@/components/page-transition'
import { SkipToMain } from '@/components/skip-to-main'
import { InitialProfileSetupDialog } from '@/features/auth/components/initial-profile-setup-dialog'
import { SmartRelayOnboardingDialog } from '@/features/auth/components/smartrelay-onboarding-dialog'
import { WorkspaceProvider } from '../context/workspace-context'
import { AppHeader } from './app-header'
import { AppSidebar } from './app-sidebar'

type AuthenticatedLayoutProps = {
  children?: React.ReactNode
}

export function AuthenticatedLayout(props: AuthenticatedLayoutProps) {
  const defaultOpen = getCookie('sidebar_state') !== 'false'

  return (
    <LayoutProvider>
      <SearchProvider>
        <WorkspaceProvider>
          {/* sub2api 风格：全高侧边栏（logo 在顶）+ header 在内容区右侧 */}
          <SidebarProvider defaultOpen={defaultOpen}>
            <SkipToMain />
            <AppSidebar />
            <SidebarInset
              className={cn('@container/content', 'h-svh overflow-y-auto')}
            >
              <AppHeader />
              {props.children ?? <AnimatedOutlet />}
            </SidebarInset>
            <InitialProfileSetupDialog />
            <SmartRelayOnboardingDialog />
          </SidebarProvider>
        </WorkspaceProvider>
      </SearchProvider>
    </LayoutProvider>
  )
}
