import { AddAccountWizard } from './add-account-wizard'
import { SubscriptionAccountsMutateDrawer } from './subscription-accounts-mutate-drawer'
import { DeleteAccountDialog } from './dialogs/delete-account-dialog'
import { RefreshAccountDialog } from './dialogs/refresh-account-dialog'
import { useSubscriptionAccounts } from './subscription-accounts-provider'

export function SubscriptionAccountsDialogs() {
  const { open, setOpen, currentRow } = useSubscriptionAccounts()

  return (
    <>
      {/* 新建：多步向导弹窗 */}
      <AddAccountWizard
        open={open === 'create'}
        onOpenChange={(isOpen) => !isOpen && setOpen(null)}
      />
      {/* 编辑：保留原有侧边抽屉 */}
      <SubscriptionAccountsMutateDrawer
        open={open === 'update'}
        onOpenChange={(isOpen) => !isOpen && setOpen(null)}
        currentRow={open === 'update' ? currentRow || undefined : undefined}
      />
      <DeleteAccountDialog />
      <RefreshAccountDialog />
    </>
  )
}
