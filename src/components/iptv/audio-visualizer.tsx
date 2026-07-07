'use client'

import { useEffect, useRef, useState } from 'react'
import { useAudioAnalyzer } from '@/lib/iptv/useAudioAnalyzer'
import { cn } from '@/lib/utils'

interface AudioVisualizerProps {
  videoRef: React.RefObject<HTMLVideoElement | null>
  enabled: boolean
  /** Number of bars to show (we aggregate FFT bins into this many bands). */
  bands?: number
}

/**
 * Classic spectrum-analyzer bars overlaid on the video. Green for low
 * frequencies, yellow for mid, red for high — just like a 90s hi-fi.
 */
export function AudioVisualizer({ videoRef, enabled, bands = 16 }: AudioVisualizerProps) {
  const { bands: fftData, volume, active } = useAudioAnalyzer(videoRef, { enabled, fftSize: 256 })
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [peaks, setPeaks] = useState<number[]>(() => new Array(bands).fill(0))

  // Aggregate FFT bins into `bands` bands (logarithmic spacing for natural look)
  const aggregated = useRef<number[]>(new Array(bands).fill(0))
  useEffect(() => {
    if (!enabled || fftData.length === 0) {
      aggregated.current = new Array(bands).fill(0)
      return
    }
    const arr = aggregated.current
    const totalBins = fftData.length
    // Logarithmic band distribution: more resolution in low freqs
    for (let i = 0; i < bands; i++) {
      const lo = Math.floor(Math.pow(totalBins, i / bands))
      const hi = Math.floor(Math.pow(totalBins, (i + 1) / bands))
      let max = 0
      for (let j = lo; j <= hi && j < totalBins; j++) {
        if (fftData[j] > max) max = fftData[j]
      }
      // Smooth: 70% previous, 30% new — gives that "falling" look
      arr[i] = arr[i] * 0.7 + (max / 255) * 0.3
    }
  }, [fftData, enabled, bands])

  // Draw on canvas for performance
  useEffect(() => {
    if (!enabled) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let raf: number
    const draw = () => {
      const w = canvas.width
      const h = canvas.height
      ctx.clearRect(0, 0, w, h)

      const arr = aggregated.current
      const barWidth = w / bands
      const gap = Math.max(1, barWidth * 0.15)
      const bw = barWidth - gap

      // Update peak hold values
      setPeaks((prev) => {
        const next = [...prev]
        for (let i = 0; i < bands; i++) {
          if (arr[i] > next[i]) next[i] = arr[i]
          else next[i] = Math.max(0, next[i] - 0.008) // slow fall
        }
        return next
      })

      for (let i = 0; i < bands; i++) {
        const v = arr[i]
        const barHeight = v * h * 0.9
        const x = i * barWidth + gap / 2
        const y = h - barHeight

        // Gradient: green at bottom, yellow in middle, red at top
        const grad = ctx.createLinearGradient(0, h, 0, 0)
        grad.addColorStop(0, '#22c55e')     // green-500
        grad.addColorStop(0.6, '#eab308')   // yellow-500
        grad.addColorStop(0.85, '#f97316')  // orange-500
        grad.addColorStop(1, '#ef4444')     // red-500
        ctx.fillStyle = grad
        ctx.fillRect(x, y, bw, barHeight)

        // Peak hold marker (white line)
        const peakY = h - peaks[i] * h * 0.9
        if (peaks[i] > 0.05) {
          ctx.fillStyle = 'rgba(255,255,255,0.7)'
          ctx.fillRect(x, peakY - 1, bw, 2)
        }
      }

      raf = requestAnimationFrame(draw)
    }
    draw()
    return () => cancelAnimationFrame(raf)
  }, [enabled, bands, peaks])

  if (!enabled) return null

  return (
    <div
      className={cn(
        'absolute inset-x-0 bottom-0 pointer-events-none transition-opacity duration-300',
        active ? 'opacity-90' : 'opacity-0'
      )}
    >
      <canvas
        ref={canvasRef}
        width={800}
        height={80}
        className="w-full h-16"
      />
      {/* Reflection / glow */}
      <div className="absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-black/40 to-transparent" />
    </div>
  )
}
