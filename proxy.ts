import { NextResponse, type NextRequest } from 'next/server'

const PUBLIC_ROUTES = new Set(['/', '/login', '/signup', '/reset-password', '/update-password'])
const PERF_ENABLED = process.env.NW_PERF_LOG !== '0'

const NW_USER_ID_HEADER = 'x-nw-user-id'
const NW_USER_EMAIL_HEADER = 'x-nw-user-email'
const NW_USER_FULL_NAME_HEADER = 'x-nw-user-full-name'
const NW_TRACE_ID_HEADER = 'x-nw-trace-id'
const SUPABASE_AUTH_COOKIE_REGEX = /^sb-.*-auth-token(?:\.\d+)?$/

interface FastCookieUser {
  id: string
  email?: string
  fullName?: string
  exp?: number
}

function decodeBase64Url(value: string): string | null {
  try {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4)
    return atob(padded)
  } catch {
    return null
  }
}

function decodeJwtPayload(accessToken: string): Record<string, unknown> | null {
  const parts = accessToken.split('.')
  if (parts.length !== 3) return null
  const payload = decodeBase64Url(parts[1])
  if (!payload) return null
  try {
    const parsed = JSON.parse(payload) as unknown
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null
  } catch {
    return null
  }
}

function getCombinedCookieValue(request: NextRequest, baseName: string): string | null {
  const direct = request.cookies.get(baseName)?.value
  if (direct) return direct

  const chunks = request.cookies
    .getAll()
    .map(({ name, value }) => {
      if (!name.startsWith(`${baseName}.`)) return null
      const indexPart = name.slice(baseName.length + 1)
      const index = Number(indexPart)
      if (!Number.isInteger(index)) return null
      return { index, value }
    })
    .filter((chunk): chunk is { index: number; value: string } => chunk !== null)
    .sort((a, b) => a.index - b.index)

  if (!chunks.length) return null
  return chunks.map((chunk) => chunk.value).join('')
}

function parseFastUserFromSessionCookie(request: NextRequest): FastCookieUser | null {
  const candidateBaseNames = new Set<string>()
  for (const { name } of request.cookies.getAll()) {
    if (!SUPABASE_AUTH_COOKIE_REGEX.test(name)) continue
    const chunkMatch = name.match(/^(.*)\.\d+$/)
    candidateBaseNames.add(chunkMatch ? chunkMatch[1] : name)
  }

  for (const baseName of candidateBaseNames) {
    const combined = getCombinedCookieValue(request, baseName)
    if (!combined) continue

    let decoded = combined
    if (decoded.startsWith('base64-')) {
      const maybeJson = decodeBase64Url(decoded.slice('base64-'.length))
      if (!maybeJson) continue
      decoded = maybeJson
    }

    let session: Record<string, unknown> | null = null
    try {
      const parsed = JSON.parse(decoded) as unknown
      if (parsed && typeof parsed === 'object') session = parsed as Record<string, unknown>
    } catch {
      continue
    }
    if (!session) continue

    const accessToken =
      typeof session.access_token === 'string' && session.access_token.length > 0
        ? session.access_token
        : null
    if (!accessToken) continue

    const claims = decodeJwtPayload(accessToken)
    if (!claims) continue
    if (typeof claims.sub !== 'string' || claims.sub.length === 0) continue

    const email = typeof claims.email === 'string' ? claims.email : undefined
    const exp = typeof claims.exp === 'number' ? claims.exp : undefined
    const metadata =
      claims.user_metadata && typeof claims.user_metadata === 'object'
        ? (claims.user_metadata as Record<string, unknown>)
        : null
    const fullName =
      metadata && typeof metadata.full_name === 'string' ? metadata.full_name : undefined

    return { id: claims.sub, email, fullName, exp }
  }

  return null
}

export async function proxy(request: NextRequest) {
  const startedAt = Date.now()
  const traceId = request.headers.get(NW_TRACE_ID_HEADER) ?? crypto.randomUUID().split('-')[0]

  function logProxy(event: string, extra: string = '') {
    if (!PERF_ENABLED) return
    const elapsed = Date.now() - startedAt
    const suffix = extra ? ` ${extra}` : ''
    console.info(
      `[NW_PERF] ${new Date().toISOString()} proxy.${event} ${elapsed}ms trace=${traceId} path=${request.nextUrl.pathname}${suffix}`,
    )
  }

  const forwardedHeaders = new Headers(request.headers)
  forwardedHeaders.delete(NW_USER_ID_HEADER)
  forwardedHeaders.delete(NW_USER_EMAIL_HEADER)
  forwardedHeaders.delete(NW_USER_FULL_NAME_HEADER)
  forwardedHeaders.set(NW_TRACE_ID_HEADER, traceId)

  const { pathname } = request.nextUrl
  const isPublic =
    PUBLIC_ROUTES.has(pathname) ||
    pathname.startsWith('/callback') ||
    pathname.startsWith('/api/auth')

  // Fast path: if there is clearly no Supabase auth cookie, skip auth
  // verification completely. This avoids costly getClaims() network work
  // for anonymous traffic and makes /, /login, /signup instant.
  const hasSupabaseAuthCookie = request.cookies
    .getAll()
    .some(({ name }) => name.startsWith('sb-') && name.includes('-auth-token'))

  const rememberMe = request.cookies.get('nw_remember_me')
  const isPasswordResetFlow = pathname === '/update-password'

  if (isPublic && !isPasswordResetFlow && !rememberMe && hasSupabaseAuthCookie) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    const redirectResponse = NextResponse.redirect(url)
    redirectResponse.headers.set(NW_TRACE_ID_HEADER, traceId)

    // Browser session was closed (remember-me cookie dropped) but stale
    // Supabase auth cookies remain. Clear them without hitting Auth.
    for (const { name } of request.cookies.getAll()) {
      if (name.startsWith('sb-') && name.includes('-auth-token')) {
        redirectResponse.cookies.set(name, '', { path: '/', maxAge: 0 })
      }
    }

    logProxy('redirect.remember_me_missing.public_fast')
    return redirectResponse
  }

  if (!hasSupabaseAuthCookie) {
    if (!isPublic) {
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      const redirectResponse = NextResponse.redirect(url)
      redirectResponse.headers.set(NW_TRACE_ID_HEADER, traceId)
      logProxy('redirect.unauthenticated.no_cookie')
      return redirectResponse
    }
    const response = NextResponse.next({ request: { headers: forwardedHeaders } })
    response.headers.set(NW_TRACE_ID_HEADER, traceId)
    logProxy('pass.no_cookie', 'user=no')
    return response
  }

  // Fast path for protected routes: avoid the expensive auth.getClaims() edge
  // verification on every navigation. The app layout still enforces auth
  // server-side, so this remains secure while removing a common ~200ms+ hop.
  if (!isPublic) {
    if (!rememberMe && !isPasswordResetFlow) {
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      const redirectResponse = NextResponse.redirect(url)
      redirectResponse.headers.set(NW_TRACE_ID_HEADER, traceId)

      // Clear Supabase auth cookies to avoid redirect loops on /login.
      for (const { name } of request.cookies.getAll()) {
        if (name.startsWith('sb-') && name.includes('-auth-token')) {
          redirectResponse.cookies.set(name, '', { path: '/', maxAge: 0 })
        }
      }

      logProxy('redirect.remember_me_missing.fast')
      return redirectResponse
    }

    const fastUser = parseFastUserFromSessionCookie(request)
    const nowEpoch = Math.floor(Date.now() / 1000)
    if (fastUser?.id && (!fastUser.exp || fastUser.exp > nowEpoch + 5)) {
      forwardedHeaders.set(NW_USER_ID_HEADER, fastUser.id)
      if (fastUser.email) forwardedHeaders.set(NW_USER_EMAIL_HEADER, fastUser.email)
      if (fastUser.fullName) forwardedHeaders.set(NW_USER_FULL_NAME_HEADER, fastUser.fullName)
    }

    const response = NextResponse.next({ request: { headers: forwardedHeaders } })
    response.headers.set(NW_TRACE_ID_HEADER, traceId)
    logProxy('pass.protected_fast', `user=${fastUser?.id ? 'yes' : 'unknown'}`)
    return response
  }

  const fastPublicUser = parseFastUserFromSessionCookie(request)
  const nowEpoch = Math.floor(Date.now() / 1000)
  const hasFreshFastPublicUser =
    !!fastPublicUser?.id && (!fastPublicUser.exp || fastPublicUser.exp > nowEpoch + 5)

  if (hasFreshFastPublicUser) {
    forwardedHeaders.set(NW_USER_ID_HEADER, fastPublicUser.id)
    if (fastPublicUser.email) forwardedHeaders.set(NW_USER_EMAIL_HEADER, fastPublicUser.email)
    if (fastPublicUser.fullName) forwardedHeaders.set(NW_USER_FULL_NAME_HEADER, fastPublicUser.fullName)

    if (pathname === '/' || pathname === '/login' || pathname === '/signup') {
      const url = request.nextUrl.clone()
      url.pathname = '/dashboard'
      const redirectResponse = NextResponse.redirect(url)
      redirectResponse.headers.set(NW_TRACE_ID_HEADER, traceId)
      logProxy('redirect.authenticated_entrypoint.fast_cookie')
      return redirectResponse
    }
  }

  // Public routes don't require a blocking auth round-trip. If we couldn't
  // derive a valid user from cookies, continue without Auth verification and
  // let route-level guards handle protected redirects.
  const publicResponse = NextResponse.next({ request: { headers: forwardedHeaders } })
  publicResponse.headers.set(NW_TRACE_ID_HEADER, traceId)
  logProxy('pass.public_fast_cookie_fallback', 'user=unknown')
  return publicResponse

  // Unreachable.
}

export const config = {
  matcher: [
    // Run the proxy on prefetch requests too. The fast-cookie path sets
    // x-nw-user-id from the session JWT in ~1-3ms; without it the
    // prefetched RSC render must hit Supabase Auth (~150-250ms), making
    // prefetches almost as slow as cold clicks.
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
