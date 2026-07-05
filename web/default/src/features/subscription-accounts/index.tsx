import { useTranslation } from 'react-i18next'
import { SectionPageLayout } from '@/components/layout'
import { SubscriptionAccountsDialogs } from './components/subscription-accounts-dialogs'
import { SubscriptionAccountsPrimaryButtons } from './components/subscription-accounts-primary-buttons'
import { SubscriptionAccountsProvider } from './components/subscription-accounts-provider'
import { SubscriptionAccountsTable } from './components/subscription-accounts-table'

export function SubscriptionAccounts() {
  const { t } = useTranslation()
  return (
    <SubscriptionAccountsProvider>
      <SectionPageLayout>
        <SectionPageLayout.Title>
          {t('Subscription Channels')}
        </SectionPageLayout.Title>
        <SectionPageLayout.Description>
          {t('Manage sub2api account pool for Claude, Codex, Gemini')}
        </SectionPageLayout.Description>
        <SectionPageLayout.Actions>
          <div className='flex items-center gap-2'>
            <SubscriptionAccountsPrimaryButtons />
          </div>
        </SectionPageLayout.Actions>
        <SectionPageLayout.Content>
          <SubscriptionAccountsTable />
        </SectionPageLayout.Content>
      </SectionPageLayout>

      <SubscriptionAccountsDialogs />
    </SubscriptionAccountsProvider>
  )
}
