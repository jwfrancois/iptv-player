import { NextRequest, NextResponse } from 'next/server'
import { prefetchSegmentsFromManifest } from '@/lib/iptv/segment-cache'

/**
 * HLS proxy — fetches manifest, rewrites segment URLs to /api/stream,
 * and triggers parallel prefetch of all segments.
 *
 * The browser connects to our proxy (not the portal directly), which:
 * 1. Avoids portal connection limit issues
 * 2. Allows us to parallel-download segments from the CDN (3x bandwidth)
 * 3. Caches segments for instant retries
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
      // On 403 (connection limit), auto-kill zombie connections and retry once
      if (upstream.status === 403) {
        try {
          const url = new URL(target)
          const portalBase = `${url.protocol}//${url.host}`
          const parts = url.pathname.split('/')
          if (parts.length >= 4) {
            const username = parts[2]
            const password = parts[3]
            await fetch(`${portalBase}/player_api.php?username=${username}&password=${password}&action=kill_active_connections`, { cache: 'no-store' }).catch(() => {})
          }
          // Retry the manifest fetch after killing connections
          const retry = await fetch(target, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) IPTV-Player',
              Accept: '*/*',
              Referer: new URL(target).origin + '/',
            },
            cache: 'no-store',
            redirect: 'follow',
          })
          if (retry.ok) {
            const finalUrl = retry.url || target
            const text = await retry.text()
            const rewritten = rewriteManifest(text, finalUrl)
            prefetchSegmentsFromManifest(text, finalUrl)
            return new NextResponse(rewritten, {
              status: 200,
              headers: {
                'Content-Type': 'application/vnd.apple.mpegurl',
                'Cache-Control': 'no-store',
                'Access-Control-Allow-Origin': '*',
              },
            })
          }
        } catch {}
      }

      let reason = 'Stream unavailable'
      if (upstream.status === 403) reason = 'Channel forbidden (connection limit or subscription)'
      else if (upstream.status === 404) reason = 'Channel not found or offline'
      else if (upstream.status === 456) reason = 'Stream blocked by portal'

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

    // PARALLEL PREFETCH: Download all segments from this manifest in parallel.
    // The CDN allows multiple connections at full speed (1.4MB/s each vs
    // 400KB/s for single connection). This fills the cache so /api/stream
    // gets instant cache hits.
    prefetchSegmentsFromManifest(text, finalUrl)

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
