import { useTranslation } from 'react-i18next'
import { SectionPageLayout } from '@/components/layout'
import { SubscriptionProxiesProvider } from './components/subscription-proxies-provider'
import { SubscriptionProxiesTable } from './components/subscription-proxies-table'
import { SubscriptionProxiesDialogs } from './components/subscription-proxies-dialogs'
import { SubscriptionProxiesPrimaryButtons } from './components/subscription-proxies-primary-buttons'

export function SubscriptionProxies() {
  const { t } = useTranslation()
  return (
    <SubscriptionProxiesProvider>
      <SectionPageLayout>
        <SectionPageLayout.Title>{t('Subscription Proxies')}</SectionPageLayout.Title>
        <SectionPageLayout.Description>
          {t('Manage proxy pool for subscription account outbound traffic')}
        </SectionPageLayout.Description>
        <SectionPageLayout.Actions>
          <SubscriptionProxiesPrimaryButtons />
        </SectionPageLayout.Actions>
        <SectionPageLayout.Content>
          <SubscriptionProxiesTable />
        </SectionPageLayout.Content>
      </SectionPageLayout>
      <SubscriptionProxiesDialogs />
    </SubscriptionProxiesProvider>
  )
}
