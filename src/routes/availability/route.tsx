import { createFileRoute } from '@tanstack/react-router'
import { AvailabilityEditor } from './-editor/AvailabilityEditor'

const meetingName = 'Weekly team catch-up'

export const Route = createFileRoute('/availability')({
  head: () => ({ meta: [{ title: meetingName + ' · Availability Planner' }] }),
  component: AvailabilityPage,
})

function AvailabilityPage() {
  return <AvailabilityEditor meetingName={meetingName} firstDate="2026-12-01" lastDate="2026-12-03" timeZone="Europe/Stockholm" />
}
