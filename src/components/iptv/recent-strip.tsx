'use client'

import { History, X, Tv } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { buildProxiedImageUrl } from '@/lib/iptv/types'
import type { RecentChannel } from '@/lib/iptv/useRecentChannels'

interface RecentStripProps {
  recent: RecentChannel[]
  currentId?: string | number | null
  onSelect: (ch: RecentChannel) => void
  onClear: () => void
}

export function RecentStrip({ recent, currentId, onSelect, onClear }: RecentStripProps) {
  if (recent.length === 0) return null

  return (
    <div className="border-b bg-card/30">
      <div className="flex items-center justify-between px-3 pt-2 pb-1">
        <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
          <History className="h-3 w-3" />
          Recently Watched
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-5 px-1.5 text-[10px] text-muted-foreground hover:text-foreground"
          onClick={onClear}
        >
          <X className="h-2.5 w-2.5" />
          Clear
        </Button>
      </div>
      <div className="flex gap-1.5 px-3 pb-2 overflow-x-auto scrollbar-thin">
        {recent.map((ch) => {
          const poster = buildProxiedImageUrl(ch.poster)
          const isActive = String(currentId) === String(ch.id)
          return (
            <button
              key={`${ch.id}-${ch.addedAt}`}
              onClick={() => onSelect(ch)}
              className={cn(
                'group relative shrink-0 w-16 h-16 rounded-md overflow-hidden border-2 transition-all hover:scale-105',
                isActive ? 'border-primary' : 'border-transparent hover:border-muted-foreground/30'
              )}
              title={ch.name}
            >
              {poster ? (
                <img
                  src={poster}
                  alt={ch.name}
                  loading="lazy"
                  className="h-full w-full object-cover"
                  onError={(e) => {
                    const t = e.target as HTMLImageElement
                    t.style.display = 'none'
                    t.parentElement!.classList.add('bg-muted', 'flex', 'items-center', 'justify-center')
                    const icon = document.createElement('span')
                    icon.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-muted-foreground"><rect width="20" height="15" x="2" y="3" rx="2"/><path d="M17 8h1"/><path d="M17 12h1"/><path d="M17 16h1"/><path d="M3 16h7"/><path d="M3 12h7"/><path d="M3 8h7"/></svg>'
                    t.parentElement!.appendChild(icon)
                  }}
                />
              ) : (
                <div className="h-full w-full bg-muted flex items-center justify-center">
                  <Tv className="h-4 w-4 text-muted-foreground" />
                </div>
              )}
              {/* Channel name tooltip overlay on hover */}
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent px-1 pt-3 pb-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <p className="text-[9px] text-white font-medium leading-tight line-clamp-2">
                  {ch.name}
                </p>
              </div>
              {isActive && (
                <div className="absolute inset-0 ring-2 ring-primary ring-inset rounded-md pointer-events-none">
                  <div className="absolute top-0.5 right-0.5 h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
                </div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
