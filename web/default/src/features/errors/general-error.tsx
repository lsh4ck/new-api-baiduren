import { useNavigate, useRouter } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

const FEEDBACK_URL = 'https://github.com/QuantumNous/new-api/issues'

type GeneralErrorProps = React.HTMLAttributes<HTMLDivElement> & {
  minimal?: boolean
  error?: Error | unknown
  reset?: () => void
}

export function GeneralError({
  className,
  minimal = false,
  error,
}: GeneralErrorProps) {
  const errMsg = error instanceof Error ? error.message : error != null ? String(error) : null
  const errStack = error instanceof Error ? error.stack : null
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { history } = useRouter()
  return (
    <div className={cn('h-svh w-full', className)}>
      <div className='m-auto flex h-full w-full flex-col items-center justify-center gap-2'>
        {!minimal && (
          <h1 className='text-[7rem] leading-tight font-bold'>500</h1>
        )}
        <span className='font-medium'>
          {t('Oops! Something went wrong')} {`:')`}
        </span>
        <p className='text-muted-foreground text-center'>
          {t('We apologize for the inconvenience.')} <br />{' '}
          {t('Please try again later.')}
        </p>
        {!minimal && (
          <p className='text-muted-foreground text-center text-sm'>
            {t('If this keeps happening, please report it on GitHub Issues.')}
          </p>
        )}
        {!minimal && errMsg && (
          <details className='mt-4 max-w-2xl w-full rounded-lg border bg-muted/30 p-3 text-left text-xs'>
            <summary className='cursor-pointer font-mono text-rose-600 dark:text-rose-400 font-semibold'>
              错误详情（管理员排查用）
            </summary>
            <div className='mt-2 space-y-2'>
              <div>
                <div className='text-[10px] uppercase tracking-wider text-muted-foreground'>Message</div>
                <pre className='font-mono text-[11px] whitespace-pre-wrap break-words'>{errMsg}</pre>
              </div>
              {errStack && (
                <div>
                  <div className='text-[10px] uppercase tracking-wider text-muted-foreground'>Stack</div>
                  <pre className='font-mono text-[10px] whitespace-pre-wrap break-words max-h-[300px] overflow-y-auto'>{errStack}</pre>
                </div>
              )}
            </div>
          </details>
        )}
        {!minimal && (
          <div className='mt-6 flex flex-wrap justify-center gap-4'>
            <Button variant='outline' onClick={() => history.go(-1)}>
              {t('Go Back')}
            </Button>
            <Button
              variant='outline'
              render={
                <a
                  href={FEEDBACK_URL}
                  target='_blank'
                  rel='noopener noreferrer'
                />
              }
            >
              {t('Report an issue')}
            </Button>
            <Button onClick={() => navigate({ to: '/' })}>
              {t('Back to Home')}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
