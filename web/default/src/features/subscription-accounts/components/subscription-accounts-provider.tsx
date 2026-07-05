import React, { useState } from 'react'
import useDialogState from '@/hooks/use-dialog'
import type { SubscriptionAccount, SubscriptionAccountsDialogType } from '../types'

type SubscriptionAccountsContextType = {
  open: SubscriptionAccountsDialogType | null
  setOpen: (str: SubscriptionAccountsDialogType | null) => void
  currentRow: SubscriptionAccount | null
  setCurrentRow: React.Dispatch<React.SetStateAction<SubscriptionAccount | null>>
  refreshTrigger: number
  triggerRefresh: () => void
}

const SubscriptionAccountsContext =
  React.createContext<SubscriptionAccountsContextType | null>(null)

export function SubscriptionAccountsProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [open, setOpen] = useDialogState<SubscriptionAccountsDialogType>(null)
  const [currentRow, setCurrentRow] = useState<SubscriptionAccount | null>(null)
  const [refreshTrigger, setRefreshTrigger] = useState(0)

  const triggerRefresh = () => setRefreshTrigger((prev) => prev + 1)

  return (
    <SubscriptionAccountsContext
      value={{
        open,
        setOpen,
        currentRow,
        setCurrentRow,
        refreshTrigger,
        triggerRefresh,
      }}
    >
      {children}
    </SubscriptionAccountsContext>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export const useSubscriptionAccounts = () => {
  const ctx = React.useContext(SubscriptionAccountsContext)
  if (!ctx) {
    throw new Error(
      'useSubscriptionAccounts has to be used within <SubscriptionAccountsProvider>'
    )
  }
  return ctx
}
