'use client'

import { Loader2, Clock, Calendar, ChevronRight, Radio, Info } from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useEpg, formatTimeRange, formatTime } from '@/lib/iptv/useEpg'
import type { EpgProgram } from '@/lib/iptv/types'
import { cn } from '@/lib/utils'

interface EpgPanelProps {
  streamId: string | number | null
  fetcher: (id: string | number) => Promise<EpgProgram[]>
  /** Optional callback when user clicks a past/future program (for catch-up later). */
  onProgramClick?: (p: EpgProgram) => void
}

export function EpgPanel({ streamId, fetcher, onProgramClick }: EpgPanelProps) {
  const { programs, nowPlaying, next, progress, loading, error } = useEpg({ streamId, fetcher })

  if (!streamId) {
    return (
      <div className="p-4 text-xs text-muted-foreground">
        Select a channel to see what's on.
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6 gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading TV guide…
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-3 text-xs text-muted-foreground/70 italic">
        EPG not available for this channel.
      </div>
    )
  }

  if (programs.length === 0) {
    return (
      <div className="p-3 text-xs text-muted-foreground/70 italic flex items-center gap-1.5">
        <Info className="h-3 w-3" />
        No program guide data for this channel.
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2 p-3">
      {/* Now Playing - hero card */}
      {nowPlaying && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 overflow-hidden">
          <div className="px-3 pt-2.5 pb-1 flex items-center justify-between">
            <Badge variant="default" className="bg-red-600 hover:bg-red-600 text-[10px] gap-1 h-5">
              <Radio className="h-2.5 w-2.5 animate-pulse" />
              ON NOW
            </Badge>
            <span className="text-[10px] text-muted-foreground font-mono">
              {formatTimeRange(nowPlaying.start, nowPlaying.end)}
            </span>
          </div>
          <button
            className="w-full text-left px-3 pb-2 pt-1 hover:bg-primary/10 transition-colors"
            onClick={() => onProgramClick?.(nowPlaying)}
          >
            <p className="text-sm font-semibold leading-tight line-clamp-2">{nowPlaying.title}</p>
            {nowPlaying.description && (
              <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2 leading-snug">
                {nowPlaying.description}
              </p>
            )}
          </button>
          {/* Progress bar */}
          <div className="h-1 bg-muted">
            <div
              className="h-full bg-red-600 transition-all duration-1000"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Up Next */}
      {next && (
        <div className="rounded-lg border bg-card/50 px-3 py-2">
          <div className="flex items-center justify-between mb-0.5">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
              Up Next
            </span>
            <span className="text-[10px] text-muted-foreground font-mono">
              {formatTime(next.start)}
            </span>
          </div>
          <p className="text-xs font-medium leading-tight line-clamp-1">{next.title}</p>
        </div>
      )}

      {/* Full schedule list */}
      {programs.length > 0 && (
        <div className="mt-1">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold px-1 mb-1.5">
            Today's Schedule
          </p>
          <ScrollArea className="max-h-72">
            <ul className="space-y-0.5">
              {programs.map((p) => {
                const isNow = nowPlaying && p.id === nowPlaying.id
                const isNext = next && p.id === next.id
                const isPast = p.end < Math.floor(Date.now() / 1000)
                return (
                  <li
                    key={p.id}
                    className={cn(
                      'flex gap-2 px-2 py-1.5 rounded text-xs hover:bg-accent/60 transition-colors cursor-pointer',
                      isNow && 'bg-red-500/10 border-l-2 border-red-500',
                      isPast && 'opacity-50'
                    )}
                    onClick={() => onProgramClick?.(p)}
                  >
                    <div className="flex items-center gap-1 shrink-0 w-16 text-muted-foreground font-mono text-[10px]">
                      <Clock className="h-2.5 w-2.5" />
                      {formatTime(p.start)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={cn('font-medium leading-tight truncate', isNow && 'text-red-600 dark:text-red-400')}>
                        {p.title}
                      </p>
                      {p.description && (
                        <p className="text-[10px] text-muted-foreground line-clamp-1 leading-tight mt-0.5">
                          {p.description}
                        </p>
                      )}
                    </div>
                    {isNow && (
                      <ChevronRight className="h-3 w-3 text-red-500 shrink-0 self-center" />
                    )}
                  </li>
                )
              })}
            </ul>
          </ScrollArea>
        </div>
      )}
    </div>
  )
}
