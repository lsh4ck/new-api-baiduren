import { Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { useSubscriptionGroups } from './subscription-groups-provider'

export function SubscriptionGroupsPrimaryButtons() {
  const { t } = useTranslation()
  const { setOpen } = useSubscriptionGroups()
  return (
    <Button size='sm' onClick={() => setOpen('create')}>
      <Plus className='mr-1 h-4 w-4' />
      {t('Add Group')}
    </Button>
  )
}
