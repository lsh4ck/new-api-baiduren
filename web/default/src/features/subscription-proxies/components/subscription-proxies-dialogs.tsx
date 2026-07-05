import { useSubscriptionProxies } from './subscription-proxies-provider'
import { SubscriptionProxyMutateDialog } from './subscription-proxy-mutate-dialog'
import { SubscriptionProxyDeleteDialog } from './subscription-proxy-delete-dialog'

export function SubscriptionProxiesDialogs() {
  const { open, currentRow, setOpen, triggerRefresh } = useSubscriptionProxies()
  return (
    <>
      {(open === 'create' || open === 'update') && (
        <SubscriptionProxyMutateDialog
          open
          proxy={open === 'update' ? currentRow : null}
          onClose={() => setOpen(null)}
          onSuccess={() => { setOpen(null); triggerRefresh() }}
        />
      )}
      {open === 'delete' && currentRow && (
        <SubscriptionProxyDeleteDialog
          open
          proxy={currentRow}
          onClose={() => setOpen(null)}
          onSuccess={() => { setOpen(null); triggerRefresh() }}
        />
      )}
    </>
  )
}
