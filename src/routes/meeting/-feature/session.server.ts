import { randomBytes } from 'node:crypto'
import { getCookie, getRequestUrl, setCookie, setResponseHeader } from '@tanstack/react-start/server'

const cookieName = 'planner_session'

export function getBrowserToken() {
  setResponseHeader('Cache-Control', 'private, no-store')
  const existing = getCookie(cookieName)
  if (existing && /^[A-Za-z0-9_-]{43}$/.test(existing)) return existing
  const token = randomBytes(32).toString('base64url')
  setCookie(cookieName, token, {
    httpOnly: true, sameSite: 'lax', secure: getRequestUrl().protocol === 'https:',
    path: '/', maxAge: 60 * 60 * 24 * 365,
  })
  return token
}
