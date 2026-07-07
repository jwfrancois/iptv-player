'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { EpgProgram } from './types'

const EPG_CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes
const NOW_CHECK_INTERVAL_MS = 30 * 1000 // recompute "now playing" every 30s

interface CacheEntry {
  programs: EpgProgram[]
  fetchedAt: number
}

const cache = new Map<string, CacheEntry>()

/** Compute which program is currently airing given epoch seconds. */
export function findNowPlaying(programs: EpgProgram[], nowSec: number): EpgProgram | null {
  for (const p of programs) {
    if (p.start <= nowSec && p.end > nowSec) return p
  }
  return null
}

export function findNext(programs: EpgProgram[], nowSec: number): EpgProgram | null {
  for (const p of programs) {
    if (p.start > nowSec) return p
  }
  return null
}

/** Format epoch seconds into a friendly "8:30 PM" string. */
export function formatTime(sec: number): string {
  if (!sec) return ''
  return new Date(sec * 1000).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  })
}

/** Format a duration range like "8:30 PM – 9:00 PM". */
export function formatTimeRange(start: number, end: number): string {
  return `${formatTime(start)} – ${formatTime(end)}`
}

/** Compute progress 0-1 for the currently-airing program. */
export function programProgress(p: EpgProgram, nowSec: number): number {
  if (!p || p.end <= p.start) return 0
  return Math.min(1, Math.max(0, (nowSec - p.start) / (p.end - p.start)))
}

interface UseEpgOptions {
  streamId: string | number | null
  fetcher: (id: string | number) => Promise<EpgProgram[]>
}

export function useEpg({ streamId, fetcher }: UseEpgOptions) {
  const [programs, setPrograms] = useState<EpgProgram[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nowSec, setNowSec] = useState(() => Math.floor(Date.now() / 1000))
  const fetcherRef = useRef(fetcher)
  useEffect(() => {
    fetcherRef.current = fetcher
  }, [fetcher])

  // Tick "now" every 30s so the now/next computation stays fresh
  useEffect(() => {
    const t = setInterval(() => setNowSec(Math.floor(Date.now() / 1000)), NOW_CHECK_INTERVAL_MS)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    if (!streamId) {
      setPrograms([])
      return
    }
    const key = String(streamId)
    const cached = cache.get(key)
    if (cached && Date.now() - cached.fetchedAt < EPG_CACHE_TTL_MS) {
      setPrograms(cached.programs)
      setError(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    fetcherRef
      .current(streamId)
      .then((list) => {
        if (cancelled) return
        cache.set(key, { programs: list, fetchedAt: Date.now() })
        setPrograms(list)
      })
      .catch((e) => {
        if (cancelled) return
        setError(e?.message || 'Failed to load EPG')
        setPrograms([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [streamId])

  const nowPlaying = findNowPlaying(programs, nowSec)
  const next = findNext(programs, nowSec)
  const progress = nowPlaying ? programProgress(nowPlaying, nowSec) : 0

  return {
    programs,
    nowPlaying,
    next,
    progress,
    loading,
    error,
    refresh: useCallback(() => {
      if (!streamId) return
      cache.delete(String(streamId))
      // Trigger re-fetch by toggling effect dependency — easiest: re-set nowSec
      setNowSec(Math.floor(Date.now() / 1000))
      // Force re-fetch by clearing programs and re-running effect
      const key = String(streamId)
      cache.delete(key)
      fetcherRef
        .current(streamId)
        .then((list) => {
          cache.set(key, { programs: list, fetchedAt: Date.now() })
          setPrograms(list)
        })
        .catch(() => {})
    }, [streamId]),
  }
}
