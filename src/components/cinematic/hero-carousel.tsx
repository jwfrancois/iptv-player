'use client'

import { useState, useEffect, useCallback } from 'react'
import { Play, Info, Star, Calendar, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export interface HeroItem {
  id: string | number
  title: string
  description: string
  poster?: string
  backdrop?: string
  rating?: string
  year?: string
  kind: 'live' | 'vod' | 'series'
}

interface HeroCarouselProps {
  items: HeroItem[]
  onPlay: (item: HeroItem) => void
  onDetails: (item: HeroItem) => void
}

export function HeroCarousel({ items, onPlay, onDetails }: HeroCarouselProps) {
  const [current, setCurrent] = useState(0)
  const [isHovered, setIsHovered] = useState(false)

  const next = useCallback(() => {
    setCurrent((c) => (c + 1) % items.length)
  }, [items.length])

  const prev = useCallback(() => {
    setCurrent((c) => (c - 1 + items.length) % items.length)
  }, [items.length])

  // Auto-rotate every 8 seconds (pause on hover)
  useEffect(() => {
    if (isHovered || items.length <= 1) return
    const timer = setInterval(next, 8000)
    return () => clearInterval(timer)
  }, [isHovered, items.length, next])

  if (items.length === 0) return null

  const item = items[current]

  return (
    <div
      className="relative h-[45vh] min-h-[380px] w-full overflow-hidden rounded-2xl group"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Backdrop image with Ken Burns */}
      <div className="absolute inset-0 overflow-hidden">
        {item.backdrop || item.poster ? (
          <img
            key={item.id}
            src={item.backdrop || item.poster}
            alt={item.title}
            className="w-full h-full object-cover hero-slide-in animate-ken-burns"
            onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')}
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-primary/20 via-background to-background" />
        )}
        {/* Gradient overlays */}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-background via-background/40 to-transparent" />
      </div>

      {/* Content */}
      <div key={item.id} className="relative h-full flex flex-col justify-end p-6 md:p-10 animate-slide-up">
        {/* Badges */}
        <div className="flex items-center gap-2 mb-3">
          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide bg-primary text-primary-foreground">
            {item.kind === 'live' ? 'On Now' : item.kind === 'series' ? 'Series' : 'Movie'}
          </span>
          {item.rating && (
            <span className="flex items-center gap-1 text-xs text-yellow-400">
              <Star className="h-3 w-3 fill-yellow-400" />
              {item.rating}
            </span>
          )}
          {item.year && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Calendar className="h-3 w-3" />
              {item.year}
            </span>
          )}
        </div>

        {/* Title */}
        <h1 className="text-2xl md:text-4xl lg:text-5xl font-bold text-foreground mb-3 max-w-2xl leading-tight line-clamp-2">
          {item.title}
        </h1>

        {/* Description */}
        <p className="text-sm md:text-base text-muted-foreground max-w-xl line-clamp-2 mb-4 leading-relaxed">
          {item.description}
        </p>

        {/* CTAs */}
        <div className="flex items-center gap-3">
          <Button size="lg" onClick={() => onPlay(item)} className="gap-2">
            <Play className="h-5 w-5 fill-current" />
            Play
          </Button>
          <Button size="lg" variant="secondary" onClick={() => onDetails(item)} className="gap-2">
            <Info className="h-5 w-5" />
            Details
          </Button>
        </div>
      </div>

      {/* Navigation arrows */}
      {items.length > 1 && (
        <>
          <button
            onClick={prev}
            className={cn(
              'absolute left-3 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center text-white transition-opacity',
              isHovered ? 'opacity-100' : 'opacity-0'
            )}
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          <button
            onClick={next}
            className={cn(
              'absolute right-3 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center text-white transition-opacity',
              isHovered ? 'opacity-100' : 'opacity-0'
            )}
          >
            <ChevronRight className="h-6 w-6" />
          </button>

          {/* Dots */}
          <div className="absolute bottom-4 right-6 flex gap-1.5">
            {items.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrent(i)}
                className={cn(
                  'h-1.5 rounded-full transition-all',
                  i === current ? 'w-6 bg-primary' : 'w-1.5 bg-white/30 hover:bg-white/50'
                )}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
