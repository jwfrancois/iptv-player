import { NextRequest, NextResponse } from 'next/server'

/**
 * Stream proxy. Fetches the upstream stream and pipes it back to the browser,
 * forwarding Range requests so HLS / TS / MP4 playback works without CORS
 * issues. The upstream URL is passed in the `url` query param.
 *
 * Usage: /api/stream?url=<encoded stream url>
 */
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const target = req.nextUrl.searchParams.get('url')
  if (!target) {
    return NextResponse.json({ error: 'Missing url param' }, { status: 400 })
  }

  // Forward Range header for video seeking
  const headers: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) IPTV-Player',
    Accept: '*/*',
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
        { error: `Upstream ${upstream.status} ${upstream.statusText}`, url: target },
        { status: upstream.status }
      )
    }

    // Forward the body and important headers
    const resHeaders = new Headers()
    resHeaders.set('Access-Control-Allow-Origin', '*')
    resHeaders.set('Access-Control-Allow-Headers', 'Range')
    resHeaders.set('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges')
    resHeaders.set('Cache-Control', 'no-store')

    const ct = upstream.headers.get('content-type')
    if (ct) resHeaders.set('Content-Type', ct)
    const cl = upstream.headers.get('content-length')
    if (cl) resHeaders.set('Content-Length', cl)
    const cr = upstream.headers.get('content-range')
    if (cr) resHeaders.set('Content-Range', cr)
    if (upstream.headers.get('accept-ranges')) {
      resHeaders.set('Accept-Ranges', upstream.headers.get('accept-ranges')!)
    }

    if (!upstream.body) {
      return NextResponse.json({ error: 'Empty body from upstream' }, { status: 502 })
    }

    // Convert Web ReadableStream to Node ReadableStream for Next.js
    const stream = upstream.body as unknown as NodeJS.ReadableStream
    return new NextResponse(stream as any, {
      status: upstream.status,
      headers: resHeaders,
    })
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Failed to fetch stream', url: target },
      { status: 502 }
    )
  }
}
