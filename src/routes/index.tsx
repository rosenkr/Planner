import { Link, createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({ component: Home })

function Home() {
  return (
    <div>
      <h1 className="text-3xl font-bold sm:text-4xl">Availability Planner</h1>
      <p className="mt-4 text-lg">Find a time that works for everyone.</p>
      <Link to="/availability" className="mt-6 inline-block rounded-lg bg-emerald-200 px-4 py-3 font-semibold text-emerald-950">
        Edit availability
      </Link>
    </div>
  )
}
