'use client'

import { useEffect, useRef, useState } from 'react'
import Hls from 'hls.js'
import { Loader2, AlertCircle, X, Maximize2, Volume2, VolumeX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export interface MosaicTile {
  id: string | number
  name: string
  poster?: string
  streamUrl: string
  contentType?: 'hls' | 'mp4' | 'ts' | 'auto'
}

interface MosaicTileViewProps {
  tile: MosaicTile
  index: number
  isMuted: boolean
  onPromote: () => void
  onRemove: () => void
  onToggleMute: () => void
}

/**
 * A single tile in the mosaic grid. Uses hls.js but with minimal buffering
 * (low buffer length) since we're showing many at once. Audio is muted by
 * default; only one tile can be unmuted at a time.
 */
function MosaicTileView({
  tile,
  index,
  isMuted,
  onPromote,
  onRemove,
  onToggleMute,
}: MosaicTileViewProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const hlsRef = useRef<Hls | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showOverlay, setShowOverlay] = useState(true)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    setLoading(true)
    setError(null)
    let destroyed = false

    const onPlaying = () => {
      if (!destroyed) {
        setLoading(false)
        // Hide overlay after 2s
        setTimeout(() => !destroyed && setShowOverlay(false), 2000)
      }
    }
    const onError = () => {
      if (!destroyed) {
        setLoading(false)
        setError('Stream unavailable')
      }
    }
    video.addEventListener('playing', onPlaying)
    video.addEventListener('error', onError)

    const detectedType = tile.contentType || 'hls'

    if (detectedType === 'hls' && Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        // Minimal buffer for mosaic — we're showing many streams
        backBufferLength: 15,
        maxBufferLength: 10,
        maxMaxBufferLength: 20,
        liveSyncDurationCount: 4,
        // Fewer retries — fail fast in mosaic mode
        fragLoadingMaxRetry: 2,
        manifestLoadingMaxRetry: 2,
        levelLoadingMaxRetry: 2,
      })
      hlsRef.current = hls
      hls.loadSource(tile.streamUrl)
      hls.attachMedia(video)
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (!destroyed) video.play().catch(() => {})
      })
      hls.on(Hls.Events.ERROR, (_evt, data) => {
        if (destroyed || !data.fatal) return
        setLoading(false)
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          setError('Channel offline or forbidden')
        } else {
          setError('Playback error')
        }
        hls.destroy()
      })
    } else {
      video.src = tile.streamUrl
      video.play().catch(() => {})
    }

    return () => {
      destroyed = true
      video.removeEventListener('playing', onPlaying)
      video.removeEventListener('error', onError)
      if (hlsRef.current) {
        hlsRef.current.destroy()
        hlsRef.current = null
      }
      video.removeAttribute('src')
      video.load()
    }
  }, [tile.streamUrl, tile.contentType])

  return (
    <div
      className="relative bg-black rounded-md overflow-hidden group aspect-video border-2 border-transparent hover:border-primary/50 transition-colors"
      onMouseEnter={() => setShowOverlay(true)}
      onMouseLeave={() => setShowOverlay(false)}
    >
      <video
        ref={videoRef}
        muted={isMuted}
        playsInline
        autoPlay
        className="w-full h-full object-contain"
      />

      {/* Loading */}
      {loading && !error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60">
          <Loader2 className="h-5 w-5 animate-spin text-white/80" />
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 p-2 text-center">
          <AlertCircle className="h-5 w-5 text-red-500 mb-1" />
          <p className="text-[10px] text-white/80">{error}</p>
        </div>
      )}

      {/* Overlay: channel name + controls (shown on hover) */}
      <div
        className={cn(
          'absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-black/40 transition-opacity',
          showOverlay ? 'opacity-100' : 'opacity-0'
        )}
      >
        {/* Top-right controls */}
        <div className="absolute top-1 right-1 flex gap-0.5">
          <Button
            size="icon"
            variant="ghost"
            onClick={onToggleMute}
            className={cn(
              'h-6 w-6 text-white hover:bg-white/20',
              !isMuted && 'bg-primary/80 hover:bg-primary'
            )}
            title={isMuted ? 'Unmute (mute others)' : 'Mute'}
          >
            {isMuted ? <VolumeX className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={onPromote}
            className="h-6 w-6 text-white hover:bg-white/20"
            title="Send to main player"
          >
            <Maximize2 className="h-3 w-3" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={onRemove}
            className="h-6 w-6 text-white hover:bg-red-500/80"
            title="Remove from mosaic"
          >
            <X className="h-3 w-3" />
          </Button>
        </div>

        {/* Bottom: channel name */}
        <div className="absolute bottom-0 inset-x-0 p-2">
          <p className="text-[11px] font-medium text-white truncate">
            {tile.name}
          </p>
          <p className="text-[9px] text-white/60">Tile {index + 1}</p>
        </div>
      </div>
    </div>
  )
}

interface MosaicViewProps {
  open: boolean
  onClose: () => void
  tiles: MosaicTile[]
  onRemoveTile: (id: string | number) => void
  onPromoteTile: (tile: MosaicTile) => void
  onClearAll: () => void
}

export function MosaicView({
  open,
  onClose,
  tiles,
  onRemoveTile,
  onPromoteTile,
  onClearAll,
}: MosaicViewProps) {
  const [mutedTile, setMutedTile] = useState<string | number | null>(null)

  if (!open) return null

  // Determine grid columns based on tile count
  const gridClass = tiles.length <= 1
    ? 'grid-cols-1'
    : tiles.length <= 4
    ? 'grid-cols-2'
    : tiles.length <= 6
    ? 'grid-cols-3'
    : 'grid-cols-3'

  return (
    <div className="fixed inset-0 z-50 bg-black/95 backdrop-blur-sm flex flex-col">
      {/* Mosaic header */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-white/10 bg-zinc-950">
        <div className="flex items-center gap-2">
          <div className="grid grid-cols-2 gap-0.5 h-4 w-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="bg-red-500 rounded-[1px]" />
            ))}
          </div>
          <span className="font-semibold text-sm text-white">Multi-View</span>
          <span className="text-xs text-white/50">
            {tiles.length} channel{tiles.length !== 1 ? 's' : ''} · click speaker icon to unmute one
          </span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {tiles.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClearAll}
              className="text-white/70 hover:text-white hover:bg-white/10"
            >
              Clear All
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="text-white hover:bg-white/10"
          >
            Close Multi-View
          </Button>
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-auto p-3">
        {tiles.length === 0 ? (
          <div className="flex items-center justify-center h-full text-white/50 text-sm">
            Add channels to Multi-View by clicking the grid icon on any channel in the sidebar.
          </div>
        ) : (
          <div className={cn('grid gap-2 h-full', gridClass)}>
            {tiles.map((tile, i) => (
              <MosaicTileView
                key={`${tile.id}-${i}`}
                tile={tile}
                index={i}
                isMuted={mutedTile !== tile.id}
                onPromote={() => {
                  onPromoteTile(tile)
                  onClose()
                }}
                onRemove={() => onRemoveTile(tile.id)}
                onToggleMute={() => {
                  setMutedTile(mutedTile === tile.id ? null : tile.id)
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
