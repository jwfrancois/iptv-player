'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { Radio, Grid3x3, Settings2, Loader2, Wifi, WifiOff, Server } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { AlertCircle } from 'lucide-react'
import { AuroraBackground } from '@/components/cinematic/aurora-background'
import { CinematicNav, type CinematicTab } from '@/components/cinematic/cinematic-nav'
import { HeroCarousel, type HeroItem } from '@/components/cinematic/hero-carousel'
import { ContentRail, type RailItem } from '@/components/cinematic/content-rail'
import { DetailModal, type DetailData } from '@/components/cinematic/detail-modal'
import { SearchView } from '@/components/cinematic/search-view'
import { HeroSkeleton, RailSkeleton } from '@/components/cinematic/shimmer-skeleton'
import { VideoPlayer } from '@/components/iptv/video-player'
import { PortalSwitcher } from '@/components/iptv/portal-switcher'
import { PortalManagerDialog } from '@/components/iptv/portal-manager-dialog'
import { InstallPrompt } from '@/components/iptv/install-prompt'
import { usePortals, type PortalConfig } from '@/lib/iptv/usePortals'
import { useIptvApi } from '@/lib/iptv/useIptvApi'
import { useMyList } from '@/lib/iptv/useMyList'
import {
  buildLiveStreamUrl, buildProxiedHlsUrl, buildProxiedStreamUrl,
  buildProxiedImageUrl, buildVodStreamUrl, buildSeriesStreamUrl,
  type Category, type LiveStream, type Series, type VodStream,
} from '@/lib/iptv/types'
import { cn } from '@/lib/utils'

export default function IPTVPage() {
  const {
    portals, activePortal, activeId, addPortal, updatePortal,
    removePortal, switchPortal, testPortal,
  } = usePortals()

  const activeConfig: PortalConfig = activePortal
    ? { portal: activePortal.portal, username: activePortal.username, password: activePortal.password }
    : { portal: '', username: '', password: '' }

  const iptv = useIptvApi()
  const {
    config, setConfig, auth, loading, error, authenticate,
    getLiveCategories, getLiveStreams, getVodCategories, getVodStreams,
    getSeriesCategories, getSeries, getVodInfo, getSeriesInfo, killActiveConnections,
  } = iptv

  const [cinematicTab, setCinematicTab] = useState<CinematicTab>('home')
  const [portalManagerOpen, setPortalManagerOpen] = useState(false)

  // Content state
  const [liveCats, setLiveCats] = useState<Category[]>([])
  const [liveStreams, setLiveStreams] = useState<LiveStream[]>([])
  const [vodCats, setVodCats] = useState<Category[]>([])
  const [vodStreams, setVodStreams] = useState<VodStream[]>([])
  const [seriesCats, setSeriesCats] = useState<Category[]>([])
  const [seriesList, setSeriesList] = useState<Series[]>([])
  const [contentLoading, setContentLoading] = useState(true)

  // Player state
  const [playerSrc, setPlayerSrc] = useState('')
  const [playerTitle, setPlayerTitle] = useState('')
  const [playerPoster, setPlayerPoster] = useState<string | undefined>(undefined)
  const [playerContentType, setPlayerContentType] = useState<'hls' | 'mp4' | 'ts' | 'auto'>('auto')
  const [playerVisible, setPlayerVisible] = useState(false)

  // Detail modal state
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailItem, setDetailItem] = useState<RailItem | null>(null)
  const [detailData, setDetailData] = useState<DetailData | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  // My List
  const { myList, myListIds, toggleMyList, history, addToHistory, clearHistory } = useMyList()

  const isAuthed = auth?.user_info?.auth === 1

  // Update config + authenticate when portal changes
  useEffect(() => {
    if (!activePortal) return
    setConfig(activeConfig)
  }, [activeId])

  // Reset state + re-authenticate on portal change
  useEffect(() => {
    if (!activePortal) return
    setContentLoading(true)
    setLiveCats([]); setLiveStreams([])
    setVodCats([]); setVodStreams([])
    setSeriesCats([]); setSeriesList([])
    authenticate(activeConfig).catch(() => {})
  }, [activeId])

  // Load all content when authenticated
  useEffect(() => {
    if (!isAuthed || !contentLoading) return
    let cancelled = false

    const loadAll = async () => {
      try {
        const [liveC, vodC, seriesC] = await Promise.all([
          getLiveCategories().catch(() => []),
          getVodCategories().catch(() => []),
          getSeriesCategories().catch(() => []),
        ])
        if (cancelled) return

        const [liveS, vodS, seriesS] = await Promise.all([
          getLiveStreams().catch(() => []),
          getVodStreams().catch(() => []),
          getSeries().catch(() => []),
        ])
        if (cancelled) return

        setLiveCats(liveC); setLiveStreams(liveS)
        setVodCats(vodC); setVodStreams(vodS)
        setSeriesCats(seriesC); setSeriesList(seriesS)
      } catch {
        // ignore
      } finally {
        if (!cancelled) setContentLoading(false)
      }
    }
    loadAll()
    return () => { cancelled = true }
  }, [isAuthed, contentLoading])

  // Periodic auth refresh for connection count
  useEffect(() => {
    if (!isAuthed) return
    const interval = setInterval(() => {
      authenticate(activeConfig).catch(() => {})
    }, 30000)
    return () => clearInterval(interval)
  }, [isAuthed, activeConfig, authenticate])

  // Convert content to rail items
  const liveRailItems: RailItem[] = useMemo(() =>
    liveStreams.slice(0, 30).map((ch) => ({
      id: ch.stream_id, title: ch.name, poster: ch.stream_icon, kind: 'live' as const,
    })), [liveStreams])

  const vodRailItems: RailItem[] = useMemo(() =>
    vodStreams.slice(0, 30).map((m) => ({
      id: m.stream_id, title: m.name, poster: m.stream_icon, rating: m.rating, kind: 'vod' as const,
    })), [vodStreams])

  const seriesRailItems: RailItem[] = useMemo(() =>
    seriesList.slice(0, 30).map((s) => ({
      id: s.series_id, title: s.name, poster: s.cover, rating: s.rating, kind: 'series' as const,
    })), [seriesList])

  // Group live channels by category for rails
  const liveCategoryRails = useMemo(() => {
    return liveCats.slice(0, 6).map((cat) => ({
      category: cat,
      items: liveStreams
        .filter((ch) => String(ch.category_id) === String(cat.category_id))
        .slice(0, 20)
        .map((ch) => ({
          id: ch.stream_id, title: ch.name, poster: ch.stream_icon, kind: 'live' as const,
        })) as RailItem[],
    })).filter((r) => r.items.length > 0)
  }, [liveCats, liveStreams])

  // Group VOD by category
  const vodCategoryRails = useMemo(() => {
    return vodCats.slice(0, 4).map((cat) => ({
      category: cat,
      items: vodStreams
        .filter((m) => String(m.category_id) === String(cat.category_id))
        .slice(0, 20)
        .map((m) => ({
          id: m.stream_id, title: m.name, poster: m.stream_icon, rating: m.rating, kind: 'vod' as const,
        })) as RailItem[],
    })).filter((r) => r.items.length > 0)
  }, [vodCats, vodStreams])

  // Hero items — featured content (first few series/movies/channels)
  const heroItems: HeroItem[] = useMemo(() => {
    const items: HeroItem[] = []
    // Add featured series
    seriesList.slice(0, 3).forEach((s) => {
      items.push({
        id: s.series_id, title: s.name,
        description: s.plot || 'Tap to explore seasons and episodes.',
        poster: s.cover, backdrop: s.cover,
        rating: s.rating, year: s.releaseDate, kind: 'series',
      })
    })
    // Add featured movies
    vodStreams.slice(0, 2).forEach((m) => {
      items.push({
        id: m.stream_id, title: m.name,
        description: 'Tap to watch now.',
        poster: m.stream_icon, backdrop: m.stream_icon,
        rating: m.rating, kind: 'vod',
      })
    })
    // Add a live channel
    if (liveStreams.length > 0) {
      const ch = liveStreams[0]
      items.push({
        id: ch.stream_id, title: ch.name,
        description: 'Live now. Tap to watch.',
        poster: ch.stream_icon, backdrop: ch.stream_icon,
        kind: 'live',
      })
    }
    return items.slice(0, 5)
  }, [seriesList, vodStreams, liveStreams])

  // Handle item selection — play or open detail modal
  const handleSelectItem = useCallback((item: RailItem) => {
    if (item.kind === 'live') {
      const rawUrl = buildLiveStreamUrl(config.portal, config.username, config.password, item.id, 'm3u8')
      setPlayerSrc(buildProxiedHlsUrl(rawUrl))
      setPlayerTitle(item.title)
      setPlayerPoster(buildProxiedImageUrl(item.poster))
      setPlayerContentType('hls')
      setPlayerVisible(true)
      addToHistory({ id: item.id, title: item.title, poster: item.poster, kind: item.kind })
    } else {
      // Open detail modal for VOD and series
      setDetailItem(item)
      setDetailOpen(true)
      setDetailData(null)
      setDetailLoading(true)

      if (item.kind === 'vod') {
        getVodInfo(String(item.id))
          .then((data) => {
            setDetailData({
              plot: data.info?.plot,
              cast: data.info?.cast,
              director: data.info?.director,
              genre: data.info?.genre,
              releaseDate: data.info?.releasedate,
              duration: data.info?.duration,
              rating: data.info?.rating,
              backdrop: data.info?.movie_image,
            })
          })
          .catch(() => {})
          .finally(() => setDetailLoading(false))
      } else if (item.kind === 'series') {
        getSeriesInfo(String(item.id))
          .then((data) => {
            setDetailData({
              plot: data.info?.plot,
              cast: data.info?.cast,
              director: data.info?.director,
              genre: data.info?.genre,
              releaseDate: data.info?.releaseDate,
              rating: data.info?.rating,
              backdrop: data.info?.cover,
              seasons: data.seasons,
              episodes: data.episodes,
            })
          })
          .catch(() => {})
          .finally(() => setDetailLoading(false))
      }
    }
  }, [config, getVodInfo, getSeriesInfo, addToHistory])

  // Handle hero play
  const handleHeroPlay = useCallback((item: HeroItem) => {
    handleSelectItem({
      id: item.id, title: item.title, poster: item.poster,
      rating: item.rating, year: item.year, kind: item.kind,
    })
  }, [handleSelectItem])

  // Handle hero details
  const handleHeroDetails = useCallback((item: HeroItem) => {
    handleSelectItem({
      id: item.id, title: item.title, poster: item.poster,
      rating: item.rating, year: item.year, kind: item.kind,
    })
  }, [handleSelectItem])

  // Play VOD from detail modal
  const handlePlayVod = useCallback(() => {
    if (!detailItem) return
    const rawUrl = buildVodStreamUrl(config.portal, config.username, config.password, detailItem.id, 'mp4')
    setPlayerSrc(buildProxiedStreamUrl(rawUrl))
    setPlayerTitle(detailItem.title)
    setPlayerPoster(buildProxiedImageUrl(detailItem.poster))
    setPlayerContentType('mp4')
    setPlayerVisible(true)
    setDetailOpen(false)
    addToHistory({ id: detailItem.id, title: detailItem.title, poster: detailItem.poster, kind: detailItem.kind })
  }, [detailItem, config, addToHistory])

  // Play series episode from detail modal
  const handlePlayEpisode = useCallback((episodeId: string, ext: string, title: string) => {
    const rawUrl = buildSeriesStreamUrl(config.portal, config.username, config.password, episodeId, ext)
    setPlayerSrc(buildProxiedStreamUrl(rawUrl))
    setPlayerTitle(title)
    setPlayerContentType(ext === 'mp4' || ext === 'mkv' ? 'mp4' : 'auto')
    setPlayerVisible(true)
    setDetailOpen(false)
    if (detailItem) {
      addToHistory({ id: episodeId, title, poster: detailItem.poster, kind: 'series' })
    }
  }, [config, detailItem, addToHistory])

  // My List rail items
  const myListRailItems: RailItem[] = useMemo(() =>
    myList.map((i) => ({
      id: i.id, title: i.title, poster: i.poster, kind: i.kind,
    })), [myList])

  // History rail items
  const historyRailItems: RailItem[] = useMemo(() =>
    history.map((i) => ({
      id: i.id, title: i.title, poster: i.poster, kind: i.kind,
    })), [history])

  return (
    <div className="relative min-h-[100dvh] flex flex-col bg-background text-foreground overflow-hidden">
      <AuroraBackground />

      <div className="relative z-10 flex flex-col h-[100dvh]">
        {/* Top bar */}
        <header className="border-b border-border/50 bg-background/80 backdrop-blur-xl shrink-0">
          <div className="flex items-center gap-2 px-4 py-2.5">
            <div className="flex items-center gap-2 shrink-0">
              <div className="h-7 w-7 rounded-md bg-gradient-to-br from-primary to-accent flex items-center justify-center">
                <Radio className="h-4 w-4 text-primary-foreground" />
              </div>
              <span className="font-bold text-sm hidden sm:inline">IPTV</span>
            </div>

            <PortalSwitcher
              portals={portals}
              activePortal={activePortal}
              onSwitch={switchPortal}
              onManage={() => setPortalManagerOpen(true)}
            />

            <div className="ml-1 flex items-center gap-1.5 text-xs">
              {loading ? (
                <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
              ) : isAuthed ? (
                <span className="flex items-center gap-1 text-green-500">
                  <Wifi className="h-3.5 w-3.5" />
                  {auth?.user_info?.active_cons && (
                    <button
                      className={cn(
                        'px-1.5 py-0.5 rounded text-[10px] font-mono',
                        Number(auth.user_info.active_cons) >= Number(auth.user_info.max_connections)
                          ? 'bg-red-500/20 text-red-400 animate-pulse'
                          : 'bg-muted text-muted-foreground'
                      )}
                      onClick={() => {
                        if (confirm('Kill all active connections?')) {
                          killActiveConnections().then(() => authenticate(activeConfig))
                        }
                      }}
                      title="Click to kill zombie connections"
                    >
                      {auth.user_info.active_cons}/{auth.user_info.max_connections}
                    </button>
                  )}
                </span>
              ) : (
                <span className="flex items-center gap-1 text-red-500">
                  <WifiOff className="h-3.5 w-3.5" />
                </span>
              )}
            </div>

            <div className="ml-auto flex items-center gap-1.5">
              <Button variant="ghost" size="sm" onClick={() => setPortalManagerOpen(true)} className="h-8 px-2">
                <Settings2 className="h-3.5 w-3.5" />
                <span className="hidden sm:inline ml-1">Portals</span>
              </Button>
            </div>
          </div>

          {/* Navigation tabs */}
          {isAuthed && (
            <div className="px-4 pb-2">
              <CinematicNav activeTab={cinematicTab} onTabChange={setCinematicTab} />
            </div>
          )}
        </header>

        {/* Error banner */}
        {error && !isAuthed && (
          <div className="px-4 py-2 shrink-0">
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Connection failed</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          </div>
        )}

        {/* Main content area */}
        <main className="flex-1 overflow-y-auto scrollbar-thin p-4 md:p-6 space-y-6">
          {contentLoading ? (
            <div className="space-y-6">
              <HeroSkeleton />
              <RailSkeleton />
              <RailSkeleton />
            </div>
          ) : !isAuthed ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <Radio className="h-12 w-12 text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">
                {loading ? 'Connecting to portal...' : 'Configure your portal to start watching.'}
              </p>
            </div>
          ) : cinematicTab === 'home' ? (
            <>
              {/* Hero carousel */}
              {heroItems.length > 0 && (
                <HeroCarousel items={heroItems} onPlay={handleHeroPlay} onDetails={handleHeroDetails} />
              )}

              {/* My List rail (if any) */}
              {myListRailItems.length > 0 && (
                <ContentRail title="My List" items={myListRailItems} onSelect={handleSelectItem}
                  onToggleMyList={(item) => toggleMyList({ id: item.id, title: item.title, poster: item.poster, kind: item.kind })}
                  myListIds={myListIds} />
              )}

              {/* Continue watching (history) */}
              {historyRailItems.length > 0 && (
                <ContentRail title="Continue Watching" items={historyRailItems} onSelect={handleSelectItem}
                  onToggleMyList={(item) => toggleMyList({ id: item.id, title: item.title, poster: item.poster, kind: item.kind })}
                  myListIds={myListIds} />
              )}

              {/* Live channel rails by category */}
              {liveCategoryRails.map((rail) => (
                <ContentRail key={`live-${rail.category.category_id}`} title={rail.category.category_name}
                  items={rail.items} onSelect={handleSelectItem}
                  onToggleMyList={(item) => toggleMyList({ id: item.id, title: item.title, poster: item.poster, kind: item.kind })}
                  myListIds={myListIds} />
              ))}

              {/* Movie rails by category */}
              {vodCategoryRails.map((rail) => (
                <ContentRail key={`vod-${rail.category.category_id}`} title={rail.category.category_name}
                  items={rail.items} onSelect={handleSelectItem}
                  onToggleMyList={(item) => toggleMyList({ id: item.id, title: item.title, poster: item.poster, kind: item.kind })}
                  myListIds={myListIds} />
              ))}

              {/* All series */}
              {seriesRailItems.length > 0 && (
                <ContentRail title="Popular Series" items={seriesRailItems} onSelect={handleSelectItem}
                  onToggleMyList={(item) => toggleMyList({ id: item.id, title: item.title, poster: item.poster, kind: item.kind })}
                  myListIds={myListIds} />
              )}
            </>
          ) : cinematicTab === 'live' ? (
            <>
              <ContentRail title="All Channels" items={liveRailItems} onSelect={handleSelectItem}
                onToggleMyList={(item) => toggleMyList({ id: item.id, title: item.title, poster: item.poster, kind: item.kind })}
                myListIds={myListIds} />
              {liveCategoryRails.map((rail) => (
                <ContentRail key={`live-${rail.category.category_id}`} title={rail.category.category_name}
                  items={rail.items} onSelect={handleSelectItem}
                  onToggleMyList={(item) => toggleMyList({ id: item.id, title: item.title, poster: item.poster, kind: item.kind })}
                  myListIds={myListIds} />
              ))}
            </>
          ) : cinematicTab === 'movies' ? (
            <>
              <ContentRail title="All Movies" items={vodRailItems} onSelect={handleSelectItem}
                onToggleMyList={(item) => toggleMyList({ id: item.id, title: item.title, poster: item.poster, kind: item.kind })}
                myListIds={myListIds} />
              {vodCategoryRails.map((rail) => (
                <ContentRail key={`vod-${rail.category.category_id}`} title={rail.category.category_name}
                  items={rail.items} onSelect={handleSelectItem}
                  onToggleMyList={(item) => toggleMyList({ id: item.id, title: item.title, poster: item.poster, kind: item.kind })}
                  myListIds={myListIds} />
              ))}
            </>
          ) : cinematicTab === 'series' ? (
            <ContentRail title="All Series" items={seriesRailItems} onSelect={handleSelectItem}
              onToggleMyList={(item) => toggleMyList({ id: item.id, title: item.title, poster: item.poster, kind: item.kind })}
              myListIds={myListIds} />
          ) : cinematicTab === 'search' ? (
            <SearchView
              liveChannels={liveStreams}
              vodItems={vodStreams}
              seriesItems={seriesList}
              onSelect={handleSelectItem}
              onToggleMyList={(item) => toggleMyList({ id: item.id, title: item.title, poster: item.poster, kind: item.kind })}
              myListIds={myListIds}
            />
          ) : cinematicTab === 'mylist' ? (
            <div className="space-y-6">
              {myListRailItems.length > 0 ? (
                <ContentRail title="My List" items={myListRailItems} onSelect={handleSelectItem}
                  onToggleMyList={(item) => toggleMyList({ id: item.id, title: item.title, poster: item.poster, kind: item.kind })}
                  myListIds={myListIds} />
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <p className="text-sm">Your list is empty. Tap the + on any title to add it.</p>
                </div>
              )}
              {historyRailItems.length > 0 && (
                <>
                  <ContentRail title="Continue Watching" items={historyRailItems} onSelect={handleSelectItem} />
                  <div className="text-center">
                    <Button variant="ghost" size="sm" onClick={clearHistory} className="text-xs text-muted-foreground">
                      Clear watch history
                    </Button>
                  </div>
                </>
              )}
            </div>
          ) : null}
        </main>
      </div>

      {/* Floating video player */}
      {playerVisible && playerSrc && (
        <div className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center" onClick={() => setPlayerVisible(false)}>
          <div className="w-full max-w-5xl" onClick={(e) => e.stopPropagation()}>
            <VideoPlayer
              src={playerSrc}
              title={playerTitle}
              poster={playerPoster}
              contentType={playerContentType}
            />
            <div className="flex items-center justify-between mt-3 px-2">
              <p className="text-sm text-white/80 truncate">{playerTitle}</p>
              <Button variant="ghost" size="sm" onClick={() => setPlayerVisible(false)} className="text-white/60">
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Detail modal */}
      <DetailModal
        open={detailOpen}
        onOpenChange={setDetailOpen}
        item={detailItem}
        detailData={detailData}
        loading={detailLoading}
        onPlay={handlePlayVod}
        onPlayEpisode={handlePlayEpisode}
        inMyList={detailItem ? myListIds.has(String(detailItem.id)) : false}
        onToggleMyList={() => {
          if (detailItem) toggleMyList({ id: detailItem.id, title: detailItem.title, poster: detailItem.poster, kind: detailItem.kind })
        }}
      />

      {/* Portal manager */}
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

      <InstallPrompt />
    </div>
  )
}
