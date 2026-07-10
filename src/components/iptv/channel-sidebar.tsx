'use client'

import { useEffect, useMemo, useState } from 'react'
import { Search, Star, Tv, Film, MonitorPlay, ChevronRight, Loader2, Grid3x3 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { buildProxiedImageUrl } from '@/lib/iptv/types'
import type { Category, LiveStream, Series, VodStream } from '@/lib/iptv/types'

export type ContentKind = 'live' | 'vod' | 'series'

export interface SidebarSelection {
  kind: ContentKind
  // For live: streamId, for vod: vodId, for series: seriesId
  id: string | number
  name: string
  poster?: string
  ext?: string
}

interface SidebarProps {
  kind: ContentKind
  categories: Category[]
  items: LiveStream[] | VodStream[] | Series[]
  loadingItems: boolean
  selectedCategoryId: string | null
  onSelectCategory: (id: string | null) => void
  selectedItemId: string | number | null
  onSelectItem: (sel: SidebarSelection) => void
  favorites: Set<string>
  onToggleFavorite: (key: string) => void
  showFavoritesOnly: boolean
  onToggleFavoritesOnly: (v: boolean) => void
  /** Optional: add to Multi-View mosaic (live channels only). */
  onAddToMosaic?: (sel: SidebarSelection) => void
  /** IDs already in the mosaic (to show indicator). */
  mosaicIds?: Set<string>
}

const FAV_KEY_PREFIX: Record<ContentKind, string> = {
  live: 'live',
  vod: 'vod',
  series: 'series',
}

export function ChannelSidebar({
  kind,
  categories,
  items,
  loadingItems,
  selectedCategoryId,
  onSelectCategory,
  selectedItemId,
  onSelectItem,
  favorites,
  onToggleFavorite,
  showFavoritesOnly,
  onToggleFavoritesOnly,
  onAddToMosaic,
  mosaicIds,
}: SidebarProps) {
  const [search, setSearch] = useState('')
  const [openCats, setOpenCats] = useState(true)
  const [renderLimit, setRenderLimit] = useState(200)

  // Filtered items based on search
  const filtered = useMemo(() => {
    if (!search.trim()) return items
    const q = search.toLowerCase()
    return items.filter((it: any) => (it.name || '').toLowerCase().includes(q))
  }, [items, search])

  // Reset render limit when search or category changes
  useEffect(() => {
    setRenderLimit(200)
  }, [search, selectedCategoryId])

  const favKey = (it: any) => `${FAV_KEY_PREFIX[kind]}:${it.stream_id ?? it.series_id}`

  const visibleItems = useMemo(() => {
    if (!showFavoritesOnly) return filtered
    return filtered.filter((it: any) => favorites.has(favKey(it)))
  }, [filtered, showFavoritesOnly, favorites])

  // Apply render limit to avoid rendering 5000+ DOM elements at once
  const renderedItems = visibleItems.slice(0, renderLimit)
  const hasMore = visibleItems.length > renderLimit

  const kindIcon = kind === 'live' ? Tv : kind === 'vod' ? Film : MonitorPlay
  const KindIcon = kindIcon

  return (
    <div className="flex h-full flex-col bg-card/50 border-r">
      {/* Search */}
      <div className="p-3 border-b space-y-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={`Search ${kind}…`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
        <Button
          variant={showFavoritesOnly ? 'default' : 'outline'}
          size="sm"
          className="w-full"
          onClick={() => onToggleFavoritesOnly(!showFavoritesOnly)}
        >
          <Star className={cn('h-4 w-4 mr-1.5', showFavoritesOnly && 'fill-current')} />
          {showFavoritesOnly ? 'Showing Favorites' : 'Show Favorites'}
        </Button>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Category column */}
        <div className="w-32 sm:w-44 shrink-0 border-r overflow-hidden">
          <button
            className="w-full px-2 sm:px-3 py-2.5 text-left text-xs font-semibold uppercase text-muted-foreground hover:bg-accent min-h-[44px]"
            onClick={() => onSelectCategory(null)}
          >
            All {kind === 'live' ? 'Channels' : kind === 'vod' ? 'Movies' : 'Series'}
          </button>
          <ScrollArea className="h-[calc(100dvh-280px)] sm:h-[calc(100dvh-220px)]">
            <div className="py-1">
              {categories.map((c) => (
                <button
                  key={c.category_id}
                  onClick={() => onSelectCategory(c.category_id)}
                  className={cn(
                    'w-full px-2 sm:px-3 py-2.5 sm:py-1.5 text-left text-xs truncate hover:bg-accent transition-colors min-h-[44px] sm:min-h-0',
                    selectedCategoryId === c.category_id && 'bg-accent font-medium'
                  )}
                  title={c.category_name}
                >
                  {c.category_name}
                </button>
              ))}
            </div>
          </ScrollArea>
        </div>

        {/* Items column */}
        <div className="flex-1 min-w-0 overflow-hidden">
          <div className="h-[calc(100dvh-280px)] sm:h-[calc(100dvh-220px)] overflow-y-auto overflow-x-hidden scrollbar-thin">
            {loadingItems ? (
              <div className="flex items-center justify-center p-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : visibleItems.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                {showFavoritesOnly
                  ? 'No favorites yet. Tap the star icon to add one.'
                  : search
                  ? `No results for "${search}"`
                  : 'No items in this category.'}
              </div>
            ) : (
              <ul className="divide-y">
                {renderedItems.map((it: any) => {
                  const id = it.stream_id ?? it.series_id
                  const rawPoster =
                    kind === 'live'
                      ? it.stream_icon
                      : kind === 'vod'
                      ? it.stream_icon
                      : it.cover
                  const poster = buildProxiedImageUrl(rawPoster)
                  const isSel = String(selectedItemId) === String(id)
                  const isFav = favorites.has(favKey(it))
                  const hasArchive = kind === 'live' && (it as LiveStream).tv_archive === 1
                  return (
                    <li
                      key={id}
                      className={cn(
                        'group flex items-center gap-2.5 px-2.5 py-2.5 sm:py-2 cursor-pointer transition-all w-full border-l-2 min-h-[48px] sm:min-h-0',
                        isSel
                          ? 'bg-accent border-primary'
                          : 'border-transparent hover:bg-accent/40 hover:border-muted-foreground/30'
                      )}
                      onClick={() =>
                        onSelectItem({
                          kind,
                          id,
                          name: it.name,
                          poster,
                          ext: it.container_extension,
                        })
                      }
                    >
                      <div className="h-11 w-11 sm:h-10 sm:w-10 shrink-0 rounded-md bg-muted overflow-hidden flex items-center justify-center ring-1 ring-black/5 dark:ring-white/5">
                        {poster ? (
                          <img
                            src={poster}
                            alt=""
                            loading="lazy"
                            className="h-full w-full object-cover"
                            onError={(e) => {
                              ;(e.target as HTMLImageElement).style.display = 'none'
                            }}
                          />
                        ) : (
                          <KindIcon className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={cn(
                          'text-xs font-medium truncate leading-tight',
                          isSel && 'text-primary'
                        )}>
                          {it.name}
                        </p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {hasArchive && (
                            <span className="text-[9px] px-1 py-0 rounded bg-blue-500/20 text-blue-600 dark:text-blue-400 font-medium" title="Catch-up available">
                              ↺
                            </span>
                          )}
                          {kind === 'live' && (it as LiveStream).epg_channel_id && (
                            <p className="text-[10px] text-muted-foreground/70 truncate">
                              {(it as LiveStream).epg_channel_id}
                            </p>
                          )}
                          {kind === 'vod' && (it as VodStream).rating && (
                            <p className="text-[10px] text-yellow-600 dark:text-yellow-400">
                              ★ {(it as VodStream).rating}
                            </p>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          onToggleFavorite(favKey(it))
                        }}
                        className={cn(
                          'p-2 sm:p-1 rounded hover:bg-accent-foreground/10 transition-colors min-w-[36px] min-h-[36px] sm:min-w-0 sm:min-h-0 flex items-center justify-center',
                          isFav ? 'text-yellow-500' : 'text-muted-foreground/50'
                        )}
                        aria-label="Toggle favorite"
                      >
                        <Star className={cn('h-4 w-4 sm:h-3.5 sm:w-3.5', isFav && 'fill-current')} />
                      </button>
                      {onAddToMosaic && kind === 'live' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            onAddToMosaic({
                              kind,
                              id,
                              name: it.name,
                              poster,
                              ext: it.container_extension,
                            })
                          }}
                          className={cn(
                            'p-2 sm:p-1 rounded hover:bg-accent-foreground/10 transition-colors min-w-[36px] min-h-[36px] sm:min-w-0 sm:min-h-0 flex items-center justify-center',
                            mosaicIds?.has(String(id))
                              ? 'text-primary'
                              : 'text-muted-foreground/50'
                          )}
                          aria-label="Add to Multi-View"
                          title="Add to Multi-View"
                        >
                          <Grid3x3 className={cn('h-4 w-4 sm:h-3.5 sm:w-3.5')} />
                        </button>
                      )}
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50 group-hover:text-foreground" />
                    </li>
                  )
                })}
              </ul>
            )}
            {/* Load more button */}
            {hasMore && (
              <button
                onClick={() => setRenderLimit((n) => n + 200)}
                className="w-full py-3 text-xs text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
              >
                Load more ({visibleItems.length - renderLimit} remaining)
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
