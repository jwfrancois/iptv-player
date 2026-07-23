'use client'

import { useRef, useState, useEffect } from 'react'
import { ChevronLeft, ChevronRight, Star, Play, Plus, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { buildProxiedImageUrl } from '@/lib/iptv/types'

export interface RailItem {
  id: string | number
  title: string
  poster?: string
  rating?: string
  year?: string
  kind: 'live' | 'vod' | 'series'
}

interface ContentRailProps {
  title: string
  items: RailItem[]
  onSelect: (item: RailItem) => void
  onToggleMyList?: (item: RailItem) => void
  myListIds?: Set<string>
}

export function ContentRail({ title, items, onSelect, onToggleMyList, myListIds }: ContentRailProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  const checkScroll = () => {
    const el = scrollRef.current
    if (!el) return
    setCanScrollLeft(el.scrollLeft > 10)
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 10)
  }

  useEffect(() => {
    checkScroll()
    const el = scrollRef.current
    if (el) el.addEventListener('scroll', checkScroll)
    return () => el?.removeEventListener('scroll', checkScroll)
  }, [items])

  const scroll = (dir: 'left' | 'right') => {
    const el = scrollRef.current
    if (!el) return
    const amount = el.clientWidth * 0.8
    el.scrollBy({ left: dir === 'left' ? -amount : amount, behavior: 'smooth' })
  }

  if (items.length === 0) return null

  return (
    <div className="space-y-2 group/rail">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-sm md:text-base font-semibold text-foreground">{title}</h2>
        <span className="text-[10px] text-muted-foreground">{items.length} items</span>
      </div>

      <div className="relative">
        {/* Left arrow */}
        {canScrollLeft && (
          <button
            onClick={() => scroll('left')}
            className="absolute left-0 top-0 bottom-0 z-10 w-12 bg-gradient-to-r from-background to-transparent flex items-center justify-center opacity-0 group-hover/rail:opacity-100 transition-opacity"
          >
            <div className="h-8 w-8 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center text-white">
              <ChevronLeft className="h-5 w-5" />
            </div>
          </button>
        )}

        {/* Scrollable content */}
        <div
          ref={scrollRef}
          className="flex gap-3 overflow-x-auto scrollbar-hide rail-scroll pb-2"
        >
          {items.map((item, i) => {
            const poster = buildProxiedImageUrl(item.poster)
            const inMyList = myListIds?.has(String(item.id))
            return (
              <div
                key={`${item.id}-${i}`}
                className="rail-item shrink-0 w-32 md:w-36 group/card cursor-pointer card-enter"
                style={{ animationDelay: `${Math.min(i * 30, 600)}ms` }}
                onClick={() => onSelect(item)}
              >
                {/* Poster */}
                <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-muted ring-1 ring-white/5 group-hover/card:ring-primary/50 transition-all group-hover/card:scale-105">
                  {poster ? (
                    <img
                      src={poster}
                      alt={item.title}
                      loading="lazy"
                      className="h-full w-full object-cover"
                      onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')}
                    />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center text-muted-foreground text-xs px-2 text-center">
                      {item.title}
                    </div>
                  )}

                  {/* Hover overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover/card:opacity-100 transition-opacity flex flex-col justify-end p-2">
                    <div className="flex items-center gap-1.5">
                      <div className="h-7 w-7 rounded-full bg-primary flex items-center justify-center">
                        <Play className="h-3.5 w-3.5 fill-primary-foreground text-primary-foreground" />
                      </div>
                      {onToggleMyList && (
                        <button
                          onClick={(e) => { e.stopPropagation(); onToggleMyList(item) }}
                          className="h-7 w-7 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center text-white border border-white/30"
                        >
                          {inMyList ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Rating badge */}
                  {item.rating && (
                    <div className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded bg-black/70 backdrop-blur-sm text-[9px] text-yellow-400 flex items-center gap-0.5">
                      <Star className="h-2 w-2 fill-yellow-400" />
                      {item.rating}
                    </div>
                  )}
                </div>

                {/* Title */}
                <p className="text-[11px] font-medium text-foreground mt-1.5 line-clamp-1">{item.title}</p>
                {item.year && (
                  <p className="text-[10px] text-muted-foreground">{item.year}</p>
                )}
              </div>
            )
          })}
        </div>

        {/* Right arrow */}
        {canScrollRight && (
          <button
            onClick={() => scroll('right')}
            className="absolute right-0 top-0 bottom-0 z-10 w-12 bg-gradient-to-l from-background to-transparent flex items-center justify-center opacity-0 group-hover/rail:opacity-100 transition-opacity"
          >
            <div className="h-8 w-8 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center text-white">
              <ChevronRight className="h-5 w-5" />
            </div>
          </button>
        )}
      </div>
    </div>
  )
}
