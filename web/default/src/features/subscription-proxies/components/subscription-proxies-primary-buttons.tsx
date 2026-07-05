import { Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { useSubscriptionProxies } from './subscription-proxies-provider'

export function SubscriptionProxiesPrimaryButtons() {
  const { t } = useTranslation()
  const { setOpen } = useSubscriptionProxies()
  return (
    <Button size='sm' onClick={() => setOpen('create')}>
      <Plus className='mr-1 h-4 w-4' />
      {t('Add Proxy')}
    </Button>
  )
}
