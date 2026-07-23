'use client'

import { useCallback, useEffect, useState } from 'react'
import type {
  AuthResponse,
  Category,
  EpgProgram,
  LiveStream,
  Series,
  SeriesInfo,
  ShortEpgResponse,
  VodInfo,
  VodStream,
} from './types'
import { decodeEpgProgram } from './types'

export interface PortalConfig {
  portal: string
  username: string
  password: string
}

const STORAGE_KEY = 'iptv-portal-config'

export const DEFAULT_CONFIG: PortalConfig = {
  portal: 'http://etvserv.xyz:55337',
  username: 'D8FYA82zSB',
  password: 'vn5Ww68zA',
}

export function loadConfig(): PortalConfig {
  if (typeof window === 'undefined') return DEFAULT_CONFIG
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_CONFIG
    const parsed = JSON.parse(raw)
    return { ...DEFAULT_CONFIG, ...parsed }
  } catch {
    return DEFAULT_CONFIG
  }
}

export function saveConfig(cfg: PortalConfig) {
  if (typeof window === 'undefined') return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg))
}

async function api<T>(cfg: PortalConfig, params: Record<string, string>): Promise<T> {
  const sp = new URLSearchParams({
    portal: cfg.portal,
    username: cfg.username,
    password: cfg.password,
    ...params,
  })
  const res = await fetch(`/api/iptv?${sp.toString()}`, { cache: 'no-store' })
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(`API ${res.status}: ${txt || res.statusText}`)
  }
  return (await res.json()) as T
}

export function useIptvApi() {
  const [config, setConfig] = useState<PortalConfig>(DEFAULT_CONFIG)
  const [auth, setAuth] = useState<AuthResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load saved config on mount
  useEffect(() => {
    setConfig(loadConfig())
  }, [])

  const authenticate = useCallback(async (cfg?: PortalConfig) => {
    const c = cfg ?? config
    setLoading(true)
    setError(null)
    try {
      const data = await api<AuthResponse>(c, {})
      setAuth(data)
      return data
    } catch (e: any) {
      setError(e?.message || 'Authentication failed')
      setAuth(null)
      return null
    } finally {
      setLoading(false)
    }
  }, [config])

  const getLiveCategories = useCallback(
    () => api<Category[]>(config, { action: 'get_live_categories' }),
    [config]
  )
  const getLiveStreams = useCallback(
    (categoryId?: string) =>
      api<LiveStream[]>(config, {
        action: 'get_live_streams',
        ...(categoryId ? { category_id: categoryId } : {}),
      }),
    [config]
  )
  const getVodCategories = useCallback(
    () => api<Category[]>(config, { action: 'get_vod_categories' }),
    [config]
  )
  const getVodStreams = useCallback(
    (categoryId?: string) =>
      api<VodStream[]>(config, {
        action: 'get_vod_streams',
        ...(categoryId ? { category_id: categoryId } : {}),
      }),
    [config]
  )
  const getVodInfo = useCallback(
    (vodId: string) => api<VodInfo>(config, { action: 'get_vod_info', vod_id: vodId }),
    [config]
  )
  const getSeriesCategories = useCallback(
    () => api<Category[]>(config, { action: 'get_series_categories' }),
    [config]
  )
  const getSeries = useCallback(
    (categoryId?: string) =>
      api<Series[]>(config, {
        action: 'get_series',
        ...(categoryId ? { category_id: categoryId } : {}),
      }),
    [config]
  )
  const getSeriesInfo = useCallback(
    (seriesId: string) =>
      api<SeriesInfo>(config, { action: 'get_series_info', series_id: seriesId }),
    [config]
  )
  const getShortEpg = useCallback(
    (streamId: string | number) =>
      api<ShortEpgResponse>(config, {
        action: 'get_short_epg',
        stream_id: String(streamId),
        limit: '10',
      }).then((res) => (res.epg_listings || []).map(decodeEpgProgram)),
    [config]
  )
  const killActiveConnections = useCallback(
    () => api<any>(config, { action: 'kill_active_connections' }),
    [config]
  )

  const updateConfig = useCallback((next: PortalConfig) => {
    setConfig(next)
    saveConfig(next)
  }, [])

  return {
    config,
    setConfig: updateConfig,
    auth,
    loading,
    error,
    authenticate,
    getLiveCategories,
    getLiveStreams,
    getVodCategories,
    getVodStreams,
    getVodInfo,
    getSeriesCategories,
    getSeries,
    getSeriesInfo,
    getShortEpg,
    killActiveConnections,
  }
}
