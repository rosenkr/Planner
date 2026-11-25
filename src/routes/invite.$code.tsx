import { createFileRoute } from '@tanstack/react-router'
import { InvitePage } from './meeting/-feature/InvitePage'
import { openInvite } from './meeting/-feature/operations'

export const Route = createFileRoute('/invite/$code')({
  loader: ({ params }) => openInvite({ data: params.code }),
  headers: () => ({ 'Cache-Control': 'private, no-store' }),
  component: InviteRoute,
})

function InviteRoute() {
  const { code } = Route.useParams()
  return <InvitePage key={code} code={code} initial={Route.useLoaderData()} />
}
