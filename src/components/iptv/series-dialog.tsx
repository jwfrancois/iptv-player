'use client'

import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { Loader2, Play, Star } from 'lucide-react'
import { useIptvApi } from '@/lib/iptv/useIptvApi'
import { buildProxiedImageUrl, type SeriesInfo } from '@/lib/iptv/types'
import { cn } from '@/lib/utils'

interface SeriesDialogProps {
  seriesId: string | null
  seriesName: string
  open: boolean
  onOpenChange: (v: boolean) => void
  onPlayEpisode: (episodeId: string, ext: string, title: string) => void
}

export function SeriesDialog({
  seriesId,
  seriesName,
  open,
  onOpenChange,
  onPlayEpisode,
}: SeriesDialogProps) {
  const { getSeriesInfo } = useIptvApi()
  const [info, setInfo] = useState<SeriesInfo | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedSeason, setSelectedSeason] = useState<string>('1')

  useEffect(() => {
    if (!open || !seriesId) return
    let cancelled = false
    setLoading(true)
    setError(null)
    setInfo(null)
    getSeriesInfo(seriesId)
      .then((data) => {
        if (cancelled) return
        setInfo(data)
        // Pick first available season
        const seasons = Object.keys(data.episodes || {})
        if (seasons.length > 0) setSelectedSeason(seasons[0])
      })
      .catch((e) => !cancelled && setError(e?.message || 'Failed to load series info'))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [open, seriesId, getSeriesInfo])

  const seasons = info ? Object.keys(info.episodes || {}).sort((a, b) => Number(a) - Number(b)) : []
  const episodes = info?.episodes?.[selectedSeason] || []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="truncate">{seriesName}</span>
          </DialogTitle>
          <DialogDescription>
            {info?.info?.plot || 'Select an episode to start watching.'}
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {error && (
          <div className="py-8 text-center text-sm text-red-500">{error}</div>
        )}

        {info && !loading && (
          <div className="flex flex-col gap-3 min-h-0 flex-1">
            {/* Meta */}
            <div className="flex flex-wrap gap-2 text-xs">
              {info.info.genre && (
                <span className="px-2 py-0.5 rounded bg-secondary">{info.info.genre}</span>
              )}
              {info.info.releaseDate && (
                <span className="px-2 py-0.5 rounded bg-secondary">{info.info.releaseDate}</span>
              )}
              {info.info.rating && (
                <span className="px-2 py-0.5 rounded bg-secondary flex items-center gap-1">
                  <Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />
                  {info.info.rating}
                </span>
              )}
            </div>

            {/* Season selector */}
            {seasons.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {seasons.map((s) => (
                  <Button
                    key={s}
                    size="sm"
                    variant={selectedSeason === s ? 'default' : 'outline'}
                    onClick={() => setSelectedSeason(s)}
                    className="h-7"
                  >
                    Season {s}
                  </Button>
                ))}
              </div>
            )}

            {/* Episodes */}
            <ScrollArea className="flex-1 -mx-2 px-2">
              <ul className="space-y-1.5">
                {episodes.map((ep) => (
                  <li
                    key={ep.id}
                    className={cn(
                      'flex gap-3 p-2 rounded-md border hover:bg-accent/50 transition-colors cursor-pointer'
                    )}
                    onClick={() => {
                      onPlayEpisode(
                        ep.id,
                        ep.container_extension || 'mp4',
                        `${seriesName} — S${ep.season}E${ep.episode_num}: ${ep.title}`
                      )
                      onOpenChange(false)
                    }}
                  >
                    <div className="h-16 w-28 shrink-0 rounded overflow-hidden bg-muted relative">
                      {ep.info?.movie_image && (
                         
                        <img
                          src={buildProxiedImageUrl(ep.info.movie_image)}
                          alt=""
                          className="h-full w-full object-cover"
                          onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')}
                        />
                      )}
                      <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 hover:opacity-100 transition-opacity">
                        <Play className="h-6 w-6 text-white fill-white" />
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        E{ep.episode_num}. {ep.title}
                      </p>
                      {ep.info?.plot && (
                        <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                          {ep.info.plot}
                        </p>
                      )}
                      {ep.info?.duration && (
                        <p className="text-[10px] text-muted-foreground mt-1">{ep.info.duration}</p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </ScrollArea>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
