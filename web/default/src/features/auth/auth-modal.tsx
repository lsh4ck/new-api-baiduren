import { cn } from '@/lib/utils'
import { useStatus } from '@/hooks/use-status'
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog'
import { UserAuthForm } from './sign-in/components/user-auth-form'
import { SignUpForm } from './sign-up/components/sign-up-form'

export type AuthTab = 'sign-in' | 'sign-up'

type AuthModalProps = {
  open: boolean
  tab: AuthTab
  onTabChange: (tab: AuthTab) => void
  onOpenChange: (open: boolean) => void
}

export function AuthModal({ open, tab, onTabChange, onOpenChange }: AuthModalProps) {
  const { status } = useStatus()
  const selfUseMode = Boolean(status?.self_use_mode_enabled)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-w-md overflow-hidden p-0 gap-0'>
        {/* Tab bar */}
        <div className='flex border-b border-border/60'>
          <button
            onClick={() => onTabChange('sign-in')}
            className={cn(
              'relative flex-1 py-4 text-sm font-medium transition-colors',
              tab === 'sign-in'
                ? 'text-foreground after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-primary'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            登录
          </button>
          {!selfUseMode && (
            <button
              onClick={() => onTabChange('sign-up')}
              className={cn(
                'relative flex-1 py-4 text-sm font-medium transition-colors',
                tab === 'sign-up'
                  ? 'text-foreground after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-primary'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              注册
            </button>
          )}
        </div>

        <div className='p-6 pt-5'>
          {tab === 'sign-in' ? (
            <>
              <UserAuthForm redirectTo='/dashboard' />
              {!selfUseMode && (
                <p className='mt-5 text-center text-sm text-muted-foreground'>
                  没有账号？{' '}
                  <button
                    onClick={() => onTabChange('sign-up')}
                    className='font-medium underline underline-offset-4 hover:text-primary'
                  >
                    立即注册
                  </button>
                </p>
              )}
            </>
          ) : (
            <>
              <SignUpForm onRegisterSuccess={() => onTabChange('sign-in')} />
              <p className='mt-5 text-center text-sm text-muted-foreground'>
                已有账号？{' '}
                <button
                  onClick={() => onTabChange('sign-in')}
                  className='font-medium underline underline-offset-4 hover:text-primary'
                >
                  立即登录
                </button>
              </p>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
