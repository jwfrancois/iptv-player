import { NextRequest, NextResponse } from 'next/server'

/**
 * Xtream Codes API proxy.
 * Forwards requests to the IPTV portal server-side to avoid CORS and to keep
 * the credentials configurable per request.
 *
 * Query params accepted:
 *   portal   - portal base URL (e.g. http://etvserv.xyz:55337)
 *   username - account username
 *   password - account password
 *   action   - Xtream action name (e.g. get_live_categories, get_live_streams, get_vod_streams, get_series, get_vod_info, get_series_info)
 *   category_id - optional category id
 *   vod_id / series_id - optional id
 */

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const DEFAULT_PORTAL = 'http://etvserv.xyz:55337'
const DEFAULT_USERNAME = 'D8FYA82zSB'
const DEFAULT_PASSWORD = 'vn5Ww68zA'

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const portal = (sp.get('portal') || DEFAULT_PORTAL).replace(/\/+$/, '')
  const username = sp.get('username') || DEFAULT_USERNAME
  const password = sp.get('password') || DEFAULT_PASSWORD
  const action = sp.get('action') || ''
  const categoryId = sp.get('category_id') || ''
  const vodId = sp.get('vod_id') || ''
  const seriesId = sp.get('series_id') || ''

  const params = new URLSearchParams({ username, password })
  if (action) params.set('action', action)
  if (categoryId) params.set('category_id', categoryId)
  if (vodId) params.set('vod_id', vodId)
  if (seriesId) params.set('series_id', seriesId)

  const target = `${portal}/player_api.php?${params.toString()}`
  try {
    const upstream = await fetch(target, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) IPTV-Player',
        Accept: 'application/json, text/plain, */*',
      },
      cache: 'no-store',
    })

    if (!upstream.ok) {
      return NextResponse.json(
        { error: `Portal responded ${upstream.status} ${upstream.statusText}`, url: target },
        { status: upstream.status }
      )
    }

    const text = await upstream.text()
    try {
      const json = JSON.parse(text)
      return NextResponse.json(json, {
        headers: { 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' },
      })
    } catch {
      return new NextResponse(text, {
        status: 200,
        headers: {
          'Content-Type': 'text/plain',
          'Cache-Control': 'no-store',
          'Access-Control-Allow-Origin': '*',
        },
      })
    }
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Failed to reach portal', url: target },
      { status: 502 }
    )
  }
}
