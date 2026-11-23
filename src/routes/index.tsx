import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({ component: Home })

function Home() {
  return (
    <div>
      <h1 className="text-3xl font-bold sm:text-4xl">Availability Planner</h1>
      <p className="mt-4 text-lg">Find a time that works for everyone.</p>
    </div>
  )
}
