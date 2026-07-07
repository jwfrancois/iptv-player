'use client'

import { useEffect, useRef, useState } from 'react'

interface AudioAnalyzerOptions {
  enabled: boolean
  /** FFT size — must be power of 2. 256 = fast, 1024 = detailed. */
  fftSize?: 256 | 512 | 1024 | 2048
  /** Smoothing time constant 0-1. Higher = smoother bars. */
  smoothing?: number
}

export interface AudioData {
  /** Array of 0-255 values representing volume at each frequency band. */
  bands: Uint8Array
  /** Overall volume 0-1. */
  volume: number
  /** True if audio is actually flowing (not silent). */
  active: boolean
}

/**
 * Hook that taps into a video element's audio via Web Audio API and provides
 * real-time frequency data for visualization.
 *
 * NOTE: Browsers require user interaction before Web Audio can start. We
 * attempt to resume the AudioContext on first play.
 */
export function useAudioAnalyzer(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  { enabled, fftSize = 256, smoothing = 0.8 }: AudioAnalyzerOptions
) {
  const [data, setData] = useState<AudioData>({ bands: new Uint8Array(0), volume: 0, active: false })
  const audioCtxRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null)
  const rafRef = useRef<number | null>(null)
  const videoElRef = videoRef

  // Setup audio graph when enabled and video is ready
  useEffect(() => {
    if (!enabled) {
      // Cleanup
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
      if (sourceRef.current) {
        try { sourceRef.current.disconnect() } catch {}
        sourceRef.current = null
      }
      if (analyserRef.current) {
        try { analyserRef.current.disconnect() } catch {}
        analyserRef.current = null
      }
      return
    }

    const video = videoElRef.current
    if (!video) return

    // Lazily create AudioContext (must be after user gesture)
    if (!audioCtxRef.current) {
      try {
        const AC = window.AudioContext || (window as any).webkitAudioContext
        if (!AC) return
        audioCtxRef.current = new AC()
      } catch {
        return
      }
    }
    const ctx = audioCtxRef.current!

    // Resume if suspended (browser autoplay policy)
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {})
    }

    // Create analyser if not exists
    if (!analyserRef.current) {
      analyserRef.current = ctx.createAnalyser()
      analyserRef.current.fftSize = fftSize
      analyserRef.current.smoothingTimeConstant = smoothing
    }

    // Connect video → analyser → destination (only once per video element)
    // We detect by checking if we already have a source for THIS element.
    if (!sourceRef.current) {
      try {
        sourceRef.current = ctx.createMediaElementSource(video)
        sourceRef.current.connect(analyserRef.current)
        analyserRef.current.connect(ctx.destination)
      } catch (e) {
        // Already connected — that's fine
      }
    }

    const analyser = analyserRef.current
    const bands = new Uint8Array(analyser.frequencyBinCount)

    const tick = () => {
      analyser.getByteFrequencyData(bands)
      // Compute volume as average of bands
      let sum = 0
      for (let i = 0; i < bands.length; i++) sum += bands[i]
      const avg = sum / bands.length / 255
      setData({
        bands: new Uint8Array(bands), // copy to avoid mutation
        volume: avg,
        active: avg > 0.01,
      })
      rafRef.current = requestAnimationFrame(tick)
    }
    tick()

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }, [enabled, fftSize, smoothing, videoElRef])

  return data
}
