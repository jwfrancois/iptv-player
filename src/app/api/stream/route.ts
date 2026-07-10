import { NextRequest, NextResponse } from 'next/server'
import { getCachedSegment, setCachedSegment, startPrefetch, touchStream } from '@/lib/iptv/segment-cache'

/**
 * Stream proxy with in-memory segment caching.
 *
 * - If the segment is cached, returns instantly (0ms) — no portal round-trip.
 * - If not cached, fetches from portal, caches, and returns.
 * - When a segment is requested, also kicks off prefetch of the parent manifest's
 *   upcoming segments so they're cached by the time hls.js asks for them.
 *
 * Query params:
 *   url       - segment URL (required)
 *   manifest  - parent m3u8 URL (optional, enables prefetch trigger)
 */
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const target = req.nextUrl.searchParams.get('url')
  const manifestUrl = req.nextUrl.searchParams.get('manifest')
  if (!target) {
    return NextResponse.json({ error: 'Missing url param' }, { status: 400 })
  }

  // 1. Check cache first — instant return if found
  const cached = getCachedSegment(target)
  if (cached) {
    // Touch the parent stream so its prefetch loop keeps running
    if (manifestUrl) touchStream(manifestUrl)
    return new NextResponse(cached.buffer as any, {
      status: 200,
      headers: {
        'Content-Type': cached.contentType,
        'Content-Length': cached.contentLength || String(cached.buffer.length),
        'Cache-Control': 'public, max-age=60',
        'Access-Control-Allow-Origin': '*',
        'X-Cache': 'HIT',
      },
    })
  }

  // 2. Cache miss — fetch from portal
  // Trigger prefetch for this manifest (starts parallel download of next segments)
  if (manifestUrl) {
    startPrefetch(manifestUrl)
  }

  const headers: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) IPTV-Player',
    Accept: '*/*',
    Referer: (() => { try { return new URL(target).origin + '/' } catch { return '' } })(),
  }
  const range = req.headers.get('range')
  if (range) headers['Range'] = range

  try {
    const upstream = await fetch(target, {
      headers,
      cache: 'no-store',
      redirect: 'follow',
    })

    if (!upstream.ok && upstream.status !== 206) {
      return NextResponse.json(
        { error: `Upstream ${upstream.status} ${upstream.statusText}` },
        {
          status: upstream.status,
          headers: { 'Cache-Control': 'no-store' },
        }
      )
    }

    const ct = upstream.headers.get('content-type') || 'video/mp2t'
    const cl = upstream.headers.get('content-length') || ''
    const buf = Buffer.from(await upstream.arrayBuffer())

    // Cache the segment for future requests (only if it's a real segment)
    if (buf.length > 1000) {
      setCachedSegment(target, buf, ct, cl)
    }

    const resHeaders = new Headers()
    resHeaders.set('Access-Control-Allow-Origin', '*')
    resHeaders.set('Access-Control-Allow-Headers', 'Range')
    resHeaders.set('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges')
    resHeaders.set('Cache-Control', 'public, max-age=60')
    resHeaders.set('Content-Type', ct)
    if (cl) resHeaders.set('Content-Length', cl)
    const cr = upstream.headers.get('content-range')
    if (cr) resHeaders.set('Content-Range', cr)
    if (upstream.headers.get('accept-ranges')) {
      resHeaders.set('Accept-Ranges', upstream.headers.get('accept-ranges')!)
    }
    resHeaders.set('X-Cache', 'MISS')

    return new NextResponse(buf as any, {
      status: upstream.status,
      headers: resHeaders,
    })
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Failed to fetch stream' },
      { status: 502 }
    )
  }
}
