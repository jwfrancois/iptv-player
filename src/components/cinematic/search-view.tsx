'use client'

import { useState, useEffect, useMemo } from 'react'
import { Search, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { ContentRail, type RailItem } from './content-rail'

interface SearchViewProps {
  liveChannels: any[]
  vodItems: any[]
  seriesItems: any[]
  onSelect: (item: RailItem) => void
  onToggleMyList?: (item: RailItem) => void
  myListIds?: Set<string>
}

export function SearchView({
  liveChannels, vodItems, seriesItems, onSelect, onToggleMyList, myListIds,
}: SearchViewProps) {
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')

  // Debounce search (400ms)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 400)
    return () => clearTimeout(timer)
  }, [query])

  const results = useMemo(() => {
    if (!debounced) return { live: [], vod: [], series: [] }
    const q = debounced.toLowerCase()

    const live = liveChannels
      .filter((ch) => (ch.name || '').toLowerCase().includes(q))
      .slice(0, 20)
      .map((ch) => ({
        id: ch.stream_id,
        title: ch.name,
        poster: ch.stream_icon,
        kind: 'live' as const,
      }))

    const vod = vodItems
      .filter((m) => (m.name || '').toLowerCase().includes(q))
      .slice(0, 20)
      .map((m) => ({
        id: m.stream_id,
        title: m.name,
        poster: m.stream_icon,
        rating: m.rating,
        kind: 'vod' as const,
      }))

    const series = seriesItems
      .filter((s) => (s.name || '').toLowerCase().includes(q))
      .slice(0, 20)
      .map((s) => ({
        id: s.series_id,
        title: s.name,
        poster: s.cover,
        rating: s.rating,
        kind: 'series' as const,
      }))

    return { live, vod, series }
  }, [debounced, liveChannels, vodItems, seriesItems])

  const totalResults = results.live.length + results.vod.length + results.series.length

  return (
    <div className="space-y-6">
      {/* Search input */}
      <div className="relative max-w-2xl">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
        <Input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search channels, movies, series..."
          className="pl-11 pr-10 h-12 text-base rounded-xl"
        />
        {query && (
          <button
            onClick={() => setQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Results */}
      {debounced && totalResults === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-sm">No results found for "{debounced}"</p>
        </div>
      )}

      {results.live.length > 0 && (
        <ContentRail
          title={`Live TV (${results.live.length})`}
          items={results.live}
          onSelect={onSelect}
          onToggleMyList={onToggleMyList}
          myListIds={myListIds}
        />
      )}

      {results.vod.length > 0 && (
        <ContentRail
          title={`Movies (${results.vod.length})`}
          items={results.vod}
          onSelect={onSelect}
          onToggleMyList={onToggleMyList}
          myListIds={myListIds}
        />
      )}

      {results.series.length > 0 && (
        <ContentRail
          title={`Series (${results.series.length})`}
          items={results.series}
          onSelect={onSelect}
          onToggleMyList={onToggleMyList}
          myListIds={myListIds}
        />
      )}
    </div>
  )
}
