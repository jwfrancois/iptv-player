/**
 * Server-side segment cache + parallel prefetch manager.
 *
 * The core problem: the IPTV portal's segment server delivers data slowly
 * when fetching one segment at a time (~3s per 4.5MB segment = barely
 * realtime). But parallel downloads are 3x faster (3 segments finish in
 * ~3s total).
 *
 * Solution:
 * 1. When hls.js requests segment N, we cache it in memory.
 * 2. We proactively prefetch upcoming segments (N+1, N+2, N+3) in parallel.
 * 3. By the time hls.js requests the next segment, it's already cached and
 *    returns instantly (0ms instead of 3s).
 *
 * This effectively turns our Next.js server into a streaming CDN edge.
 */

interface CachedSegment {
  buffer: Buffer
  contentType: string
  contentLength: string
  expires: number
}

interface ActiveStream {
  manifestUrl: string
  lastAccessed: number
  prefetchTimer: NodeJS.Timeout | null
  /** Set of segment URLs currently being downloaded (avoid duplicate fetches). */
  inFlight: Set<string>
}

const SEGMENT_TTL_MS = 90 * 1000 // 90 seconds — live segments expire fast
const PREFETCH_INTERVAL_MS = 2 * 1000 // check for new segments every 2s (aggressive)
const MAX_PARALLEL_PREFETCH = 6 // download up to 6 segments at once
const MAX_CACHED_SEGMENTS = 60 // evict oldest beyond this
const MAX_ACTIVE_STREAMS = 4 // limit active prefetch streams (connection limit)

// Shared singletons — persist across requests in the Node.js runtime
const segmentCache = new Map<string, CachedSegment>()
const activeStreams = new Map<string, ActiveStream>()

function absoluteUrl(relative: string, base: string): string {
  try {
    return new URL(relative, base).toString()
  } catch {
    return relative
  }
}

/** Parse an m3u8 manifest and return absolute segment URLs (in order). */
function parseManifestSegments(content: string, baseUrl: string): string[] {
  const lines = content.split(/\r?\n/)
  const segments: string[] = []
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    // Segment URL line
    segments.push(absoluteUrl(trimmed, baseUrl))
  }
  return segments
}

/** Fetch a segment and cache it. Returns void (fire-and-forget for prefetch). */
async function fetchAndCacheSegment(url: string): Promise<void> {
  if (segmentCache.has(url)) return
  // Find the active stream this URL belongs to (to check inFlight)
  for (const stream of activeStreams.values()) {
    if (stream.inFlight.has(url)) return
  }
  // Mark as in-flight on all active streams (simplest: find by URL match)
  // Actually, just use a global inFlight set to avoid complex tracking
  if (globalInFlight.has(url)) return
  globalInFlight.add(url)
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
    if (buffer.length < 100) return // skip tiny/error responses
    segmentCache.set(url, {
      buffer,
      contentType,
      contentLength,
      expires: Date.now() + SEGMENT_TTL_MS,
    })
    evictOldSegments()
  } catch {
    // Network error — just skip, will retry next cycle
  } finally {
    globalInFlight.delete(url)
  }
}

// Global in-flight tracker (avoids duplicate parallel fetches of same URL)
const globalInFlight = new Set<string>()

/** Evict expired segments and enforce max cache size. */
function evictOldSegments() {
  const now = Date.now()
  // Remove expired
  for (const [url, seg] of segmentCache) {
    if (now > seg.expires) segmentCache.delete(url)
  }
  // Enforce max size — remove oldest by insertion order (Map preserves it)
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

/** Prefetch upcoming segments for a stream in parallel. */
async function prefetchStream(manifestUrl: string) {
  const stream = activeStreams.get(manifestUrl)
  if (!stream) return
  try {
    const res = await fetch(manifestUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) IPTV-Player',
        Accept: '*/*',
        Referer: (() => { try { return new URL(manifestUrl).origin + '/' } catch { return '' } })(),
      },
      cache: 'no-store',
      redirect: 'follow',
    })
    if (!res.ok) return
    const finalUrl = res.url || manifestUrl
    const text = await res.text()
    const segments = parseManifestSegments(text, finalUrl)
    // Find segments not yet cached and not in-flight
    const toPrefetch: string[] = []
    for (const seg of segments) {
      if (segmentCache.has(seg)) continue
      if (globalInFlight.has(seg)) continue
      toPrefetch.push(seg)
    }
    // Download in parallel (up to MAX_PARALLEL_PREFETCH at once)
    // For live streams, there are usually 4-6 segments in the manifest.
    // Download ALL of them in parallel — this is the key to staying ahead
    // of hls.js.
    const batch = toPrefetch.slice(0, MAX_PARALLEL_PREFETCH)
    for (const seg of batch) {
      fetchAndCacheSegment(seg).catch(() => {})
    }
  } catch {
    // Manifest fetch failed — will retry next cycle
  }
}

/** Start a prefetch loop for a stream. */
export function startPrefetch(manifestUrl: string) {
  let stream = activeStreams.get(manifestUrl)
  if (stream) {
    stream.lastAccessed = Date.now()
    return // already prefetching
  }
  // Enforce max active streams
  if (activeStreams.size >= MAX_ACTIVE_STREAMS) {
    // Stop the least-recently-accessed stream
    let oldest: string | null = null
    let oldestTime = Infinity
    for (const [url, s] of activeStreams) {
      if (s.lastAccessed < oldestTime) {
        oldestTime = s.lastAccessed
        oldest = url
      }
    }
    if (oldest) stopPrefetch(oldest)
  }
  stream = {
    manifestUrl,
    lastAccessed: Date.now(),
    prefetchTimer: null,
    inFlight: new Set(),
  }
  activeStreams.set(manifestUrl, stream)
  // Immediately prefetch
  prefetchStream(manifestUrl).catch(() => {})
  // Schedule recurring prefetch
  stream.prefetchTimer = setInterval(() => {
    prefetchStream(manifestUrl).catch(() => {})
  }, PREFETCH_INTERVAL_MS)
}

/** Stop prefetching a stream (when user switches channels). */
export function stopPrefetch(manifestUrl: string) {
  const stream = activeStreams.get(manifestUrl)
  if (!stream) return
  if (stream.prefetchTimer) {
    clearInterval(stream.prefetchTimer)
    stream.prefetchTimer = null
  }
  activeStreams.delete(manifestUrl)
}

/** Mark a stream as accessed (keeps it alive). */
export function touchStream(manifestUrl: string) {
  const stream = activeStreams.get(manifestUrl)
  if (stream) stream.lastAccessed = Date.now()
}

/** Get a cached segment. Returns null if not cached or expired. */
export function getCachedSegment(url: string): CachedSegment | null {
  const seg = segmentCache.get(url)
  if (!seg) return null
  if (Date.now() > seg.expires) {
    segmentCache.delete(url)
    return null
  }
  return seg
}

/** Cache a segment that was just fetched (e.g., on cache miss in /api/stream). */
export function setCachedSegment(url: string, buffer: Buffer, contentType: string, contentLength: string) {
  segmentCache.set(url, {
    buffer,
    contentType,
    contentLength,
    expires: Date.now() + SEGMENT_TTL_MS,
  })
  evictOldSegments()
}

/** Get cache stats for debugging/monitoring. */
export function getCacheStats() {
  return {
    cachedSegments: segmentCache.size,
    activeStreams: activeStreams.size,
    inFlight: globalInFlight.size,
  }
}
