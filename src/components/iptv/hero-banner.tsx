'use client'

import { Loader2, Radio, Clock, Tv } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { useEpg, formatTimeRange } from '@/lib/iptv/useEpg'
import type { EpgProgram } from '@/lib/iptv/types'
import { buildProxiedImageUrl } from '@/lib/iptv/types'
import { cn } from '@/lib/utils'

interface HeroBannerProps {
  channelName: string
  channelPoster?: string
  categoryName?: string
  streamId: string | number | null
  fetcher: (id: string | number) => Promise<EpgProgram[]>
}

export function HeroBanner({
  channelName,
  channelPoster,
  categoryName,
  streamId,
  fetcher,
}: HeroBannerProps) {
  const { nowPlaying, next, progress, loading } = useEpg({ streamId, fetcher })

  if (!channelName && !streamId) {
    return null
  }

  const poster = buildProxiedImageUrl(channelPoster)

  return (
    <div
      key={streamId ? String(streamId) : 'none'}
      className="relative overflow-hidden bg-gradient-to-br from-zinc-900 via-zinc-950 to-black border-b animate-cinematic-fade"
    >
      {/* Background: blurred poster as backdrop with Ken Burns zoom */}
      {poster && (
        <div className="absolute inset-0 overflow-hidden">
          <img
            src={poster}
            alt=""
            className="w-full h-full object-cover scale-110 blur-2xl opacity-30 animate-ken-burns"
            onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')}
          />
          <div className="absolute inset-0 bg-gradient-to-r from-zinc-950 via-zinc-950/80 to-zinc-950/40" />
          <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 to-transparent" />
        </div>
      )}

      <div className="relative flex gap-4 p-4 md:p-5 animate-slide-up">
        {/* Channel poster (large, sharp) */}
        <div className="shrink-0">
          <div className="h-24 w-24 md:h-32 md:w-32 rounded-lg overflow-hidden bg-zinc-800 border border-white/10 shadow-xl">
            {poster ? (
              <img
                src={poster}
                alt={channelName}
                className="h-full w-full object-cover"
                onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')}
              />
            ) : (
              <div className="h-full w-full flex items-center justify-center">
                <Tv className="h-8 w-8 text-zinc-600" />
              </div>
            )}
          </div>
        </div>

        {/* Title + program info */}
        <div className="flex-1 min-w-0 flex flex-col justify-end">
          {/* Channel name */}
          <div className="flex items-center gap-2 mb-1">
            <Radio className="h-3.5 w-3.5 text-red-500 animate-pulse" />
            <span className="text-[10px] uppercase tracking-widest text-zinc-400 font-semibold">
              {categoryName || 'Live TV'}
            </span>
          </div>
          <h2 className="text-lg md:text-2xl font-bold text-white truncate leading-tight">
            {channelName}
          </h2>

          {/* Now Playing */}
          {loading ? (
            <div className="flex items-center gap-1.5 mt-2 text-xs text-zinc-400">
              <Loader2 className="h-3 w-3 animate-spin" />
              Loading program info…
            </div>
          ) : nowPlaying ? (
            <div className="mt-2 space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge className="bg-red-600 hover:bg-red-600 text-[10px] gap-1 h-5">
                  <Radio className="h-2.5 w-2.5 animate-pulse" />
                  ON NOW
                </Badge>
                <span className="text-xs text-zinc-300 font-mono flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {formatTimeRange(nowPlaying.start, nowPlaying.end)}
                </span>
              </div>
              <p className="text-sm md:text-base font-medium text-white line-clamp-1">
                {nowPlaying.title}
              </p>
              {nowPlaying.description && (
                <p className="text-[11px] md:text-xs text-zinc-400 line-clamp-2 leading-relaxed max-w-2xl">
                  {nowPlaying.description}
                </p>
              )}
              {/* Progress bar */}
              <div className="h-0.5 bg-white/10 rounded-full overflow-hidden max-w-md mt-1.5">
                <div
                  className="h-full bg-red-500 transition-all duration-1000"
                  style={{ width: `${progress * 100}%` }}
                />
              </div>
            </div>
          ) : (
            <p className="text-xs text-zinc-500 italic mt-2">
              No program guide data available.
            </p>
          )}

          {/* Up Next chip */}
          {next && (
            <div className="mt-2 inline-flex items-center gap-1.5 text-[10px] text-zinc-400 bg-white/5 rounded px-2 py-0.5">
              <span className="uppercase tracking-wide font-semibold text-zinc-500">Next:</span>
              <span className="text-zinc-300 truncate max-w-xs">{next.title}</span>
              <span className="text-zinc-500 font-mono">{formatTimeRange(next.start, next.end)}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
