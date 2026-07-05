import { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { getRouteApi } from '@tanstack/react-router'
import { SectionPageLayout } from '@/components/layout'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { EnterpriseWorkspaceOverview } from './components/enterprise-workspace-overview'
import { EnterpriseTeamManagement } from './components/enterprise-team-management'
import { EnterpriseKeyManager } from './components/enterprise-key-manager'
import { EnterpriseAuditLogs } from './components/enterprise-audit-logs'
import { EnterpriseWorkspaceSettings } from './components/enterprise-workspace-settings'
import { EnterpriseWorkgroupStats } from './components/enterprise-workgroup-stats'

const route = getRouteApi('/_authenticated/console/enterprise')

// 企业控制台子页面 ID
type EnterpriseTab = 'overview' | 'team' | 'workgroups' | 'keys' | 'audit' | 'settings'

const TABS: { id: EnterpriseTab; labelKey: string }[] = [
  { id: 'overview', labelKey: 'Workspace' },
  { id: 'team', labelKey: 'Team' },
  { id: 'workgroups', labelKey: '工作组' },
  { id: 'keys', labelKey: 'API Keys' },
  { id: 'audit', labelKey: 'Audit Logs' },
  { id: 'settings', labelKey: 'Settings' },
]

export function EnterpriseConsolePage() {
  const { t } = useTranslation()
  const search = route.useSearch() as { tab?: string } | undefined
  const [activeTab, setActiveTab] = useState<EnterpriseTab>(
    (search?.tab as EnterpriseTab) || 'overview'
  )

  const handleTabChange = useCallback((value: string) => {
    setActiveTab(value as EnterpriseTab)
  }, [])

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>{t('Enterprise Console')}</SectionPageLayout.Title>
      <SectionPageLayout.Description>
        {t('Manage your workspace, team, and enterprise API keys')}
      </SectionPageLayout.Description>
      <SectionPageLayout.Content>
        <Tabs value={activeTab} onValueChange={handleTabChange} className='space-y-4'>
          <TabsList className='h-auto flex-wrap justify-start gap-1'>
            {TABS.map((tab) => (
              <TabsTrigger key={tab.id} value={tab.id} className='px-3 py-1.5 text-sm'>
                {t(tab.labelKey)}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value='overview' className='mt-4'>
            <EnterpriseWorkspaceOverview />
          </TabsContent>

          <TabsContent value='team' className='mt-4'>
            <EnterpriseTeamManagement />
          </TabsContent>

          <TabsContent value='workgroups' className='mt-4'>
            <EnterpriseWorkgroupStats />
          </TabsContent>

          <TabsContent value='keys' className='mt-4'>
            <EnterpriseKeyManager />
          </TabsContent>

          <TabsContent value='audit' className='mt-4'>
            <EnterpriseAuditLogs />
          </TabsContent>

          <TabsContent value='settings' className='mt-4'>
            <EnterpriseWorkspaceSettings />
          </TabsContent>
        </Tabs>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
