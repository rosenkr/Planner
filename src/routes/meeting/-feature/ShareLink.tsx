import { useEffect, useState } from 'react'
import { formatInviteUrl } from './meeting'

export function ShareLink({ code }: { code: string }) {
  const path = '/invite/' + code
  const [origin, setOrigin] = useState('')
  const [notice, setNotice] = useState('')
  useEffect(() => { setOrigin(window.location.origin) }, [])
  const href = origin ? formatInviteUrl(code, origin) : path
  return (
    <div className="meeting-share">
      <a href={href}>{href}</a>
      <button type="button" onClick={async () => {
        try { await navigator.clipboard.writeText(href); setNotice('Link copied.') }
        catch { setNotice('Select the link to copy its address.') }
      }}>Copy link</button>
      <span role="status">{notice}</span>
    </div>
  )
}
