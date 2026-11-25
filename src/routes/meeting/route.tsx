import { createFileRoute } from '@tanstack/react-router'
import { CreateMeeting } from './-feature/CreateMeeting'

export const Route = createFileRoute('/meeting')({
  head: () => ({ meta: [{ title: 'Create a meeting · Availability Planner' }] }),
  component: CreateMeeting,
})
