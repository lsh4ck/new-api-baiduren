import React, { useState } from 'react'
import useDialogState from '@/hooks/use-dialog'
import type { SubscriptionGroup, SubscriptionGroupsDialogType } from '../../subscription-accounts/types'

type SubscriptionGroupsContextType = {
  open: SubscriptionGroupsDialogType | null
  setOpen: (v: SubscriptionGroupsDialogType | null) => void
  currentRow: SubscriptionGroup | null
  setCurrentRow: React.Dispatch<React.SetStateAction<SubscriptionGroup | null>>
  refreshTrigger: number
  triggerRefresh: () => void
}

const SubscriptionGroupsContext = React.createContext<SubscriptionGroupsContextType | null>(null)

export function SubscriptionGroupsProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useDialogState<SubscriptionGroupsDialogType>(null)
  const [currentRow, setCurrentRow] = useState<SubscriptionGroup | null>(null)
  const [refreshTrigger, setRefreshTrigger] = useState(0)
  const triggerRefresh = () => setRefreshTrigger((p) => p + 1)
  return (
    <SubscriptionGroupsContext value={{ open, setOpen, currentRow, setCurrentRow, refreshTrigger, triggerRefresh }}>
      {children}
    </SubscriptionGroupsContext>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export const useSubscriptionGroups = () => {
  const ctx = React.useContext(SubscriptionGroupsContext)
  if (!ctx) throw new Error('useSubscriptionGroups must be used within SubscriptionGroupsProvider')
  return ctx
}
