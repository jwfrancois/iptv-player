import { NextRequest, NextResponse } from 'next/server'

/**
 * Image proxy for channel/VOD posters that bypass mixed-content and CORS
 * restrictions. Many IPTV portals serve icons over plain HTTP or with
 * self-signed certs, which browsers block on HTTPS pages.
 *
 * Returns a 1x1 transparent GIF for any failure so the browser doesn't
 * show a broken-image icon and the console stays clean.
 *
 * Usage: /api/image?url=<encoded url>
 */
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// 1x1 transparent GIF
const PLACEHOLDER_GIF = Buffer.from(
  'R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==',
  'base64'
)

export async function GET(req: NextRequest) {
  const target = req.nextUrl.searchParams.get('url')
  if (!target) {
    return servePlaceholder()
  }

  // Reject obviously invalid URLs (some portals return "1" or empty strings)
  if (!/^https?:\/\//i.test(target)) {
    return servePlaceholder()
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
      return servePlaceholder()
    }

    const ct = upstream.headers.get('content-type') || ''
    // Some "icon" URLs return HTML error pages — treat those as missing
    if (ct.startsWith('text/') || ct.includes('html')) {
      return servePlaceholder()
    }

    const buf = Buffer.from(await upstream.arrayBuffer())
    // If body is suspiciously small, it's probably an error — skip
    if (buf.length < 100) {
      return servePlaceholder()
    }

    return new NextResponse(buf as any, {
      status: 200,
      headers: {
        'Content-Type': ct || 'image/jpeg',
        'Cache-Control': 'public, max-age=3600',
        'Access-Control-Allow-Origin': '*',
      },
    })
  } catch {
    return servePlaceholder()
  }
}

function servePlaceholder() {
  return new NextResponse(PLACEHOLDER_GIF as any, {
    status: 200,
    headers: {
      'Content-Type': 'image/gif',
      'Cache-Control': 'public, max-age=300',
      'Access-Control-Allow-Origin': '*',
    },
  })
}
