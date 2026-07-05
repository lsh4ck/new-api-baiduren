import React, { useState } from 'react'
import useDialogState from '@/hooks/use-dialog'
import type { SubscriptionProxy, SubscriptionProxiesDialogType } from '../../subscription-accounts/types'

type SubscriptionProxiesContextType = {
  open: SubscriptionProxiesDialogType | null
  setOpen: (v: SubscriptionProxiesDialogType | null) => void
  currentRow: SubscriptionProxy | null
  setCurrentRow: React.Dispatch<React.SetStateAction<SubscriptionProxy | null>>
  refreshTrigger: number
  triggerRefresh: () => void
}

const SubscriptionProxiesContext = React.createContext<SubscriptionProxiesContextType | null>(null)

export function SubscriptionProxiesProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useDialogState<SubscriptionProxiesDialogType>(null)
  const [currentRow, setCurrentRow] = useState<SubscriptionProxy | null>(null)
  const [refreshTrigger, setRefreshTrigger] = useState(0)
  const triggerRefresh = () => setRefreshTrigger((p) => p + 1)
  return (
    <SubscriptionProxiesContext value={{ open, setOpen, currentRow, setCurrentRow, refreshTrigger, triggerRefresh }}>
      {children}
    </SubscriptionProxiesContext>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export const useSubscriptionProxies = () => {
  const ctx = React.useContext(SubscriptionProxiesContext)
  if (!ctx) throw new Error('useSubscriptionProxies must be used within SubscriptionProxiesProvider')
  return ctx
}
