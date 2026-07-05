import { useSubscriptionGroups } from './subscription-groups-provider'
import { SubscriptionGroupMutateDialog } from './subscription-group-mutate-dialog'
import { SubscriptionGroupDeleteDialog } from './subscription-group-delete-dialog'

export function SubscriptionGroupsDialogs() {
  const { open, currentRow, setOpen, triggerRefresh } = useSubscriptionGroups()
  return (
    <>
      {(open === 'create' || open === 'update') && (
        <SubscriptionGroupMutateDialog
          open
          group={open === 'update' ? currentRow : null}
          onClose={() => setOpen(null)}
          onSuccess={() => { setOpen(null); triggerRefresh() }}
        />
      )}
      {open === 'delete' && currentRow && (
        <SubscriptionGroupDeleteDialog
          open
          group={currentRow}
          onClose={() => setOpen(null)}
          onSuccess={() => { setOpen(null); triggerRefresh() }}
        />
      )}
    </>
  )
}
