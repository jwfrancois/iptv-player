import { NextRequest, NextResponse } from 'next/server'

/**
 * HLS proxy — rewrites segment URLs to go through /api/stream (which pipes
 * data through without buffering).
 *
 * We use the proxy for segments because:
 * 1. It lets us control connections (avoid portal 403 from too many connections)
 * 2. It handles CORS (some CDN hosts don't send CORS headers consistently)
 * 3. It provides error handling (friendly messages for 403/456/etc)
 *
 * The stream proxy PIPES data through — it does NOT buffer the entire segment.
 */
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function absoluteUrl(relative: string, base: string): string {
  try {
    return new URL(relative, base).toString()
  } catch {
    return relative
  }
}

function rewriteManifest(content: string, baseUrl: string): string {
  const lines = content.split(/\r?\n/)
  return lines
    .map((line) => {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) {
        return rewriteAttributes(line, baseUrl)
      }
      const abs = absoluteUrl(trimmed, baseUrl)
      return routeUrl(abs)
    })
    .join('\n')
}

function rewriteAttributes(line: string, baseUrl: string): string {
  return line.replace(/URI="([^"]+)"/g, (_match, uri) => {
    const abs = absoluteUrl(uri, baseUrl)
    return `URI="${routeUrl(abs)}"`
  })
}

function routeUrl(absUrl: string): string {
  const lower = absUrl.toLowerCase().split('?')[0]
  if (lower.endsWith('.m3u8') || lower.endsWith('.m3u')) {
    return `/api/hls?url=${encodeURIComponent(absUrl)}`
  }
  return `/api/stream?url=${encodeURIComponent(absUrl)}`
}

export async function GET(req: NextRequest) {
  const target = req.nextUrl.searchParams.get('url')
  if (!target) {
    return NextResponse.json({ error: 'Missing url param' }, { status: 400 })
  }

  try {
    const upstream = await fetch(target, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) IPTV-Player',
        Accept: '*/*',
        Referer: new URL(target).origin + '/',
      },
      cache: 'no-store',
      redirect: 'follow',
    })

    if (!upstream.ok) {
      let reason = 'Stream unavailable'
      if (upstream.status === 403) reason = 'Channel forbidden (subscription tier, geo-restriction, or concurrent connection limit)'
      else if (upstream.status === 404) reason = 'Channel not found or offline'
      else if (upstream.status === 451 || upstream.status === 452) reason = 'Channel unavailable in your region'
      else if (upstream.status === 456) reason = 'Stream blocked by portal. This may be due to datacenter IP detection, concurrent connection limit, or geo-restriction. Try connecting from a residential network or VPN.'
      else if (upstream.status === 580) reason = 'Portal is overloaded. Try again in a moment'
      else if (upstream.status >= 500) reason = 'Portal server error. Try again'

      return NextResponse.json(
        { error: reason, upstreamStatus: upstream.status },
        {
          status: upstream.status,
          headers: {
            'X-IPTV-Error': 'true',
            'X-IPTV-Reason': reason,
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Expose-Headers': 'X-IPTV-Error, X-IPTV-Reason',
          },
        }
      )
    }

    const finalUrl = upstream.url || target
    const text = await upstream.text()
    const rewritten = rewriteManifest(text, finalUrl)

    return new NextResponse(rewritten, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.apple.mpegurl',
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*',
      },
    })
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'HLS fetch failed' },
      { status: 502 }
    )
  }
}
