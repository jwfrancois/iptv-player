'use client'

import { useCallback, useEffect, useState } from 'react'

const RECENT_PREFIX = 'iptv-recent-channels-'
const MAX_RECENT = 10

export interface RecentChannel {
  id: string | number
  name: string
  poster?: string
  categoryId?: string
  addedAt: number
}

function load(portalId: string): RecentChannel[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(`${RECENT_PREFIX}${portalId}`)
    if (!raw) return []
    return JSON.parse(raw)
  } catch {
    return []
  }
}

function save(portalId: string, list: RecentChannel[]) {
  if (typeof window === 'undefined') return
  localStorage.setItem(`${RECENT_PREFIX}${portalId}`, JSON.stringify(list))
}

/**
 * Recently watched channels, namespaced per portal.
 * Pass the active portal ID — when it changes, the hook loads that portal's
 * recent list from localStorage.
 */
export function useRecentChannels(portalId: string) {
  const [recent, setRecent] = useState<RecentChannel[]>([])

  useEffect(() => {
    setRecent(load(portalId))
  }, [portalId])

  const addRecent = useCallback(
    (ch: Omit<RecentChannel, 'addedAt'>) => {
      setRecent((prev) => {
        // Remove if already exists
        const filtered = prev.filter((r) => String(r.id) !== String(ch.id))
        const next = [{ ...ch, addedAt: Date.now() }, ...filtered].slice(0, MAX_RECENT)
        save(portalId, next)
        return next
      })
    },
    [portalId]
  )

  const clearRecent = useCallback(() => {
    setRecent([])
    save(portalId, [])
  }, [portalId])

  return { recent, addRecent, clearRecent }
}
