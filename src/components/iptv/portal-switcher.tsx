'use client'

import { useState } from 'react'
import { ChevronDown, Server, Check, Settings2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import type { Portal } from '@/lib/iptv/usePortals'

interface PortalSwitcherProps {
  portals: Portal[]
  activePortal: Portal | null
  onSwitch: (id: string) => void
  onManage: () => void
}

export function PortalSwitcher({ portals, activePortal, onSwitch, onManage }: PortalSwitcherProps) {
  const [open, setOpen] = useState(false)

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 px-2 max-w-[180px]"
          title={activePortal ? `${activePortal.name} — ${activePortal.portal}` : 'Select portal'}
        >
          <Server className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate text-xs">{activePortal?.name || 'No portal'}</span>
          <ChevronDown className="h-3 w-3 shrink-0 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">
          Switch Portal
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {portals.map((p) => {
          const isActive = p.id === activePortal?.id
          return (
            <DropdownMenuItem
              key={p.id}
              onClick={() => {
                if (!isActive) onSwitch(p.id)
                setOpen(false)
              }}
              className={cn(
                'flex items-center gap-2 cursor-pointer py-2',
                isActive && 'bg-accent'
              )}
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate flex items-center gap-1.5">
                  {p.name}
                  {isActive && <Check className="h-3 w-3 text-primary" />}
                </p>
                <p className="text-[10px] text-muted-foreground truncate">{p.portal}</p>
              </div>
            </DropdownMenuItem>
          )
        })}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => { onManage(); setOpen(false) }} className="cursor-pointer">
          <Settings2 className="h-3.5 w-3.5 mr-2" />
          Manage Portals…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
