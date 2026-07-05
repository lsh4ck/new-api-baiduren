import { useTranslation } from 'react-i18next'
import { SectionPageLayout } from '@/components/layout'
import { SubscriptionGroupsProvider } from './components/subscription-groups-provider'
import { SubscriptionGroupsTable } from './components/subscription-groups-table'
import { SubscriptionGroupsDialogs } from './components/subscription-groups-dialogs'
import { SubscriptionGroupsPrimaryButtons } from './components/subscription-groups-primary-buttons'

export function SubscriptionGroups() {
  const { t } = useTranslation()
  return (
    <SubscriptionGroupsProvider>
      <SectionPageLayout>
        <SectionPageLayout.Title>{t('Subscription Groups')}</SectionPageLayout.Title>
        <SectionPageLayout.Description>
          {t('Manage account pool groups with model routing and spending limits')}
        </SectionPageLayout.Description>
        <SectionPageLayout.Actions>
          <SubscriptionGroupsPrimaryButtons />
        </SectionPageLayout.Actions>
        <SectionPageLayout.Content>
          <SubscriptionGroupsTable />
        </SectionPageLayout.Content>
      </SectionPageLayout>
      <SubscriptionGroupsDialogs />
    </SubscriptionGroupsProvider>
  )
}
