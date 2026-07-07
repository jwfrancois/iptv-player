import { NextRequest, NextResponse } from 'next/server'

/**
 * HLS proxy that fetches an m3u8 playlist, rewrites all segment and sub-playlist
 * URLs to absolute (based on the m3u8 URL), then rewrites them again to go
 * through /api/hls (for .m3u8) or /api/stream (for .ts/.mp4/.key).
 *
 * This is necessary because hls.js, when loading a manifest from /api/stream,
 * resolves relative segment URLs against /api/stream's URL (localhost), not the
 * upstream portal URL.
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
      // Return a tiny but valid m3u8 that signals the error to hls.js via
      // an HTTP error response. We pass through the upstream status so the
      // player can show a meaningful message (403 = forbidden/geo-restricted,
      // 404 = channel offline, etc.).
      let reason = 'Stream unavailable'
      if (upstream.status === 403) reason = 'Channel forbidden (subscription tier, geo-restriction, or concurrent connection limit)'
      else if (upstream.status === 404) reason = 'Channel not found or offline'
      else if (upstream.status === 451 || upstream.status === 452) reason = 'Channel unavailable in your region'
      else if (upstream.status >= 500) reason = 'Portal server error — try again'

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

    // upstream.url is the FINAL url after all redirects — use it as the base
    // for resolving relative segment URLs in the manifest.
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
