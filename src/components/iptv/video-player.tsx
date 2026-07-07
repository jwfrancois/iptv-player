'use client'

import { useEffect, useRef, useState } from 'react'
import Hls from 'hls.js'
import { Loader2, AlertCircle, Maximize2, Volume2, VolumeX, Play, Pause } from 'lucide-react'
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
 * error responses. This lets us show "Channel forbidden" instead of generic
 * "Network error".
 */
async function fetchErrorReason(src: string, code: number): Promise<string | null> {
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

    let destroyed = false

    const onLoaded = () => {
      if (destroyed) return
      setLoading(false)
      video.play().catch(() => {})
    }
    const onPlaying = () => {
      if (destroyed) return
      setLoading(false)
      setPlaying(true)
    }
    const onPause = () => {
      if (!destroyed) setPlaying(false)
    }
    const onWaiting = () => {
      if (!destroyed) setLoading(true)
    }
    const onError = () => {
      if (destroyed) return
      setLoading(false)
      setError('Playback error. The stream may be offline or geo-restricted.')
    }

    video.addEventListener('loadeddata', onLoaded)
    video.addEventListener('playing', onPlaying)
    video.addEventListener('pause', onPause)
    video.addEventListener('waiting', onWaiting)
    video.addEventListener('error', onError)

    if (detectedType === 'hls') {
      if (hlsRef.current) {
        hlsRef.current.destroy()
        hlsRef.current = null
      }
      if (Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: true,
          backBufferLength: 30,
        })
        hlsRef.current = hls
        hls.loadSource(src)
        hls.attachMedia(video)
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          if (destroyed) return
          video.play().catch(() => {})
        })
        hls.on(Hls.Events.ERROR, async (_evt, data) => {
          if (destroyed) return
          if (data.fatal) {
            setLoading(false)
            // For network errors, try to fetch a meaningful reason from our proxy
            if (data.type === Hls.ErrorTypes.NETWORK_ERROR && data.response) {
              const customReason = await fetchErrorReason(src, data.response.code)
              if (customReason) {
                setError(customReason)
                hls.destroy()
                return
              }
            }
            switch (data.type) {
              case Hls.ErrorTypes.NETWORK_ERROR:
                setError('Network error loading stream. The channel may be offline or geo-restricted.')
                break
              case Hls.ErrorTypes.MEDIA_ERROR:
                setError('Media error. Trying to recover…')
                hls.recoverMediaError()
                break
              default:
                setError('Fatal playback error. Stream may be unavailable.')
                hls.destroy()
                break
            }
          }
        })
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = src
      } else {
        setError('HLS playback not supported in this browser.')
      }
    } else {
      video.src = src
    }

    return () => {
      destroyed = true
      video.removeEventListener('loadeddata', onLoaded)
      video.removeEventListener('playing', onPlaying)
      video.removeEventListener('pause', onPause)
      video.removeEventListener('waiting', onWaiting)
      video.removeEventListener('error', onError)
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

      {loading && !error && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="bg-black/60 rounded-full p-4">
            <Loader2 className="h-8 w-8 animate-spin text-white" />
          </div>
        </div>
      )}

      {error && (
        <div className="absolute inset-0 flex items-center justify-center p-6">
          <div className="bg-black/80 rounded-lg p-6 max-w-md text-center">
            <AlertCircle className="h-10 w-10 text-red-500 mx-auto mb-3" />
            <p className="text-white text-sm">{error}</p>
          </div>
        </div>
      )}

      {title && !error && (
        <div
          className={`absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/80 to-transparent transition-opacity ${
            showControls ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <p className="text-white text-sm font-medium truncate">{title}</p>
        </div>
      )}

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
