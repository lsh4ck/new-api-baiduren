import { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { getRouteApi } from '@tanstack/react-router'
import { SectionPageLayout } from '@/components/layout'
import { ExchangeRateCard } from '@/components/exchange-rate-card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { ConsoleOverview } from './components/console-overview'
import { ConsoleApiKeys } from './components/console-api-keys'
import { ConsoleUsageLogs } from './components/console-usage-logs'
import { ConsoleModelPreferences } from './components/console-model-preferences'
import { ConsoleAccountSettings } from './components/console-account-settings'

const route = getRouteApi('/_authenticated/console/')

// 控制台子页面 ID
type ConsoleTab = 'overview' | 'keys' | 'usage' | 'models' | 'settings'

const TABS: { id: ConsoleTab; labelKey: string }[] = [
  { id: 'overview', labelKey: 'Overview' },
  { id: 'keys', labelKey: 'API Keys' },
  { id: 'usage', labelKey: 'Usage Logs' },
  { id: 'models', labelKey: 'Model Preferences' },
  { id: 'settings', labelKey: 'Account Settings' },
]

export function ConsolePage() {
  const { t } = useTranslation()
  const search = route.useSearch() as { tab?: string } | undefined
  const [activeTab, setActiveTab] = useState<ConsoleTab>(
    (search?.tab as ConsoleTab) || 'overview'
  )

  const handleTabChange = useCallback((value: string) => {
    setActiveTab(value as ConsoleTab)
  }, [])

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>{t('Console')}</SectionPageLayout.Title>
      <SectionPageLayout.Description>
        {t('Manage your account, API keys, and usage')}
      </SectionPageLayout.Description>
      <SectionPageLayout.Content>
        <ExchangeRateCard className='mb-4' />
        <Tabs value={activeTab} onValueChange={handleTabChange} className='space-y-4'>
          <TabsList className='h-auto flex-wrap justify-start gap-1'>
            {TABS.map((tab) => (
              <TabsTrigger key={tab.id} value={tab.id} className='px-3 py-1.5 text-sm'>
                {t(tab.labelKey)}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value='overview' className='mt-4'>
            <ConsoleOverview />
          </TabsContent>

          <TabsContent value='keys' className='mt-4'>
            <ConsoleApiKeys />
          </TabsContent>

          <TabsContent value='usage' className='mt-4'>
            <ConsoleUsageLogs />
          </TabsContent>

          <TabsContent value='models' className='mt-4'>
            <ConsoleModelPreferences />
          </TabsContent>

          <TabsContent value='settings' className='mt-4'>
            <ConsoleAccountSettings />
          </TabsContent>
        </Tabs>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
