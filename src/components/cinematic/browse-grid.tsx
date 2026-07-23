'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import { Search, Star, Play, Loader2, ChevronLeft, ChevronRight } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { buildProxiedImageUrl } from '@/lib/iptv/types'
import type { RailItem } from './content-rail'

interface BrowseGridProps {
  title: string
  categories: { category_id: string; category_name: string }[]
  allItems: RailItem[]
  categoryOfItem: (item: RailItem) => string | undefined
  onSelect: (item: RailItem) => void
  onToggleMyList?: (item: RailItem) => void
  myListIds?: Set<string>
}

const PAGE_SIZE = 60

export function BrowseGrid({
  title, categories, allItems, categoryOfItem, onSelect, onToggleMyList, myListIds,
}: BrowseGridProps) {
  const [selectedCat, setSelectedCat] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [renderLimit, setRenderLimit] = useState(PAGE_SIZE)
  const catScrollRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)

  // Reset render limit when filter changes
  useEffect(() => {
    setRenderLimit(PAGE_SIZE)
  }, [selectedCat, search])

  // Filter items
  const filtered = useMemo(() => {
    let items = allItems
    if (selectedCat) {
      items = items.filter((item) => {
        const cat = categoryOfItem(item)
        return cat && String(cat) === String(selectedCat)
      })
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      items = items.filter((item) => (item.title || '').toLowerCase().includes(q))
    }
    return items
  }, [allItems, selectedCat, search, categoryOfItem])

  const visibleItems = filtered.slice(0, renderLimit)
  const hasMore = filtered.length > renderLimit

  // Infinite scroll
  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore) {
          setRenderLimit((n) => n + PAGE_SIZE)
        }
      },
      { rootMargin: '200px' }
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasMore])

  // Count items per category
  const categoriesWithCounts = useMemo(() => {
    return categories
      .map((cat) => ({
        ...cat,
        count: allItems.filter((item) => {
          const c = categoryOfItem(item)
          return c && String(c) === String(cat.category_id)
        }).length,
      }))
      .filter((c) => c.count > 0)
  }, [categories, allItems, categoryOfItem])

  // Scroll category ribbon
  const scrollCats = (dir: 'left' | 'right') => {
    const el = catScrollRef.current
    if (!el) return
    el.scrollBy({ left: dir === 'left' ? -300 : 300, behavior: 'smooth' })
  }

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative max-w-2xl">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={`Search ${title.toLowerCase()}...`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 h-10"
        />
      </div>

      {/* Permanent horizontal category ribbon */}
      <div className="relative group/cats sticky top-0 z-20 bg-background/80 backdrop-blur-xl py-2 -mx-4 px-4">
        <button
          onClick={() => scrollCats('left')}
          className="absolute left-0 top-1/2 -translate-y-1/2 z-10 h-8 w-8 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center text-white opacity-0 group-hover/cats:opacity-100 transition-opacity"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div
          ref={catScrollRef}
          className="flex gap-2 overflow-x-auto scrollbar-hide"
        >
          {/* All Categories button */}
          <button
            className={cn(
              'shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap',
              !selectedCat
                ? 'bg-primary text-primary-foreground'
                : 'bg-secondary text-secondary-foreground hover:bg-accent'
            )}
            onClick={() => setSelectedCat(null)}
          >
            All ({allItems.length})
          </button>
          {categoriesWithCounts.map((cat) => (
            <button
              key={cat.category_id}
              className={cn(
                'shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap',
                String(selectedCat) === String(cat.category_id)
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-secondary-foreground hover:bg-accent'
              )}
              onClick={() => setSelectedCat(cat.category_id)}
            >
              {cat.category_name} ({cat.count})
            </button>
          ))}
        </div>
        <button
          onClick={() => scrollCats('right')}
          className="absolute right-0 top-1/2 -translate-y-1/2 z-10 h-8 w-8 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center text-white opacity-0 group-hover/cats:opacity-100 transition-opacity"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Results count */}
      <p className="text-xs text-muted-foreground">
        {filtered.length} {filtered.length === 1 ? 'item' : 'items'}
      </p>

      {/* Grid */}
      {visibleItems.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-sm">No items found</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-3">
          {visibleItems.map((item, i) => {
            const poster = buildProxiedImageUrl(item.poster)
            const inMyList = myListIds?.has(String(item.id))
            return (
              <div
                key={`${item.id}-${i}`}
                className="group/card cursor-pointer card-enter"
                style={{ animationDelay: `${Math.min(i * 15, 300)}ms` }}
                onClick={() => onSelect(item)}
              >
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
                    <div className="h-full w-full flex items-center justify-center text-muted-foreground text-[10px] px-1 text-center">
                      {item.title}
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover/card:opacity-100 transition-opacity flex flex-col justify-end p-1.5">
                    <div className="flex items-center gap-1">
                      <div className="h-6 w-6 rounded-full bg-primary flex items-center justify-center">
                        <Play className="h-3 w-3 fill-primary-foreground text-primary-foreground" />
                      </div>
                      {onToggleMyList && (
                        <button
                          onClick={(e) => { e.stopPropagation(); onToggleMyList(item) }}
                          className="h-6 w-6 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center text-white border border-white/30"
                        >
                          {inMyList ? '✓' : '+'}
                        </button>
                      )}
                    </div>
                  </div>
                  {item.rating && (
                    <div className="absolute top-1 right-1 px-1 py-0.5 rounded bg-black/70 backdrop-blur-sm text-[8px] text-yellow-400 flex items-center gap-0.5">
                      <Star className="h-2 w-2 fill-yellow-400" />
                      {item.rating}
                    </div>
                  )}
                </div>
                <p className="text-[10px] font-medium text-foreground mt-1 line-clamp-1">{item.title}</p>
              </div>
            )
          })}
        </div>
      )}

      {/* Infinite scroll sentinel */}
      {hasMore && (
        <div ref={sentinelRef} className="flex items-center justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}
    </div>
  )
}
