/**
 * Custom hls.js fragment loader with client-side parallel prefetch.
 *
 * ROOT CAUSE OF BUFFERING:
 * The IPTV CDN rate-limits SINGLE connections to ~400KB/s.
 * A 4.5MB segment takes 11s to download on a single connection,
 * but the segment only contains 10s of video → slower than realtime → buffering.
 *
 * However, MULTIPLE connections each get 1.4MB/s (3s per segment).
 * So we need to download segments in PARALLEL.
 *
 * hls.js only downloads 1 segment at a time. This custom loader:
 * 1. When hls.js requests segment N, fetches it normally
 * 2. Simultaneously prefetches segments N+1, N+2, N+3 in parallel
 * 3. Caches prefetched segments in memory (as Blobs)
 * 4. When hls.js requests a prefetched segment, returns it instantly
 *
 * This gives us 4x parallel download → 4x faster → buffer fills in seconds.
 */

interface PrefetchedSegment {
  blob: Blob
  fetchedAt: number
}

// In-memory cache of prefetched segments (URL → Blob)
const prefetchCache = new Map<string, PrefetchedSegment>()

// Track which segments are currently being prefetched
const inFlightPrefetch = new Set<string>()

// Maximum prefetched segments to keep in memory
const MAX_PREFETCH_CACHE = 12

// How many segments to prefetch in parallel
const PARALLEL_PREFETCH_COUNT = 3

// TTL for prefetched segments (2 minutes — live segments expire)
const PREFETCH_TTL_MS = 2 * 60 * 1000

/** Fetch a segment and cache it. Fire-and-forget for prefetch. */
async function prefetchSegment(url: string): Promise<void> {
  if (prefetchCache.has(url)) return
  if (inFlightPrefetch.has(url)) return
  inFlightPrefetch.add(url)
  try {
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) return
    const blob = await res.blob()
    if (blob.size < 100) return // skip tiny/error responses
    prefetchCache.set(url, { blob, fetchedAt: Date.now() })
    evictOldSegments()
  } catch {
    // Network error — skip
  } finally {
    inFlightPrefetch.delete(url)
  }
}

/** Evict expired segments and enforce max cache size. */
function evictOldSegments() {
  const now = Date.now()
  for (const [url, seg] of prefetchCache) {
    if (now - seg.fetchedAt > PREFETCH_TTL_MS) {
      prefetchCache.delete(url)
    }
  }
  if (prefetchCache.size > MAX_PREFETCH_CACHE) {
    // Remove oldest
    let oldestUrl: string | null = null
    let oldestTime = Infinity
    for (const [url, seg] of prefetchCache) {
      if (seg.fetchedAt < oldestTime) {
        oldestTime = seg.fetchedAt
        oldestUrl = url
      }
    }
    if (oldestUrl) prefetchCache.delete(oldestUrl)
  }
}

/**
 * Parse an m3u8 manifest and return absolute segment URLs.
 */
function parseSegmentUrls(manifestText: string, baseUrl: string): string[] {
  const lines = manifestText.split(/\r?\n/)
  const segments: string[] = []
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    try {
      segments.push(new URL(trimmed, baseUrl).toString())
    } catch {
      // skip invalid URLs
    }
  }
  return segments
}

/**
 * Prefetch the next N segments from a manifest in parallel.
 * Called when hls.js loads a manifest — we proactively fetch
 * upcoming segments so they're cached when hls.js needs them.
 */
export function prefetchFromManifest(manifestUrl: string, manifestText: string) {
  try {
    const baseUrl = manifestUrl
    const segments = parseSegmentUrls(manifestText, baseUrl)
    // Find segments not yet cached or in-flight
    let count = 0
    for (const seg of segments) {
      if (count >= PARALLEL_PREFETCH_COUNT) break
      if (prefetchCache.has(seg)) continue
      if (inFlightPrefetch.has(seg)) continue
      prefetchSegment(seg).catch(() => {})
      count++
    }
  } catch {
    // ignore errors
  }
}

/**
 * Check if a segment URL is in the prefetch cache.
 * Returns the Blob if cached, null otherwise.
 */
export function getCachedSegmentBlob(url: string): Blob | null {
  const seg = prefetchCache.get(url)
  if (!seg) return null
  if (Date.now() - seg.fetchedAt > PREFETCH_TTL_MS) {
    prefetchCache.delete(url)
    return null
  }
  return seg.blob
}

/**
 * Clear the prefetch cache (when switching channels).
 */
export function clearPrefetchCache() {
  prefetchCache.clear()
  inFlightPrefetch.clear()
}

/**
 * Directly prefetch a single segment URL.
 * Used when hls.js loads a manifest — we prefetch the first few segments
 * in parallel so they're cached when hls.js requests them.
 */
export function prefetchSegmentUrl(url: string) {
  prefetchSegment(url).catch(() => {})
}
