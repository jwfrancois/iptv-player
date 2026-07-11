import { NextRequest, NextResponse } from 'next/server'
import { getCachedSegment } from '@/lib/iptv/segment-cache'

/**
 * Stream proxy — PIPES data through instead of buffering.
 *
 * CRITICAL: This streams the upstream response directly to the client.
 * The player receives bytes as they arrive and can start decoding immediately.
 * We never buffer the entire segment in memory.
 */
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const target = req.nextUrl.searchParams.get('url')
  if (!target) {
    return NextResponse.json({ error: 'Missing url param' }, { status: 400 })
  }

  // Check cache — instant return if found
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

  // Cache miss — stream directly from portal to player
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

    // Build response headers
    const resHeaders = new Headers()
    resHeaders.set('Access-Control-Allow-Origin', '*')
    resHeaders.set('Access-Control-Allow-Headers', 'Range')
    resHeaders.set('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges')
    resHeaders.set('Cache-Control', 'public, max-age=60')

    const ct = upstream.headers.get('content-type')
    if (ct) resHeaders.set('Content-Type', ct)
    const cl = upstream.headers.get('content-length')
    if (cl) resHeaders.set('Content-Length', cl)
    const cr = upstream.headers.get('content-range')
    if (cr) resHeaders.set('Content-Range', cr)
    if (upstream.headers.get('accept-ranges')) {
      resHeaders.set('Accept-Ranges', upstream.headers.get('accept-ranges')!)
    }
    resHeaders.set('X-Cache', 'MISS')

    if (!upstream.body) {
      return NextResponse.json({ error: 'Empty body from upstream' }, { status: 502 })
    }

    // STREAM the body directly — no buffering!
    const stream = upstream.body as unknown as NodeJS.ReadableStream
    return new NextResponse(stream as any, {
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
