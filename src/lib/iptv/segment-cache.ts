/**
 * Server-side segment cache with parallel prefetch.
 *
 * The CDN rate-limits single connections to ~400KB/s but allows multiple
 * connections at 1.4MB/s each. We download segments in PARALLEL on the
 * server side, cache them, and serve to the browser via streaming pipe.
 *
 * The browser connects to our proxy (1 connection, doesn't count against
 * portal's connection limit). Our proxy downloads from the CDN using
 * parallel connections (3x bandwidth).
 */

interface CachedSegment {
  buffer: Buffer
  contentType: string
  contentLength: string
  expires: number
}

const SEGMENT_TTL_MS = 60 * 1000
const MAX_CACHED_SEGMENTS = 20

const segmentCache = new Map<string, CachedSegment>()
const inFlightPromises = new Map<string, Promise<void>>()

/** Fetch a segment and cache it. */
function fetchAndCacheSegment(url: string): Promise<void> {
  if (segmentCache.has(url)) return Promise.resolve()
  if (inFlightPromises.has(url)) return inFlightPromises.get(url)!

  const promise = (async () => {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) IPTV-Player',
          Accept: '*/*',
          Referer: (() => { try { return new URL(url).origin + '/' } catch { return '' } })(),
        },
        cache: 'no-store',
        redirect: 'follow',
      })
      if (!res.ok) return
      const contentType = res.headers.get('content-type') || 'video/mp2t'
      const contentLength = res.headers.get('content-length') || ''
      const buffer = Buffer.from(await res.arrayBuffer())
      if (buffer.length < 100) return
      segmentCache.set(url, {
        buffer,
        contentType,
        contentLength,
        expires: Date.now() + SEGMENT_TTL_MS,
      })
      evictOldSegments()
    } catch {
      // Network error — skip
    } finally {
      inFlightPromises.delete(url)
    }
  })()

  inFlightPromises.set(url, promise)
  return promise
}

function evictOldSegments() {
  const now = Date.now()
  for (const [url, seg] of segmentCache) {
    if (now > seg.expires) segmentCache.delete(url)
  }
  if (segmentCache.size > MAX_CACHED_SEGMENTS) {
    const toRemove = segmentCache.size - MAX_CACHED_SEGMENTS
    let i = 0
    for (const key of segmentCache.keys()) {
      segmentCache.delete(key)
      i++
      if (i >= toRemove) break
    }
  }
}

function absoluteUrl(relative: string, base: string): string {
  try {
    return new URL(relative, base).toString()
  } catch {
    return relative
  }
}

function parseManifestSegments(content: string, baseUrl: string): string[] {
  const lines = content.split(/\r?\n/)
  const segments: string[] = []
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    segments.push(absoluteUrl(trimmed, baseUrl))
  }
  return segments
}

/**
 * Prefetch segments from a manifest in PARALLEL.
 * Called by /api/hls after serving a manifest.
 */
export function prefetchSegmentsFromManifest(manifestContent: string, manifestBaseUrl: string) {
  const segments = parseManifestSegments(manifestContent, manifestBaseUrl)
  // Prefetch ALL segments in the manifest in parallel (fire-and-forget).
  // The CDN allows multiple connections at full speed.
  for (const seg of segments) {
    if (segmentCache.has(seg)) continue
    if (inFlightPromises.has(seg)) continue
    fetchAndCacheSegment(seg).catch(() => {})
  }
}

/** Get a cached segment. */
export function getCachedSegment(url: string): CachedSegment | null {
  const seg = segmentCache.get(url)
  if (!seg) return null
  if (Date.now() > seg.expires) {
    segmentCache.delete(url)
    return null
  }
  return seg
}

/** Wait for an in-flight segment download, then return from cache. */
export async function waitForInFlight(url: string): Promise<CachedSegment | null> {
  const promise = inFlightPromises.get(url)
  if (!promise) return null
  await promise
  return getCachedSegment(url)
}

/** Cache a segment fetched by the stream proxy. */
export function setCachedSegment(url: string, buffer: Buffer, contentType: string, contentLength: string) {
  segmentCache.set(url, {
    buffer,
    contentType,
    contentLength,
    expires: Date.now() + SEGMENT_TTL_MS,
  })
  evictOldSegments()
}
