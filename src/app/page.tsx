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
  Grid3x3,
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
import { MosaicView, type MosaicTile } from '@/components/iptv/mosaic-view'
import { PortalSwitcher } from '@/components/iptv/portal-switcher'
import { PortalManagerDialog } from '@/components/iptv/portal-manager-dialog'
import { usePortals } from '@/lib/iptv/usePortals'
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

const FAV_STORAGE_PREFIX = 'iptv-favorites-'

function favKey(portalId: string) {
  return `${FAV_STORAGE_PREFIX}${portalId}`
}

function loadFavorites(portalId: string): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = localStorage.getItem(favKey(portalId))
    if (!raw) return new Set()
    return new Set(JSON.parse(raw))
  } catch {
    return new Set()
  }
}

function saveFavorites(portalId: string, set: Set<string>) {
  if (typeof window === 'undefined') return
  localStorage.setItem(favKey(portalId), JSON.stringify(Array.from(set)))
}

export default function IPTVPage() {
  // Multi-portal store — manages list of portals + active selection
  const {
    portals,
    activePortal,
    activeId,
    addPortal,
    updatePortal,
    removePortal,
    switchPortal,
    testPortal,
  } = usePortals()

  // Build the PortalConfig that useIptvApi expects, from the active portal
  const activeConfig: PortalConfig = activePortal
    ? {
        portal: activePortal.portal,
        username: activePortal.username,
        password: activePortal.password,
      }
    : DEFAULT_CONFIG

  const iptv = useIptvApi()
  // When the active portal changes, update the iptv config + re-authenticate
  useEffect(() => {
    if (!activePortal) return
    setConfig(activeConfig)
  }, [activeId])  

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
  const [portalManagerOpen, setPortalManagerOpen] = useState(false)

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

  // Recently watched channels — per-portal
  const { recent, addRecent, clearRecent } = useRecentChannels(activeId)

  // EPG fetcher bound to current config
  const getShortEpg = iptv.getShortEpg

  // Multi-View mosaic state
  const [mosaicOpen, setMosaicOpen] = useState(false)
  const [mosaicTiles, setMosaicTiles] = useState<MosaicTile[]>([])
  const MOSAIC_MAX = 9

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

  // Favorites — per-portal (namespaced by portal ID)
  const [favorites, setFavorites] = useState<Set<string>>(new Set())
  const [showFavOnly, setShowFavOnly] = useState<Record<ContentKind, boolean>>({
    live: false,
    vod: false,
    series: false,
  })

  // Load favorites when portal changes + authenticate on portal switch
  useEffect(() => {
    if (!activePortal) return
    // Reset all state for the new portal
    setFavorites(loadFavorites(activePortal.id))
    setLiveCats([]); setLiveStreams([])
    setVodCats([]); setVodStreams([])
    setSeriesCats([]); setSeriesList([])
    setSelectedCat({ live: null, vod: null, series: null })
    setCurrentSelection(null)
    setPlayerSrc('')
    setPlayerTitle('')
    setPlayerPoster(undefined)
    setMosaicTiles([])
    // Authenticate with the new portal
    authenticate(activeConfig).catch(() => {})
  }, [activeId])  

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
        // Live: pass the DIRECT portal URL to hls.js.
        // The browser connects directly to the portal (not through our proxy),
        // which avoids datacenter IP blocks (portal blocks our server IP but
        // allows residential IPs). The portal sends CORS headers (*) so the
        // browser can load both manifest and segments directly.
        const rawUrl = buildLiveStreamUrl(config.portal, config.username, config.password, sel.id, 'm3u8')
        setPlayerSrc(rawUrl)
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

  // Multi-View mosaic handlers
  const addToMosaic = useCallback(
    (sel: SidebarSelection) => {
      if (sel.kind !== 'live') return
      const rawUrl = buildLiveStreamUrl(config.portal, config.username, config.password, sel.id, 'm3u8')
      const tile: MosaicTile = {
        id: sel.id,
        name: sel.name,
        poster: sel.poster,
        streamUrl: rawUrl, // Direct portal URL — browser connects directly
        contentType: 'hls',
      }
      setMosaicTiles((prev) => {
        if (prev.some((t) => String(t.id) === String(tile.id))) return prev
        if (prev.length >= MOSAIC_MAX) {
          // Replace oldest
          return [...prev.slice(1), tile]
        }
        return [...prev, tile]
      })
      setMosaicOpen(true)
    },
    [config]
  )

  const removeFromMosaic = useCallback((id: string | number) => {
    setMosaicTiles((prev) => prev.filter((t) => String(t.id) !== String(id)))
  }, [])

  const promoteFromMosaic = useCallback((tile: MosaicTile) => {
    // Send mosaic tile to main player
    handleSelectItem({
      kind: 'live',
      id: tile.id,
      name: tile.name,
      poster: tile.poster,
    })
  }, [handleSelectItem])

  const handlePlayVod = useCallback(
    (title: string) => {
      if (!vodDialog.id) return
      const ext = vodDialog.ext || 'mp4'
      const rawUrl = buildVodStreamUrl(config.portal, config.username, config.password, vodDialog.id, ext)
      // Direct portal URL — browser connects directly (avoids datacenter IP block)
      setPlayerSrc(rawUrl)
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
      // Direct portal URL — browser connects directly (avoids datacenter IP block)
      setPlayerSrc(rawUrl)
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
      if (activePortal) saveFavorites(activePortal.id, next)
      return next
    })
  }, [activePortal])

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

  // Detect if the currently-playing live channel is a music channel.
  // We look up the channel's category_id in liveCats and check if the category
  // name contains "music" (case-insensitive).
  const isMusicChannel = useMemo(() => {
    if (!currentSelection || currentSelection.kind !== 'live') return false
    const channel = liveStreams.find((s) => String(s.stream_id) === String(currentSelection.id))
    if (!channel) return false
    const cat = liveCats.find((c) => c.category_id === String(channel.category_id))
    if (!cat) return false
    return /music/i.test(cat.category_name)
  }, [currentSelection, liveStreams, liveCats])

  // Set of channel IDs currently in the mosaic (for sidebar indicator)
  const mosaicIds = useMemo(() => new Set(mosaicTiles.map((t) => String(t.id))), [mosaicTiles])

  const isAuthed = auth?.user_info?.auth === 1
  const trial = auth?.user_info?.is_trial === '1'
  const expDate = auth?.user_info?.exp_date
    ? new Date(Number(auth.user_info.exp_date) * 1000).toLocaleDateString()
    : null

  return (
    <div className="h-[100dvh] flex flex-col bg-background text-foreground overflow-hidden">
      {/* Top bar */}
      <header className="border-b bg-card/30 backdrop-blur-sm shrink-0">
        <div className="flex items-center gap-2 px-3 py-2">
          <div className="flex items-center gap-2 shrink-0">
            <div className="h-7 w-7 rounded-md bg-gradient-to-br from-rose-500 to-orange-500 flex items-center justify-center">
              <Radio className="h-4 w-4 text-white" />
            </div>
            <span className="font-semibold text-sm hidden sm:inline">IPTV Player</span>
          </div>

          {/* Portal switcher */}
          <PortalSwitcher
            portals={portals}
            activePortal={activePortal}
            onSwitch={switchPortal}
            onManage={() => setPortalManagerOpen(true)}
          />

          <div className="ml-1 flex items-center gap-2 text-xs min-w-0">
            {loading ? (
              <span className="flex items-center gap-1 text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> <span className="hidden sm:inline">Connecting…</span>
              </span>
            ) : isAuthed ? (
              <span className="flex items-center gap-1.5 text-green-600 dark:text-green-400 min-w-0">
                <Wifi className="h-3.5 w-3.5 shrink-0" />
                <span className="font-medium hidden sm:inline">{config.username}</span>
                {auth?.user_info?.active_cons && (
                  <span className="text-muted-foreground text-[10px]">
                    {auth.user_info.active_cons}/{auth.user_info.max_connections}
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
                <span className="hidden sm:inline">Not connected</span>
              </span>
            )}
          </div>

          <div className="ml-auto flex items-center gap-1.5 shrink-0">
            {isAuthed && (
              <Button
                variant={mosaicOpen ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setMosaicOpen((v) => !v)}
                title="Open Multi-View mosaic"
                className="h-8 px-2"
              >
                <Grid3x3 className="h-3.5 w-3.5 sm:mr-1" />
                <span className="hidden sm:inline">Multi-View</span>
                {mosaicTiles.length > 0 && (
                  <span className="ml-1 px-1 rounded bg-primary-foreground/20 text-[10px]">
                    {mosaicTiles.length}
                  </span>
                )}
              </Button>
            )}
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
                className="h-8 px-2"
              >
                <RefreshCw className="h-3.5 w-3.5 mr-1" />
                Refresh
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => setPortalManagerOpen(true)} className="h-8 px-2">
              <Settings2 className="h-3.5 w-3.5 sm:mr-1" />
              <span className="hidden sm:inline">Portals</span>
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

      {/* Main — mobile: player on top, channels below; desktop: sidebar left, player right */}
      <div className="flex-1 flex flex-col md:flex-row min-h-0">
        {/* Player area — top on mobile (shrink-0), right on desktop (flex-1) */}
        <main className="min-w-0 flex flex-col min-h-0 order-1 md:order-2 shrink-0 md:flex-1">
          <div className="bg-black shrink-0">
            {playerSrc ? (
              <VideoPlayer
                src={playerSrc}
                title={playerTitle}
                poster={playerPoster}
                contentType={playerContentType}
                showVisualizer={isMusicChannel}
              />
            ) : (
              <div className="aspect-video flex flex-col items-center justify-center text-white/60 gap-3 px-4">
                <Radio className="h-10 w-10 opacity-40" />
                <p className="text-sm text-center">
                  {isAuthed
                    ? 'Select a channel below to start watching.'
                    : 'Connect to your IPTV portal to begin.'}
                </p>
              </div>
            )}
          </div>

          {/* Hero banner + info — hidden on mobile (compact), shown on desktop */}
          <div className="hidden md:block flex-1 overflow-auto bg-background">
            {currentSelection && currentSelection.kind === 'live' && (
              <HeroBanner
                channelName={currentSelection.name}
                channelPoster={currentSelection.poster}
                categoryName="Live TV"
                streamId={currentSelection.id}
                fetcher={getShortEpg}
              />
            )}

            {currentSelection ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-0">
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

        {/* Sidebar — bottom on mobile (order-2), left on desktop (order-1) */}
        <aside className="shrink-0 flex flex-col border-r min-h-0 order-2 md:order-1 w-full md:w-[460px] flex-1 md:flex-none overflow-hidden">
          <Tabs
            value={activeTab}
            onValueChange={(v) => setActiveTab(v as ContentKind)}
            className="w-full shrink-0"
          >
            <div className="px-3 pt-2 pb-1">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="live" className="text-xs">
                  <Tv className="h-3.5 w-3.5 mr-1" />
                  <span className="hidden sm:inline">Live TV</span>
                  <span className="sm:hidden">Live</span>
                </TabsTrigger>
                <TabsTrigger value="vod" className="text-xs">
                  <Film className="h-3.5 w-3.5 mr-1" />
                  <span className="hidden sm:inline">Movies</span>
                  <span className="sm:hidden">Movies</span>
                </TabsTrigger>
                <TabsTrigger value="series" className="text-xs">
                  <MonitorPlay className="h-3.5 w-3.5 mr-1" />
                  <span className="hidden sm:inline">Series</span>
                  <span className="sm:hidden">Series</span>
                </TabsTrigger>
              </TabsList>
            </div>
          </Tabs>

          {itemsError && (
            <div className="mx-3 my-2 text-xs text-red-500 px-2 py-1.5 bg-red-500/10 rounded shrink-0">
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
                onAddToMosaic={addToMosaic}
                mosaicIds={mosaicIds}
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

      <MosaicView
        open={mosaicOpen}
        onClose={() => setMosaicOpen(false)}
        tiles={mosaicTiles}
        onRemoveTile={removeFromMosaic}
        onPromoteTile={promoteFromMosaic}
        onClearAll={() => setMosaicTiles([])}
      />

      <PortalManagerDialog
        open={portalManagerOpen}
        onOpenChange={setPortalManagerOpen}
        portals={portals}
        activeId={activeId}
        onSwitch={switchPortal}
        onAdd={addPortal}
        onUpdate={updatePortal}
        onRemove={removePortal}
        onTest={testPortal}
      />
    </div>
  )
}
