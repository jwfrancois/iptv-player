import { NextRequest, NextResponse } from 'next/server'
import { getCachedSegment, waitForInFlight, setCachedSegment } from '@/lib/iptv/segment-cache'

/**
 * Stream proxy with parallel-prefetch cache.
 *
 * 1. Check cache → instant return (no CDN connection needed)
 * 2. Check if segment is being prefetched → wait for it, return from cache
 * 3. Cache miss → fetch from CDN, cache, return
 *
 * The prefetch system downloads segments in parallel (3x bandwidth),
 * so most requests hit the cache.
 */
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const target = req.nextUrl.searchParams.get('url')
  if (!target) {
    return NextResponse.json({ error: 'Missing url param' }, { status: 400 })
  }

  // 1. Check cache — instant return
  const cached = getCachedSegment(target)
  if (cached) {
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

  // 2. Check if segment is being prefetched — wait for it
  const inFlightResult = await waitForInFlight(target)
  if (inFlightResult) {
    return new NextResponse(inFlightResult.buffer as any, {
      status: 200,
      headers: {
        'Content-Type': inFlightResult.contentType,
        'Content-Length': inFlightResult.contentLength || String(inFlightResult.buffer.length),
        'Cache-Control': 'public, max-age=60',
        'Access-Control-Allow-Origin': '*',
        'X-Cache': 'HIT-INFLIGHT',
      },
    })
  }

  // 3. Cache miss — fetch from CDN
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
        { error: `Upstream ${upstream.status}` },
        { status: upstream.status, headers: { 'Cache-Control': 'no-store' } }
      )
    }

    const ct = upstream.headers.get('content-type') || 'video/mp2t'
    const cl = upstream.headers.get('content-length') || ''
    const buf = Buffer.from(await upstream.arrayBuffer())

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
