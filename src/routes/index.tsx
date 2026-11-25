import { Link, createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({ component: Home })

function Home() {
  return (
    <div>
      <h1 className="text-3xl font-bold sm:text-4xl">Availability Planner</h1>
      <p className="mt-4 text-lg">Find a time that works for everyone.</p>
      <Link to="/meeting" className="mt-6 inline-block rounded-lg bg-emerald-200 px-4 py-3 font-semibold text-emerald-950">
        Create a meeting
      </Link>
      <Link to="/availability" className="ml-4 inline-block text-emerald-200 underline">
        Try the availability editor
      </Link>
    </div>
  )
}
