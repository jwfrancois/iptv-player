'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import Hls, { type LoaderContext, type LoaderResponse } from 'hls.js'
import { Loader2, AlertCircle, Maximize2, Volume2, VolumeX, Play, Pause, Activity, Zap, PictureInPicture2, AudioLines } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { AudioVisualizer } from './audio-visualizer'
import { RadioSpinner } from './radio-spinner'
import { cn } from '@/lib/utils'
import { prefetchFromManifest, getCachedSegmentBlob, clearPrefetchCache, prefetchSegmentUrl } from '@/lib/iptv/client-prefetch'

interface VideoPlayerProps {
  src: string
  poster?: string
  title?: string
  contentType?: 'hls' | 'mp4' | 'ts' | 'auto'
  /** Show audio visualizer overlay (for music channels). */
  showVisualizer?: boolean
}

// Custom fragment loader that uses client-side parallel prefetch cache.
// The CDN rate-limits single connections to ~400KB/s (11s per segment),
// but multiple connections get 1.4MB/s each (3s per segment).
// We prefetch segments in parallel so hls.js gets instant cache hits.
const ParallelPrefetchLoader = class extends Hls.DefaultConfig.loader {
  load(context: LoaderContext, config: any, callbacks: any) {
    // Check if this is a segment (fragment) request
    if (context.url && context.type === 'fragment') {
      const cached = getCachedSegmentBlob(context.url)
      if (cached) {
        // Cache HIT — return the prefetched segment instantly
        const reader = new FileReader()
        reader.onload = () => {
          const data = reader.result as ArrayBuffer
          const stats = {
            loading: { start: performance.now(), first: performance.now(), end: performance.now() },
            retry: 0,
            total: data.byteLength,
            chunkCount: 1,
            bwEstimate: data.byteLength * 8 / 0.001,
          }
          const response: LoaderResponse = { url: context.url, data }
          callbacks.onSuccess(response, stats, context, null as any)
        }
        reader.readAsArrayBuffer(cached)
        return
      }
    }
    // Cache MISS — use the default loader (downloads from CDN)
    super.load(context, config, callbacks)
  }
}

export function VideoPlayer({ src, poster, title, contentType = 'auto', showVisualizer: showVisualizerProp = false }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const hlsRef = useRef<Hls | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const retryCountRef = useRef(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [playing, setPlaying] = useState(false)
  // Start muted on mobile/touch devices for iOS autoplay policy compliance.
  // iOS Safari blocks autoplay with sound unless the user has interacted.
  const [muted, setMuted] = useState(() => {
    if (typeof window === 'undefined') return false
    const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    return isTouch || isIOS
  })
  const [volume, setVolume] = useState(1)
  const [showControls, setShowControls] = useState(true)
  const [bufferHealth, setBufferHealth] = useState(0) // seconds of buffer ahead
  const [buffering, setBuffering] = useState(false)
  const [quality, setQuality] = useState<string>('') // e.g. "720p" or bandwidth
  const [stallCount, setStallCount] = useState(0)
  const [showSlowWarning, setShowSlowWarning] = useState(false)
  // User can toggle visualizer on/off (defaults to prop value, but once user
  // toggles we honor their choice)
  const [visualizerOn, setVisualizerOn] = useState(showVisualizerProp)

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
    retryCountRef.current = 0

    // React doesn't properly set the `muted` attribute on video elements.
    // We must set it via the DOM API. On iOS, autoplay requires muted=true.
    video.muted = muted
    video.volume = volume

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
      // Don't show an error immediately — retry by reloading the video.
      // The browser connects directly to the portal, and transient errors
      // (connection limit, temporary network issues) often resolve on retry.
      retryCountRef.current += 1
      if (retryCountRef.current > 5) {
        setLoading(false)
        setError('Unable to play this stream. Try another channel.')
      } else {
        // Retry after 2s
        setTimeout(() => {
          if (!destroyed) {
            const v = videoRef.current
            if (v) {
              v.load()
              v.play().catch(() => {})
            }
          }
        }, 2000)
      }
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
      // Clear any previous prefetch cache
      clearPrefetchCache()

      if (Hls.isSupported()) {
        const hls = new Hls({
          // Use our custom loader for parallel prefetch
          loader: ParallelPrefetchLoader as any,

          // Worker for performance
          enableWorker: true,
          // CRITICAL: disable low-latency mode. We want a big stable buffer.
          lowLatencyMode: false,

          // Buffer sizing — large target because we parallel-prefetch
          backBufferLength: 60,
          maxBufferLength: 60,          // target 60s forward buffer
          maxMaxBufferLength: 180,      // hard cap 3 min
          maxBufferSize: 150 * 1000 * 1000, // 150MB
          maxBufferHole: 0.5,

          // Live sync
          liveSyncDurationCount: 3,
          liveMaxLatencyDurationCount: 12,

          // Retry logic
          fragLoadingTimeOut: 20000,
          fragLoadingMaxRetry: 6,
          fragLoadingRetryDelay: 500,
          fragLoadingMaxRetryTimeoutMs: 64000,
          manifestLoadingTimeOut: 15000,
          manifestLoadingMaxRetry: 3,
          manifestLoadingRetryDelay: 1000,
          levelLoadingTimeOut: 15000,
          levelLoadingMaxRetry: 4,
          levelLoadingRetryDelay: 1000,

          // ABR
          startLevel: -1,
          abrEwmaDefaultEstimate: 2 * 1000 * 1000,
          abrBandWidthFactor: 0.95,
          abrBandWidthUpFactor: 0.7,
          abrEwmaFastLive: 5.0,

          // Misc
          startFragPrefetch: true,
          testBandwidth: true,
          progressive: false,
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
          // Trigger parallel prefetch of segments from this manifest
          // Fetch the manifest text to get segment URLs
          fetch(src, { cache: 'no-store' })
            .then((res) => res.text())
            .then((text) => {
              if (!destroyed) {
                prefetchFromManifest(src, text)
              }
            })
            .catch(() => {})
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

        // When the live manifest is reloaded, prefetch new segments in parallel
        hls.on(Hls.Events.LEVEL_LOADED, (_evt, data) => {
          if (destroyed) return
          if (data.details && data.details.fragments) {
            // Directly prefetch segment URLs from the loaded level
            const fragUrls = data.details.fragments
              .map((f: any) => f.url)
              .filter((u: any) => u)
            // Prefetch up to 3 segments in parallel (the browser handles
            // the parallel fetch calls)
            for (const u of fragUrls.slice(0, 3)) {
              prefetchSegmentUrl(u)
            }
          }
        })

        hls.on(Hls.Events.ERROR, async (_evt, data) => {
          if (destroyed) return

          // Non-fatal: just log, hls.js will retry
          if (!data.fatal) {
            return
          }

          setLoading(false)

          // For network errors, retry transient issues. Since the browser connects
          // directly to the portal, most errors are transient (connection limit,
          // temporary network issues). Keep retrying — don't show errors unless
          // we've exhausted retries.
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR && data.response) {
            const statusCode = data.response.code
            // 403 = connection limit — retry (transient)
            // 456 = blocked from server IP, but user's browser may succeed — retry
            // 404/401 = permanent, but retry a few times in case it's transient
            retryCountRef.current += 1
            if (retryCountRef.current > 10) {
              // After 10 retries, show a generic error
              if (statusCode === 404) {
                setError('Channel not found or currently offline.')
              } else if (statusCode === 401) {
                setError('Authentication failed. Check your portal credentials.')
              } else {
                setError('Unable to load stream after multiple retries. Try another channel.')
              }
              hls.destroy()
            } else {
              // Retry after 2s — keep buffering
              setTimeout(() => {
                if (!destroyed) hls.startLoad()
              }, 2000)
            }
            return
          }

          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              // Only retry non-403 network errors (timeouts, DNS, etc.)
              // Use a retry counter to avoid infinite loops
              retryCountRef.current += 1
              if (retryCountRef.current > 3) {
                setError('Network error. Channel may be offline — try another channel.')
                hls.destroy()
              } else {
                setError(`Network error. Retrying (${retryCountRef.current}/3)…`)
                setTimeout(() => {
                  if (!destroyed) {
                    setError(null)
                    hls.startLoad()
                  }
                }, 2000)
              }
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
        // Safari/iOS native HLS — preferred on iPhone for best performance
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
    const v = videoRef.current
    if (!el && !v) return

    // iOS Safari only supports fullscreen on the video element via webkit API
    // It does NOT support container.requestFullscreen()
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

    if (isIOS && v) {
      // Use iOS native video fullscreen
      const webkitVideo = v as any
      if (webkitVideo.webkitEnterFullscreen) {
        webkitVideo.webkitEnterFullscreen()
        return
      }
    }

    // Standard fullscreen API (desktop, Android)
    if (document.fullscreenElement) {
      document.exitFullscreen()
    } else if (el?.requestFullscreen) {
      el.requestFullscreen().catch(() => {})
    } else if ((v as any)?.webkitEnterFullscreen) {
      // Fallback for older iOS
      ;(v as any).webkitEnterFullscreen()
    }
  }

  const togglePiP = async () => {
    const v = videoRef.current
    if (!v) return
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture()
      } else if (document.pictureInPictureEnabled && !v.disablePictureInPicture) {
        await v.requestPictureInPicture()
      }
    } catch {
      // PiP not supported or denied — silently ignore
    }
  }

  // Media Session API — iOS lockscreen / Control Center controls
  useEffect(() => {
    if (!('mediaSession' in navigator) || !title) return
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: title,
        artist: 'IPTV Player',
        album: 'Live TV',
        artwork: poster ? [{ src: poster, sizes: '512x512', type: 'image/jpeg' }] : [],
      })
      navigator.mediaSession.setActionHandler('play', () => {
        videoRef.current?.play().catch(() => {})
      })
      navigator.mediaSession.setActionHandler('pause', () => {
        videoRef.current?.pause()
      })
    } catch {}
  }, [title, poster])

  const pipSupported = typeof document !== 'undefined' && document.pictureInPictureEnabled

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
        key={src}
        ref={videoRef}
        poster={poster}
        playsInline
        webkit-playsinline="true"
        autoPlay
        muted={muted}
        className="w-full h-full object-contain animate-cinematic-fade"
        onClick={togglePlay}
      />

      {/* Tap to unmute overlay (mobile/iOS) */}
      {muted && playing && !error && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            const v = videoRef.current
            if (!v) return
            v.muted = false
            setMuted(false)
          }}
          className="absolute top-3 left-1/2 -translate-x-1/2 bg-black/80 backdrop-blur-sm rounded-full px-4 py-2 flex items-center gap-2 text-white text-xs animate-slide-up z-10"
        >
          <VolumeX className="h-4 w-4" />
          Tap to unmute
        </button>
      )}

      {/* Loading / buffering overlay */}
      {(loading || buffering) && !error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none gap-3">
          <div className="bg-black/50 rounded-full p-6">
            <RadioSpinner size={48} />
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
              {showVisualizerProp && (
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setVisualizerOn((v) => !v)}
                  className={cn(
                    'h-9 w-9 text-white hover:bg-white/20',
                    visualizerOn && 'bg-white/20'
                  )}
                  title="Toggle audio visualizer"
                >
                  <AudioLines className="h-5 w-5" />
                </Button>
              )}
              {pipSupported && (
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={togglePiP}
                  className="h-9 w-9 text-white hover:bg-white/20"
                  title="Picture in Picture"
                >
                  <PictureInPicture2 className="h-5 w-5" />
                </Button>
              )}
              <Button
                size="icon"
                variant="ghost"
                onClick={toggleFullscreen}
                className="h-9 w-9 text-white hover:bg-white/20"
                title="Fullscreen"
              >
                <Maximize2 className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Audio visualizer overlay (music channels) */}
      {showVisualizerProp && visualizerOn && !error && (
        <AudioVisualizer videoRef={videoRef} enabled={true} bands={20} />
      )}
    </div>
  )
}
