import { Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { useSubscriptionAccounts } from './subscription-accounts-provider'

export function SubscriptionAccountsPrimaryButtons() {
  const { t } = useTranslation()
  const { setOpen } = useSubscriptionAccounts()
  return (
    <div className='flex gap-2'>
      <Button size='sm' onClick={() => setOpen('create')}>
        <Plus className='h-4 w-4' />
        {t('Add Account')}
      </Button>
    </div>
  )
}
