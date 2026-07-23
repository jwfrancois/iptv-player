'use client'

import { useEffect, useState } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Play, Star, Calendar, Clock, Plus, Check, X, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { buildProxiedImageUrl } from '@/lib/iptv/types'
import type { RailItem } from './content-rail'

export interface DetailData {
  plot?: string
  cast?: string
  director?: string
  genre?: string
  releaseDate?: string
  duration?: string
  rating?: string
  backdrop?: string
  seasons?: Array<{
    seasonNumber: number
    name: string
    overview: string
  }>
  episodes?: Record<string, Array<{
    id: string
    episodeNum: string
    title: string
    containerExtension: string
    plot?: string
    duration?: string
    movieImage?: string
  }>>
}

interface DetailModalProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  item: RailItem | null
  detailData: DetailData | null
  loading: boolean
  onPlay: () => void
  onPlayEpisode?: (episodeId: string, ext: string, title: string) => void
  inMyList?: boolean
  onToggleMyList?: () => void
}

export function DetailModal({
  open, onOpenChange, item, detailData, loading, onPlay, onPlayEpisode, inMyList, onToggleMyList,
}: DetailModalProps) {
  const [selectedSeason, setSelectedSeason] = useState('1')

  useEffect(() => {
    if (detailData?.episodes) {
      const seasons = Object.keys(detailData.episodes)
      if (seasons.length > 0) setSelectedSeason(seasons[0])
    }
  }, [detailData])

  if (!item) return null

  const backdrop = buildProxiedImageUrl(detailData?.backdrop || item.poster)
  const poster = buildProxiedImageUrl(item.poster)
  const episodes = detailData?.episodes?.[selectedSeason] || []
  const seasons = detailData?.episodes ? Object.keys(detailData.episodes).sort((a, b) => Number(a) - Number(b)) : []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] p-0 overflow-hidden gap-0">
        {/* Backdrop */}
        <div className="relative h-48 md:h-64 w-full overflow-hidden">
          {backdrop ? (
            <img
              src={backdrop}
              alt=""
              className="w-full h-full object-cover"
              onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')}
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-primary/20 to-background" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
        </div>

        <ScrollArea className="max-h-[calc(90vh-16rem)]">
          <div className="p-6 space-y-4 -mt-20 relative">
            {/* Title row */}
            <div className="flex gap-4 items-end">
              {/* Poster */}
              <div className="w-24 md:w-32 shrink-0 aspect-[2/3] rounded-lg overflow-hidden bg-muted ring-1 ring-white/10 shadow-xl -mb-2">
                {poster ? (
                  <img src={poster} alt={item.title} className="h-full w-full object-cover" />
                ) : null}
              </div>
              <div className="flex-1 min-w-0 pb-1">
                <h2 className="text-xl md:text-2xl font-bold text-foreground line-clamp-2">{item.title}</h2>
                <div className="flex flex-wrap items-center gap-2 mt-1.5 text-xs">
                  {detailData?.rating && (
                    <span className="flex items-center gap-1 text-yellow-400">
                      <Star className="h-3 w-3 fill-yellow-400" />
                      {detailData.rating}
                    </span>
                  )}
                  {detailData?.releaseDate && (
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <Calendar className="h-3 w-3" />
                      {detailData.releaseDate}
                    </span>
                  )}
                  {detailData?.duration && (
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {detailData.duration}
                    </span>
                  )}
                  {detailData?.genre && (
                    <span className="px-2 py-0.5 rounded bg-secondary text-secondary-foreground text-[10px]">
                      {detailData.genre}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2">
              <Button onClick={onPlay} className="gap-2">
                <Play className="h-4 w-4 fill-current" />
                {item.kind === 'series' ? 'Play First Episode' : 'Play'}
              </Button>
              {onToggleMyList && (
                <Button variant="outline" onClick={onToggleMyList} className="gap-2">
                  {inMyList ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                  {inMyList ? 'In My List' : 'My List'}
                </Button>
              )}
            </div>

            {/* Loading state */}
            {loading && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            )}

            {/* Details */}
            {detailData && !loading && (
              <>
                {detailData.plot && (
                  <div>
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Overview</h3>
                    <p className="text-sm text-foreground/80 leading-relaxed">{detailData.plot}</p>
                  </div>
                )}

                {detailData.cast && (
                  <div>
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Cast</h3>
                    <p className="text-sm text-foreground/80">{detailData.cast}</p>
                  </div>
                )}

                {detailData.director && (
                  <div>
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Director</h3>
                    <p className="text-sm text-foreground/80">{detailData.director}</p>
                  </div>
                )}

                {/* Season/Episode browser for series */}
                {seasons.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex flex-wrap gap-1.5">
                      {seasons.map((s) => (
                        <Button
                          key={s}
                          size="sm"
                          variant={selectedSeason === s ? 'default' : 'outline'}
                          onClick={() => setSelectedSeason(s)}
                          className="h-7 text-xs"
                        >
                          Season {s}
                        </Button>
                      ))}
                    </div>

                    <div className="space-y-1.5">
                      {episodes.map((ep) => (
                        <div
                          key={ep.id}
                          className="flex gap-3 p-2 rounded-lg hover:bg-accent/50 cursor-pointer transition-colors group"
                          onClick={() => onPlayEpisode?.(ep.id, ep.containerExtension || 'mp4', `${item.title} — S${selectedSeason}E${ep.episodeNum}: ${ep.title}`)}
                        >
                          <div className="h-14 w-24 shrink-0 rounded-md overflow-hidden bg-muted relative">
                            {ep.movieImage && (
                              <img
                                src={buildProxiedImageUrl(ep.movieImage) || ''}
                                alt=""
                                className="h-full w-full object-cover"
                                onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')}
                              />
                            )}
                            <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Play className="h-5 w-5 text-white fill-white" />
                            </div>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-foreground line-clamp-1">
                              E{ep.episodeNum}. {ep.title}
                            </p>
                            {ep.plot && (
                              <p className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5">{ep.plot}</p>
                            )}
                            {ep.duration && (
                              <p className="text-[10px] text-muted-foreground mt-0.5">{ep.duration}</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
