'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import Hls from 'hls.js'
import { Loader2, AlertCircle, Maximize2, Volume2, VolumeX, Play, Pause, Activity, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'

interface VideoPlayerProps {
  src: string
  poster?: string
  title?: string
  contentType?: 'hls' | 'mp4' | 'ts' | 'auto'
}

/**
 * When hls.js reports a fatal network error, attempt to re-fetch the manifest
 * URL directly so we can read the X-IPTV-Reason header our proxy attaches to
 * error responses.
 */
async function fetchErrorReason(src: string): Promise<string | null> {
  try {
    const res = await fetch(src, { method: 'GET', cache: 'no-store' })
    if (!res.ok) {
      const reason = res.headers.get('X-IPTV-Reason')
      if (reason) return reason
      if (res.status === 403) return 'Channel forbidden. Your subscription may not include this channel tier, or it is geo-restricted.'
      if (res.status === 404) return 'Channel not found or currently offline.'
      if (res.status >= 500) return 'Portal server error. Please try another channel.'
    }
    return null
  } catch {
    return null
  }
}

export function VideoPlayer({ src, poster, title, contentType = 'auto' }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const hlsRef = useRef<Hls | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [playing, setPlaying] = useState(false)
  const [muted, setMuted] = useState(false)
  const [volume, setVolume] = useState(1)
  const [showControls, setShowControls] = useState(true)
  const [bufferHealth, setBufferHealth] = useState(0) // seconds of buffer ahead
  const [buffering, setBuffering] = useState(false)
  const [quality, setQuality] = useState<string>('') // e.g. "720p" or bandwidth
  const [stallCount, setStallCount] = useState(0)
  const [showSlowWarning, setShowSlowWarning] = useState(false)

  const detectedType: 'hls' | 'mp4' | 'ts' = (() => {
    if (contentType !== 'auto') return contentType
    const clean = src.split('?')[0].toLowerCase()
    if (clean.endsWith('.m3u8')) return 'hls'
    if (clean.endsWith('.mp4') || clean.endsWith('.mkv')) return 'mp4'
    if (clean.endsWith('.ts')) return 'ts'
    return 'hls'
  })()

  useEffect(() => {
    const video = videoRef.current
    if (!video || !src) return

    setLoading(true)
    setError(null)
    setBufferHealth(0)
    setBuffering(true)
    setStallCount(0)
    setShowSlowWarning(false)

    let destroyed = false

    const onLoaded = () => {
      if (destroyed) return
      setLoading(false)
      video.play().catch(() => {})
    }
    const onPlaying = () => {
      if (destroyed) return
      setLoading(false)
      setBuffering(false)
      setPlaying(true)
    }
    const onPause = () => {
      if (!destroyed) setPlaying(false)
    }
    const onWaiting = () => {
      if (!destroyed) {
        setBuffering(true)
        setLoading(true)
        setStallCount((c) => {
          const next = c + 1
          // After 3 stalls, show the slow-connection warning
          if (next >= 3) setShowSlowWarning(true)
          return next
        })
      }
    }
    const onStalled = () => {
      if (!destroyed) setBuffering(true)
    }
    const onCanPlay = () => {
      if (!destroyed) {
        setBuffering(false)
        setLoading(false)
      }
    }
    const onError = () => {
      if (destroyed) return
      setLoading(false)
      setError('Playback error. The stream may be offline or geo-restricted.')
    }

    // Track buffer health
    const onProgress = () => {
      if (destroyed || !video.buffered.length) return
      const end = video.buffered.end(video.buffered.length - 1)
      setBufferHealth(Math.max(0, end - video.currentTime))
    }

    video.addEventListener('loadeddata', onLoaded)
    video.addEventListener('playing', onPlaying)
    video.addEventListener('pause', onPause)
    video.addEventListener('waiting', onWaiting)
    video.addEventListener('stalled', onStalled)
    video.addEventListener('canplay', onCanPlay)
    video.addEventListener('error', onError)
    video.addEventListener('progress', onProgress)

    // Update buffer health every 2 seconds
    const bufferInterval = setInterval(() => {
      if (destroyed || !video.buffered.length) return
      const end = video.buffered.end(video.buffered.length - 1)
      setBufferHealth(Math.max(0, end - video.currentTime))
    }, 2000)

    if (detectedType === 'hls') {
      if (hlsRef.current) {
        hlsRef.current.destroy()
        hlsRef.current = null
      }
      if (Hls.isSupported()) {
        // Optimized config for live IPTV streaming:
        // - lowLatencyMode OFF: we want stability, not edge-of-live
        // - Large buffers: more resilience to network hiccups
        // - Stay further behind live edge (6 segments vs default 3)
        // - Aggressive retry on transient failures
        const hls = new Hls({
          // Worker for performance
          enableWorker: true,
          // CRITICAL: disable low-latency mode. Low-latency tries to keep
          // the player at the live edge with minimal buffer, which causes
          // constant rebuffering on IPTV streams. We want a big stable buffer.
          lowLatencyMode: false,

          // Buffer sizing — bigger = more resilient to network jitter
          backBufferLength: 90,        // keep 90s of played video (seek-back)
          maxBufferLength: 30,         // target forward buffer (seconds)
          maxMaxBufferLength: 120,     // hard cap on forward buffer
          maxBufferSize: 60 * 1000 * 1000, // 60MB cap
          maxBufferHole: 0.5,          // tolerate small gaps

          // Live sync — stay further from the edge for stability.
          // Default is 3 segments (~30s). We use 6 (~60s) for more buffer.
          liveSyncDurationCount: 6,
          liveMaxLatencyDurationCount: 18,  // if we fall too far behind, catch up

          // Retry logic for flaky portal servers
          fragLoadingTimeOut: 20000,        // 20s before timeout
          fragLoadingMaxRetry: 6,           // 6 retries per fragment
          fragLoadingRetryDelay: 500,       // start at 500ms
          fragLoadingMaxRetryTimeoutMs: 64000, // cap at 64s
          manifestLoadingTimeOut: 15000,
          manifestLoadingMaxRetry: 3,
          manifestLoadingRetryDelay: 1000,
          levelLoadingTimeOut: 15000,
          levelLoadingMaxRetry: 4,
          levelLoadingRetryDelay: 1000,

          // ABR (adaptive bitrate) — let hls.js pick the best level
          startLevel: -1,  // auto-select based on bandwidth
          abrEwmaDefaultEstimate: 2 * 1000 * 1000, // assume 2Mbps initially
          abrBandWidthFactor: 0.95,
          abrBandWidthUpFactor: 0.7,
          abrEwmaFastLive: 5.0,

          // Misc stability
          startFragPrefetch: true,
          testBandwidth: true,
          progressive: false,  // don't use progressive fetch (can stall)
        })
        hlsRef.current = hls
        hls.loadSource(src)
        hls.attachMedia(video)

        hls.on(Hls.Events.MANIFEST_PARSED, (_evt, data) => {
          if (destroyed) return
          // Report quality if available
          if (data.levels && data.levels.length > 0) {
            const level = data.levels[hls.currentLevel >= 0 ? hls.currentLevel : 0]
            if (level) {
              setQuality(level.height ? `${level.height}p` : `${Math.round((level.bitrate || 0) / 1000)}kbps`)
            }
          }
          video.play().catch(() => {})
        })

        hls.on(Hls.Events.LEVEL_SWITCHED, (_evt, data) => {
          if (destroyed) return
          const level = hls.levels[data.level]
          if (level) {
            setQuality(level.height ? `${level.height}p` : `${Math.round((level.bitrate || 0) / 1000)}kbps`)
          }
        })

        hls.on(Hls.Events.FRAG_BUFFERED, () => {
          if (destroyed) return
          // Update buffer health after a fragment is buffered
          if (video.buffered.length) {
            const end = video.buffered.end(video.buffered.length - 1)
            setBufferHealth(Math.max(0, end - video.currentTime))
          }
        })

        hls.on(Hls.Events.ERROR, async (_evt, data) => {
          if (destroyed) return

          // Non-fatal: just log, hls.js will retry
          if (!data.fatal) {
            return
          }

          setLoading(false)

          // For network errors, try to fetch a meaningful reason from our proxy
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR && data.response) {
            // Retry a few times before giving up — portal servers are flaky
            const retryable = data.details === 'fragLoadError' || data.details === 'manifestLoadError'
            if (retryable && data.frag) {
              // hls.js already retries internally; if we get here it's exhausted
            }
            const customReason = await fetchErrorReason(src)
            if (customReason) {
              setError(customReason)
              hls.destroy()
              return
            }
          }

          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              // Try to recover network errors by reloading the playlist
              setError('Network error. Attempting to recover…')
              setTimeout(() => {
                if (!destroyed) {
                  setError(null)
                  hls.startLoad()
                }
              }, 2000)
              break
            case Hls.ErrorTypes.MEDIA_ERROR:
              setError('Media error. Trying to recover…')
              hls.recoverMediaError()
              setTimeout(() => { if (!destroyed) setError(null) }, 2000)
              break
            default:
              setError('Fatal playback error. Stream may be unavailable.')
              hls.destroy()
              break
          }
        })
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        // Safari native HLS
        video.src = src
      } else {
        setError('HLS playback not supported in this browser.')
      }
    } else {
      // Direct mp4/ts playback
      video.src = src
    }

    return () => {
      destroyed = true
      clearInterval(bufferInterval)
      video.removeEventListener('loadeddata', onLoaded)
      video.removeEventListener('playing', onPlaying)
      video.removeEventListener('pause', onPause)
      video.removeEventListener('waiting', onWaiting)
      video.removeEventListener('stalled', onStalled)
      video.removeEventListener('canplay', onCanPlay)
      video.removeEventListener('error', onError)
      video.removeEventListener('progress', onProgress)
      if (hlsRef.current) {
        hlsRef.current.destroy()
        hlsRef.current = null
      }
      video.removeAttribute('src')
      video.load()
    }
  }, [src, detectedType])

  const togglePlay = () => {
    const v = videoRef.current
    if (!v) return
    if (v.paused) v.play().catch(() => {})
    else v.pause()
  }

  const toggleMute = () => {
    const v = videoRef.current
    if (!v) return
    v.muted = !v.muted
    setMuted(v.muted)
  }

  const onVolume = (val: number[]) => {
    const v = videoRef.current
    if (!v) return
    const vol = val[0] / 100
    v.volume = vol
    v.muted = vol === 0
    setVolume(vol)
    setMuted(vol === 0)
  }

  const toggleFullscreen = () => {
    const el = containerRef.current
    if (!el) return
    if (document.fullscreenElement) {
      document.exitFullscreen()
    } else {
      el.requestFullscreen().catch(() => {})
    }
  }

  // Buffer health color: green >10s, yellow 3-10s, red <3s
  const bufferColor = bufferHealth > 10 ? 'text-green-400' : bufferHealth > 3 ? 'text-yellow-400' : 'text-red-400'

  return (
    <div
      ref={containerRef}
      className="relative w-full bg-black aspect-video group"
      onMouseMove={() => setShowControls(true)}
      onMouseLeave={() => setShowControls(false)}
    >
      <video
        ref={videoRef}
        poster={poster}
        playsInline
        autoPlay
        className="w-full h-full object-contain"
        onClick={togglePlay}
      />

      {/* Loading / buffering overlay */}
      {(loading || buffering) && !error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none gap-2">
          <div className="bg-black/60 rounded-full p-4">
            <Loader2 className="h-8 w-8 animate-spin text-white" />
          </div>
          <p className="text-white/80 text-xs">Buffering…</p>
        </div>
      )}

      {/* Error overlay */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center p-6">
          <div className="bg-black/80 rounded-lg p-6 max-w-md text-center">
            <AlertCircle className="h-10 w-10 text-red-500 mx-auto mb-3" />
            <p className="text-white text-sm">{error}</p>
          </div>
        </div>
      )}

      {/* Title bar */}
      {title && !error && (
        <div
          className={`absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/80 to-transparent transition-opacity ${
            showControls ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <p className="text-white text-sm font-medium truncate">{title}</p>
        </div>
      )}

      {/* Buffer health badge (top-right, always visible) */}
      {!error && (bufferHealth > 0 || buffering) && (
        <div className="absolute top-3 right-3 flex items-center gap-2 bg-black/60 backdrop-blur-sm rounded px-2 py-1 text-xs">
          {buffering ? (
            <Loader2 className="h-3 w-3 animate-spin text-yellow-400" />
          ) : (
            <Activity className={`h-3 w-3 ${bufferColor}`} />
          )}
          <span className={bufferColor}>
            {buffering ? '...' : `${bufferHealth.toFixed(1)}s`}
          </span>
          {quality && (
            <>
              <span className="text-white/40">·</span>
              <span className="text-white/70 flex items-center gap-0.5">
                <Zap className="h-3 w-3" />
                {quality}
              </span>
            </>
          )}
          {stallCount > 0 && (
            <>
              <span className="text-white/40">·</span>
              <span className="text-yellow-400/80">{stallCount} stall{stallCount > 1 ? 's' : ''}</span>
            </>
          )}
        </div>
      )}

      {/* Slow connection warning */}
      {showSlowWarning && !error && (
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 bg-black/85 backdrop-blur-sm rounded-lg px-4 py-2.5 max-w-md text-center border border-yellow-500/30">
          <p className="text-yellow-400 text-xs font-medium mb-0.5">Slow connection detected</p>
          <p className="text-white/70 text-[11px] leading-relaxed">
            The portal server is delivering segments slower than playback speed.
            The player will keep buffering — try a lower-quality channel or wait
            for the buffer to build up.
          </p>
          <button
            onClick={() => setShowSlowWarning(false)}
            className="mt-1.5 text-[10px] text-white/50 hover:text-white/80 underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Bottom controls */}
      {!error && (
        <div
          className={`absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/80 to-transparent transition-opacity ${
            showControls ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <div className="flex items-center gap-2">
            <Button
              size="icon"
              variant="ghost"
              onClick={togglePlay}
              className="h-9 w-9 text-white hover:bg-white/20"
            >
              {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={toggleMute}
              className="h-9 w-9 text-white hover:bg-white/20"
            >
              {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
            </Button>
            <Slider
              value={[muted ? 0 : Math.round(volume * 100)]}
              onValueChange={onVolume}
              max={100}
              step={1}
              className="w-24"
            />
            <div className="ml-auto flex items-center gap-2">
              <span className="text-xs text-white/70 uppercase tracking-wide">{detectedType}</span>
              <Button
                size="icon"
                variant="ghost"
                onClick={toggleFullscreen}
                className="h-9 w-9 text-white hover:bg-white/20"
              >
                <Maximize2 className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
