'use client'

import { useCallback, useEffect, useState } from 'react'

export interface Portal {
  id: string
  name: string
  portal: string
  username: string
  password: string
  createdAt: number
}

export interface PortalConfig {
  portal: string
  username: string
  password: string
}

const PORTALS_KEY = 'iptv-portals-list'
const ACTIVE_KEY = 'iptv-active-portal'

/** Generate a short unique ID for new portals. */
function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

/** Default portal (pre-configured from the original session). */
export const DEFAULT_PORTALS: Portal[] = [
  {
    id: 'default',
    name: 'Eternal TV',
    portal: 'http://etvserv.xyz:55337',
    username: 'D8FYA82zSB',
    password: 'vn5Ww68zA',
    createdAt: Date.now(),
  },
]

function loadPortals(): Portal[] {
  if (typeof window === 'undefined') return DEFAULT_PORTALS
  try {
    const raw = localStorage.getItem(PORTALS_KEY)
    if (!raw) return DEFAULT_PORTALS
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_PORTALS
    return parsed
  } catch {
    return DEFAULT_PORTALS
  }
}

function savePortals(list: Portal[]) {
  if (typeof window === 'undefined') return
  localStorage.setItem(PORTALS_KEY, JSON.stringify(list))
}

function loadActiveId(): string {
  if (typeof window === 'undefined') return 'default'
  return localStorage.getItem(ACTIVE_KEY) || 'default'
}

function saveActiveId(id: string) {
  if (typeof window === 'undefined') return
  localStorage.setItem(ACTIVE_KEY, id)
}

/**
 * Multi-portal store. Manages a list of IPTV portals and tracks which one
 * is currently active. Persists to localStorage.
 */
export function usePortals() {
  const [portals, setPortals] = useState<Portal[]>(DEFAULT_PORTALS)
  const [activeId, setActiveId] = useState<string>('default')

  // Load from localStorage on mount
  useEffect(() => {
    setPortals(loadPortals())
    setActiveId(loadActiveId())
  }, [])

  // If activeId doesn't exist in the list, fall back to first portal
  useEffect(() => {
    if (portals.length === 0) return
    if (!portals.find((p) => p.id === activeId)) {
      setActiveId(portals[0].id)
      saveActiveId(portals[0].id)
    }
  }, [portals, activeId])

  const activePortal = portals.find((p) => p.id === activeId) || portals[0] || null

  const addPortal = useCallback((data: Omit<Portal, 'id' | 'createdAt'>): Portal => {
    const newPortal: Portal = {
      ...data,
      id: genId(),
      createdAt: Date.now(),
    }
    setPortals((prev) => {
      const next = [...prev, newPortal]
      savePortals(next)
      return next
    })
    return newPortal
  }, [])

  const updatePortal = useCallback((id: string, data: Partial<Omit<Portal, 'id' | 'createdAt'>>) => {
    setPortals((prev) => {
      const next = prev.map((p) => (p.id === id ? { ...p, ...data } : p))
      savePortals(next)
      return next
    })
  }, [])

  const removePortal = useCallback((id: string) => {
    setPortals((prev) => {
      if (prev.length <= 1) return prev // don't allow removing last portal
      const next = prev.filter((p) => p.id !== id)
      savePortals(next)
      // If we removed the active portal, switch to the first remaining
      if (id === activeId) {
        const newActive = next[0].id
        setActiveId(newActive)
        saveActiveId(newActive)
      }
      return next
    })
  }, [activeId])

  const switchPortal = useCallback((id: string) => {
    setActiveId(id)
    saveActiveId(id)
  }, [])

  /** Test a portal connection without adding it. Returns true on success. */
  const testPortal = useCallback(async (cfg: PortalConfig): Promise<boolean> => {
    try {
      const sp = new URLSearchParams({
        portal: cfg.portal,
        username: cfg.username,
        password: cfg.password,
      })
      const res = await fetch(`/api/iptv?${sp.toString()}`, { cache: 'no-store' })
      if (!res.ok) return false
      const data = await res.json()
      return data?.user_info?.auth === 1
    } catch {
      return false
    }
  }, [])

  return {
    portals,
    activePortal,
    activeId,
    addPortal,
    updatePortal,
    removePortal,
    switchPortal,
    testPortal,
  }
}
