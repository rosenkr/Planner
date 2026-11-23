import { createFileRoute } from '@tanstack/react-router'
import { AvailabilityEditor } from './-editor/AvailabilityEditor'

const meetingName = 'Weekly team catch-up'

export const Route = createFileRoute('/availability')({
  head: () => ({ meta: [{ title: meetingName + ' · Availability Planner' }] }),
  component: AvailabilityPage,
})

const meetingDates = ['2026-12-01', '2026-12-02', '2026-12-03']

function AvailabilityPage() {
  return <AvailabilityEditor meetingName={meetingName} dates={meetingDates} timeZone="Europe/Stockholm" />
}
