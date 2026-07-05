import { createFileRoute } from '@tanstack/react-router'
import { Main } from '@/components/layout'
import { TelemetryAdmin } from '@/features/telemetry-admin'

export const Route = createFileRoute('/_authenticated/telemetry-admin/')({
  component: TelemetryAdminPage,
})

function TelemetryAdminPage() {
  return (
    <Main>
      <TelemetryAdmin />
    </Main>
  )
}
