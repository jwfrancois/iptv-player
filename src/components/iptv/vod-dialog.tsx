'use client'

import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Loader2, Play, Star, Calendar, Clock } from 'lucide-react'
import { useIptvApi } from '@/lib/iptv/useIptvApi'
import { buildProxiedImageUrl, type VodInfo } from '@/lib/iptv/types'

interface VodDialogProps {
  vodId: string | null
  vodName: string
  vodPoster?: string
  ext?: string
  open: boolean
  onOpenChange: (v: boolean) => void
  onPlay: (title: string) => void
}

export function VodDialog({
  vodId,
  vodName,
  vodPoster,
  ext,
  open,
  onOpenChange,
  onPlay,
}: VodDialogProps) {
  const { getVodInfo } = useIptvApi()
  const [info, setInfo] = useState<VodInfo | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !vodId) return
    let cancelled = false
    setLoading(true)
    setError(null)
    setInfo(null)
    getVodInfo(vodId)
      .then((data) => !cancelled && setInfo(data))
      .catch((e) => !cancelled && setError(e?.message || 'Failed to load movie info'))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [open, vodId, getVodInfo])

  const poster = buildProxiedImageUrl(info?.info?.movie_image) || vodPoster
  const title = info?.movie_data?.name || vodName

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{info?.info?.plot || 'Movie details'}</DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {error && <div className="py-8 text-center text-sm text-red-500">{error}</div>}

        {info && !loading && (
          <div className="flex gap-4">
            <div className="w-32 shrink-0">
              <div className="aspect-[2/3] rounded-md overflow-hidden bg-muted">
                {poster && (
                   
                  <img src={poster} alt="" className="h-full w-full object-cover" />
                )}
              </div>
            </div>
            <div className="flex-1 min-w-0 space-y-3">
              <div className="flex flex-wrap gap-2 text-xs">
                {info.info.genre && (
                  <span className="px-2 py-0.5 rounded bg-secondary">{info.info.genre}</span>
                )}
                {info.info.releasedate && (
                  <span className="px-2 py-0.5 rounded bg-secondary flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {info.info.releasedate}
                  </span>
                )}
                {info.info.duration && (
                  <span className="px-2 py-0.5 rounded bg-secondary flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {info.info.duration}
                  </span>
                )}
                {info.info.rating && (
                  <span className="px-2 py-0.5 rounded bg-secondary flex items-center gap-1">
                    <Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />
                    {info.info.rating}
                  </span>
                )}
              </div>

              {info.info.cast && (
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">Cast:</span> {info.info.cast}
                </p>
              )}
              {info.info.director && (
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">Director:</span>{' '}
                  {info.info.director}
                </p>
              )}
              {info.info.plot && (
                <p className="text-xs text-foreground/80 leading-relaxed">{info.info.plot}</p>
              )}

              <Button onClick={() => { onPlay(title); onOpenChange(false) }} className="w-full sm:w-auto">
                <Play className="h-4 w-4 mr-1.5 fill-current" />
                Play Movie
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
