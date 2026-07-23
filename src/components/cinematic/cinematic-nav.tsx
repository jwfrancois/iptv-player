'use client'

import { Home, Tv, Film, MonitorPlay, Search, Bookmark } from 'lucide-react'
import { cn } from '@/lib/utils'

export type CinematicTab = 'home' | 'live' | 'movies' | 'series' | 'search' | 'mylist'

interface CinematicNavProps {
  activeTab: CinematicTab
  onTabChange: (tab: CinematicTab) => void
}

const TABS: { id: CinematicTab; label: string; icon: typeof Home }[] = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'live', label: 'Live TV', icon: Tv },
  { id: 'movies', label: 'Movies', icon: Film },
  { id: 'series', label: 'Series', icon: MonitorPlay },
  { id: 'search', label: 'Search', icon: Search },
  { id: 'mylist', label: 'My List', icon: Bookmark },
]

export function CinematicNav({ activeTab, onTabChange }: CinematicNavProps) {
  return (
    <nav className="flex items-center gap-1 overflow-x-auto scrollbar-hide">
      {TABS.map((tab) => {
        const Icon = tab.icon
        const isActive = activeTab === tab.id
        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={cn(
              'flex items-center gap-1.5 px-3 md:px-4 py-2 rounded-lg text-xs md:text-sm font-medium transition-all whitespace-nowrap',
              isActive
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        )
      })}
    </nav>
  )
}
