'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Tv,
  Film,
  MonitorPlay,
  Settings2,
  Loader2,
  Wifi,
  WifiOff,
  RefreshCw,
  AlertCircle,
  Radio,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  ChannelSidebar,
  type ContentKind,
  type SidebarSelection,
} from '@/components/iptv/channel-sidebar'
import { VideoPlayer } from '@/components/iptv/video-player'
import { SeriesDialog } from '@/components/iptv/series-dialog'
import { VodDialog } from '@/components/iptv/vod-dialog'
import { SettingsDialog } from '@/components/iptv/settings-dialog'
import { EpgPanel } from '@/components/iptv/epg-panel'
import { RecentStrip } from '@/components/iptv/recent-strip'
import { HeroBanner } from '@/components/iptv/hero-banner'
import {
  DEFAULT_CONFIG,
  useIptvApi,
  type PortalConfig,
} from '@/lib/iptv/useIptvApi'
import { useRecentChannels } from '@/lib/iptv/useRecentChannels'
import {
  buildLiveStreamUrl,
  buildProxiedHlsUrl,
  buildProxiedImageUrl,
  buildProxiedStreamUrl,
  buildSeriesStreamUrl,
  buildVodStreamUrl,
  type Category,
  type LiveStream,
  type Series,
  type VodStream,
} from '@/lib/iptv/types'

const FAV_STORAGE_KEY = 'iptv-favorites'

function loadFavorites(): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = localStorage.getItem(FAV_STORAGE_KEY)
    if (!raw) return new Set()
    return new Set(JSON.parse(raw))
  } catch {
    return new Set()
  }
}

function saveFavorites(set: Set<string>) {
  if (typeof window === 'undefined') return
  localStorage.setItem(FAV_STORAGE_KEY, JSON.stringify(Array.from(set)))
}

export default function IPTVPage() {
  const iptv = useIptvApi()
  const {
    config,
    setConfig,
    auth,
    loading,
    error,
    authenticate,
    getLiveCategories,
    getLiveStreams,
    getVodCategories,
    getVodStreams,
    getSeriesCategories,
    getSeries,
  } = iptv

  const [activeTab, setActiveTab] = useState<ContentKind>('live')
  const [settingsOpen, setSettingsOpen] = useState(false)

  // Sidebar state per kind
  const [liveCats, setLiveCats] = useState<Category[]>([])
  const [liveStreams, setLiveStreams] = useState<LiveStream[]>([])
  const [vodCats, setVodCats] = useState<Category[]>([])
  const [vodStreams, setVodStreams] = useState<VodStream[]>([])
  const [seriesCats, setSeriesCats] = useState<Category[]>([])
  const [seriesList, setSeriesList] = useState<Series[]>([])

  const [selectedCat, setSelectedCat] = useState<Record<ContentKind, string | null>>({
    live: null,
    vod: null,
    series: null,
  })
  const [loadingItems, setLoadingItems] = useState(false)
  const [itemsError, setItemsError] = useState<string | null>(null)

  // Currently playing item
  const [currentSelection, setCurrentSelection] = useState<SidebarSelection | null>(null)
  const [playerSrc, setPlayerSrc] = useState<string>('')
  const [playerTitle, setPlayerTitle] = useState<string>('')
  const [playerPoster, setPlayerPoster] = useState<string | undefined>(undefined)
  const [playerContentType, setPlayerContentType] = useState<'hls' | 'mp4' | 'ts' | 'auto'>('auto')

  // Recently watched channels
  const { recent, addRecent, clearRecent } = useRecentChannels()

  // EPG fetcher bound to current config
  const getShortEpg = iptv.getShortEpg

  // Dialog state for VOD and Series info
  const [vodDialog, setVodDialog] = useState<{ open: boolean; id: string | null; name: string; poster?: string; ext?: string }>({
    open: false,
    id: null,
    name: '',
  })
  const [seriesDialog, setSeriesDialog] = useState<{ open: boolean; id: string | null; name: string }>({
    open: false,
    id: null,
    name: '',
  })

  // Favorites
  const [favorites, setFavorites] = useState<Set<string>>(new Set())
  const [showFavOnly, setShowFavOnly] = useState<Record<ContentKind, boolean>>({
    live: false,
    vod: false,
    series: false,
  })

  // Initial load: favorites + authenticate
  useEffect(() => {
    setFavorites(loadFavorites())
    // Auto-authenticate on first load
    authenticate().catch(() => {})
  }, [authenticate])

  // When auth completes successfully, load categories for current tab
  useEffect(() => {
    if (!auth?.user_info || auth.user_info.auth !== 1) return
    if (activeTab === 'live' && liveCats.length === 0) {
      getLiveCategories()
        .then(setLiveCats)
        .catch((e) => setItemsError(e?.message || 'Failed to load live categories'))
    } else if (activeTab === 'vod' && vodCats.length === 0) {
      getVodCategories()
        .then(setVodCats)
        .catch((e) => setItemsError(e?.message || 'Failed to load VOD categories'))
    } else if (activeTab === 'series' && seriesCats.length === 0) {
      getSeriesCategories()
        .then(setSeriesCats)
        .catch((e) => setItemsError(e?.message || 'Failed to load series categories'))
    }
  }, [auth, activeTab])

  // Load items when category or tab changes (only if authenticated)
  useEffect(() => {
    if (!auth?.user_info || auth.user_info.auth !== 1) return
    let cancelled = false
    setLoadingItems(true)
    setItemsError(null)
    const cat = selectedCat[activeTab]
    const p = (async () => {
      try {
        if (activeTab === 'live') {
          const items = await getLiveStreams(cat || undefined)
          if (!cancelled) setLiveStreams(items)
        } else if (activeTab === 'vod') {
          const items = await getVodStreams(cat || undefined)
          if (!cancelled) setVodStreams(items)
        } else {
          const items = await getSeries(cat || undefined)
          if (!cancelled) setSeriesList(items)
        }
      } catch (e: any) {
        if (!cancelled) setItemsError(e?.message || 'Failed to load items')
      } finally {
        if (!cancelled) setLoadingItems(false)
      }
    })()
    return () => {
      cancelled = true
    }
     
  }, [auth, activeTab, selectedCat])

  const handleSelectItem = useCallback(
    (sel: SidebarSelection) => {
      setCurrentSelection(sel)
      if (sel.kind === 'live') {
        // Live: prefer m3u8 (HLS), fall back to ts
        const rawUrl = buildLiveStreamUrl(config.portal, config.username, config.password, sel.id, 'm3u8')
        setPlayerSrc(buildProxiedHlsUrl(rawUrl))
        setPlayerTitle(sel.name)
        setPlayerPoster(buildProxiedImageUrl(sel.poster))
        setPlayerContentType('hls')
        // Add to recently watched
        addRecent({
          id: sel.id,
          name: sel.name,
          poster: sel.poster,
        })
      } else if (sel.kind === 'vod') {
        // Open VOD info dialog
        setVodDialog({ open: true, id: String(sel.id), name: sel.name, poster: sel.poster, ext: sel.ext })
      } else if (sel.kind === 'series') {
        // Open Series episode picker dialog
        setSeriesDialog({ open: true, id: String(sel.id), name: sel.name })
      }
    },
    [config, addRecent]
  )

  const handlePlayVod = useCallback(
    (title: string) => {
      if (!vodDialog.id) return
      const ext = vodDialog.ext || 'mp4'
      const rawUrl = buildVodStreamUrl(config.portal, config.username, config.password, vodDialog.id, ext)
      setPlayerSrc(buildProxiedStreamUrl(rawUrl))
      setPlayerTitle(title)
      setPlayerPoster(buildProxiedImageUrl(vodDialog.poster))
      setPlayerContentType(ext === 'mp4' || ext === 'mkv' ? 'mp4' : 'auto')
      setCurrentSelection({ kind: 'vod', id: vodDialog.id, name: title, poster: buildProxiedImageUrl(vodDialog.poster), ext })
    },
    [vodDialog, config]
  )

  const handlePlayEpisode = useCallback(
    (episodeId: string, ext: string, title: string) => {
      const rawUrl = buildSeriesStreamUrl(config.portal, config.username, config.password, episodeId, ext)
      setPlayerSrc(buildProxiedStreamUrl(rawUrl))
      setPlayerTitle(title)
      setPlayerContentType(ext === 'mp4' || ext === 'mkv' ? 'mp4' : 'auto')
      setCurrentSelection({ kind: 'series', id: episodeId, name: title })
    },
    [config]
  )

  const toggleFavorite = useCallback((key: string) => {
    setFavorites((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      saveFavorites(next)
      return next
    })
  }, [])

  const handleTestConnection = useCallback(
    async (cfg: PortalConfig): Promise<boolean> => {
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
    },
    []
  )

  const handleSaveConfig = useCallback(
    (cfg: PortalConfig) => {
      setConfig(cfg)
      // Reset state
      setLiveCats([]); setLiveStreams([])
      setVodCats([]); setVodStreams([])
      setSeriesCats([]); setSeriesList([])
      setSelectedCat({ live: null, vod: null, series: null })
      setTimeout(() => authenticate(cfg), 100)
    },
    [setConfig, authenticate]
  )

  // Sidebar items for the current tab
  const currentItems: any[] = useMemo(() => {
    if (activeTab === 'live') return liveStreams
    if (activeTab === 'vod') return vodStreams
    return seriesList
  }, [activeTab, liveStreams, vodStreams, seriesList])

  const currentCats: Category[] = useMemo(() => {
    if (activeTab === 'live') return liveCats
    if (activeTab === 'vod') return vodCats
    return seriesCats
  }, [activeTab, liveCats, vodCats, seriesCats])

  const isAuthed = auth?.user_info?.auth === 1
  const trial = auth?.user_info?.is_trial === '1'
  const expDate = auth?.user_info?.exp_date
    ? new Date(Number(auth.user_info.exp_date) * 1000).toLocaleDateString()
    : null

  return (
    <div className="h-screen flex flex-col bg-background text-foreground overflow-hidden">
      {/* Top bar */}
      <header className="border-b bg-card/30 backdrop-blur-sm">
        <div className="flex items-center gap-3 px-4 py-2.5">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-md bg-gradient-to-br from-rose-500 to-orange-500 flex items-center justify-center">
              <Radio className="h-4 w-4 text-white" />
            </div>
            <span className="font-semibold text-sm">IPTV Player</span>
          </div>

          <div className="ml-2 flex items-center gap-2 text-xs">
            {loading ? (
              <span className="flex items-center gap-1 text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> Connecting…
              </span>
            ) : isAuthed ? (
              <span className="flex items-center gap-1.5 text-green-600 dark:text-green-400">
                <Wifi className="h-3.5 w-3.5" />
                <span className="font-medium">{config.username}</span>
                {expDate && <span className="text-muted-foreground">· expires {expDate}</span>}
                {auth?.user_info?.active_cons && (
                  <span className="text-muted-foreground">
                    · {auth.user_info.active_cons}/{auth.user_info.max_connections} connections
                  </span>
                )}
                {trial && (
                  <span className="ml-1 px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 text-[10px]">
                    TRIAL
                  </span>
                )}
              </span>
            ) : (
              <span className="flex items-center gap-1 text-red-500">
                <WifiOff className="h-3.5 w-3.5" />
                Not connected
              </span>
            )}
          </div>

          <div className="ml-auto flex items-center gap-1.5">
            {isAuthed && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setLiveCats([]); setLiveStreams([])
                  setVodCats([]); setVodStreams([])
                  setSeriesCats([]); setSeriesList([])
                  authenticate()
                }}
              >
                <RefreshCw className="h-3.5 w-3.5 mr-1" />
                Refresh
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => setSettingsOpen(true)}>
              <Settings2 className="h-3.5 w-3.5 mr-1" />
              Settings
            </Button>
          </div>
        </div>
      </header>

      {/* Auth error banner */}
      {error && !isAuthed && (
        <div className="px-4 py-2">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Connection failed</AlertTitle>
            <AlertDescription>
              {error}.{' '}
              <Button
                variant="link"
                className="h-auto p-0 underline"
                onClick={() => setSettingsOpen(true)}
              >
                Check portal settings
              </Button>
            </AlertDescription>
          </Alert>
        </div>
      )}

      {/* Main */}
      <div className="flex-1 flex min-h-0">
        {/* Sidebar */}
        <aside className="w-[460px] shrink-0 hidden md:flex flex-col">
          <Tabs
            value={activeTab}
            onValueChange={(v) => setActiveTab(v as ContentKind)}
            className="w-full"
          >
            <div className="px-3 pt-3 pb-1">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="live" className="text-xs">
                  <Tv className="h-3.5 w-3.5 mr-1" />
                  Live TV
                </TabsTrigger>
                <TabsTrigger value="vod" className="text-xs">
                  <Film className="h-3.5 w-3.5 mr-1" />
                  Movies
                </TabsTrigger>
                <TabsTrigger value="series" className="text-xs">
                  <MonitorPlay className="h-3.5 w-3.5 mr-1" />
                  Series
                </TabsTrigger>
              </TabsList>
            </div>
          </Tabs>

          {itemsError && (
            <div className="mx-3 my-2 text-xs text-red-500 px-2 py-1.5 bg-red-500/10 rounded">
              {itemsError}
            </div>
          )}

          {/* Recently watched strip (only on Live TV tab) */}
          {isAuthed && activeTab === 'live' && (
            <RecentStrip
              recent={recent}
              currentId={currentSelection?.kind === 'live' ? currentSelection.id : null}
              onSelect={(ch) => {
                handleSelectItem({
                  kind: 'live',
                  id: ch.id,
                  name: ch.name,
                  poster: ch.poster,
                })
              }}
              onClear={clearRecent}
            />
          )}

          <div className="flex-1 min-h-0">
            {isAuthed ? (
              <ChannelSidebar
                kind={activeTab}
                categories={currentCats}
                items={currentItems}
                loadingItems={loadingItems}
                selectedCategoryId={selectedCat[activeTab]}
                onSelectCategory={(id) =>
                  setSelectedCat((prev) => ({ ...prev, [activeTab]: id }))
                }
                selectedItemId={currentSelection?.kind === activeTab ? currentSelection.id : null}
                onSelectItem={handleSelectItem}
                favorites={favorites}
                onToggleFavorite={toggleFavorite}
                showFavoritesOnly={showFavOnly[activeTab]}
                onToggleFavoritesOnly={(v) =>
                  setShowFavOnly((prev) => ({ ...prev, [activeTab]: v }))
                }
              />
            ) : (
              <div className="p-6 text-center text-sm text-muted-foreground">
                {loading
                  ? 'Connecting to portal…'
                  : 'Please configure your portal credentials to start watching.'}
              </div>
            )}
          </div>
        </aside>

        {/* Player area */}
        <main className="flex-1 min-w-0 flex flex-col">
          <div className="bg-black">
            {playerSrc ? (
              <VideoPlayer
                src={playerSrc}
                title={playerTitle}
                poster={playerPoster}
                contentType={playerContentType}
              />
            ) : (
              <div className="aspect-video flex flex-col items-center justify-center text-white/60 gap-3">
                <Radio className="h-12 w-12 opacity-40" />
                <p className="text-sm">
                  {isAuthed
                    ? 'Select a channel, movie, or series to start watching.'
                    : 'Connect to your IPTV portal to begin.'}
                </p>
              </div>
            )}
          </div>

          {/* Hero banner with current channel + EPG (Netflix style) */}
          {currentSelection && currentSelection.kind === 'live' && (
            <HeroBanner
              channelName={currentSelection.name}
              channelPoster={currentSelection.poster}
              categoryName="Live TV"
              streamId={currentSelection.id}
              fetcher={getShortEpg}
            />
          )}

          {/* Below player: EPG panel + account info */}
          <div className="flex-1 overflow-auto bg-background">
            {currentSelection ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-0">
                {/* EPG Panel (live channels only) */}
                {currentSelection.kind === 'live' ? (
                  <div className="border-r">
                    <EpgPanel
                      streamId={currentSelection.id}
                      fetcher={getShortEpg}
                    />
                  </div>
                ) : (
                  <div className="p-4 border-r">
                    <p className="text-sm font-medium truncate mb-1">{currentSelection.name}</p>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">
                      {currentSelection.kind === 'vod' ? 'Movie' : 'Series Episode'}
                    </p>
                  </div>
                )}

                {/* Account status */}
                <div className="p-4">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-2">
                    Account Status
                  </p>
                  {auth && (
                    <div className="grid grid-cols-2 gap-2">
                      <div className="rounded border p-2.5">
                        <p className="text-[10px] uppercase text-muted-foreground">Status</p>
                        <p className="text-sm font-medium">{auth.user_info.status || 'Active'}</p>
                      </div>
                      <div className="rounded border p-2.5">
                        <p className="text-[10px] uppercase text-muted-foreground">Connections</p>
                        <p className="text-sm font-medium">
                          {auth.user_info.active_cons} / {auth.user_info.max_connections}
                        </p>
                      </div>
                      <div className="rounded border p-2.5">
                        <p className="text-[10px] uppercase text-muted-foreground">Expires</p>
                        <p className="text-sm font-medium">
                          {auth.user_info.exp_date
                            ? new Date(Number(auth.user_info.exp_date) * 1000).toLocaleDateString()
                            : '—'}
                        </p>
                      </div>
                      <div className="rounded border p-2.5">
                        <p className="text-[10px] uppercase text-muted-foreground">Trial</p>
                        <p className="text-sm font-medium">
                          {auth.user_info.is_trial === '1' ? 'Yes' : 'No'}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="p-6 text-sm text-muted-foreground">
                <p className="font-medium text-foreground mb-1">Welcome to your IPTV Player</p>
                <p className="text-xs leading-relaxed">
                  Browse Live TV, Movies, and Series from the sidebar. Use the search box to find
                  channels by name. Click the star icon next to any item to save it to your
                  favorites for quick access. Recently watched channels appear at the top of the
                  sidebar — one click to jump back.
                </p>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Mobile sidebar switcher (above player on small screens) */}
      <div className="md:hidden border-t bg-card/30 p-2">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as ContentKind)}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="live" className="text-xs">
              <Tv className="h-3.5 w-3.5 mr-1" /> Live
            </TabsTrigger>
            <TabsTrigger value="vod" className="text-xs">
              <Film className="h-3.5 w-3.5 mr-1" /> Movies
            </TabsTrigger>
            <TabsTrigger value="series" className="text-xs">
              <MonitorPlay className="h-3.5 w-3.5 mr-1" /> Series
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        config={config}
        onSave={handleSaveConfig}
        onTest={handleTestConnection}
      />

      <VodDialog
        open={vodDialog.open}
        onOpenChange={(v) => setVodDialog((p) => ({ ...p, open: v }))}
        vodId={vodDialog.id}
        vodName={vodDialog.name}
        vodPoster={vodDialog.poster}
        ext={vodDialog.ext}
        onPlay={handlePlayVod}
      />

      <SeriesDialog
        open={seriesDialog.open}
        onOpenChange={(v) => setSeriesDialog((p) => ({ ...p, open: v }))}
        seriesId={seriesDialog.id}
        seriesName={seriesDialog.name}
        onPlayEpisode={handlePlayEpisode}
      />
    </div>
  )
}
