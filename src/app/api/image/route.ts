import { NextRequest, NextResponse } from 'next/server'

/**
 * Image proxy for channel/VOD posters that bypass mixed-content and CORS
 * restrictions. Many IPTV portals serve icons over plain HTTP or with
 * self-signed certs, which browsers block on HTTPS pages.
 *
 * Usage: /api/image?url=<encoded url>
 */
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const target = req.nextUrl.searchParams.get('url')
  if (!target) {
    return new NextResponse('Missing url', { status: 400 })
  }

  // Reject obviously invalid URLs (some portals return "1" or empty strings)
  if (!/^https?:\/\//i.test(target)) {
    return new NextResponse('Not a valid image URL', { status: 400 })
  }

  try {
    const upstream = await fetch(target, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) IPTV-Player',
        Accept: 'image/*,*/*;q=0.8',
      },
      cache: 'no-store',
    })

    if (!upstream.ok) {
      return new NextResponse('Failed to fetch image', { status: upstream.status })
    }

    const ct = upstream.headers.get('content-type') || 'image/jpeg'
    const buf = Buffer.from(await upstream.arrayBuffer())
    return new NextResponse(buf as any, {
      status: 200,
      headers: {
        'Content-Type': ct,
        'Cache-Control': 'public, max-age=3600',
        'Access-Control-Allow-Origin': '*',
      },
    })
  } catch {
    return new NextResponse('Image fetch failed', { status: 502 })
  }
}
