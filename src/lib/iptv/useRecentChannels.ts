'use client'

import { useCallback, useEffect, useState } from 'react'

const RECENT_KEY = 'iptv-recent-channels'
const MAX_RECENT = 10

export interface RecentChannel {
  id: string | number
  name: string
  poster?: string
  categoryId?: string
  addedAt: number
}

function load(): RecentChannel[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(RECENT_KEY)
    if (!raw) return []
    return JSON.parse(raw)
  } catch {
    return []
  }
}

function save(list: RecentChannel[]) {
  if (typeof window === 'undefined') return
  localStorage.setItem(RECENT_KEY, JSON.stringify(list))
}

export function useRecentChannels() {
  const [recent, setRecent] = useState<RecentChannel[]>([])

  useEffect(() => {
    setRecent(load())
  }, [])

  const addRecent = useCallback((ch: Omit<RecentChannel, 'addedAt'>) => {
    setRecent((prev) => {
      // Remove if already exists
      const filtered = prev.filter((r) => String(r.id) !== String(ch.id))
      const next = [{ ...ch, addedAt: Date.now() }, ...filtered].slice(0, MAX_RECENT)
      save(next)
      return next
    })
  }, [])

  const clearRecent = useCallback(() => {
    setRecent([])
    save([])
  }, [])

  return { recent, addRecent, clearRecent }
}
