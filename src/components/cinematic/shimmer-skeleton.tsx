'use client'

import { cn } from '@/lib/utils'

export function ShimmerSkeleton({ className }: { className?: string }) {
  return <div className={cn('shimmer rounded-lg', className)} />
}

export function CardSkeleton() {
  return (
    <div className="w-40 shrink-0 space-y-2">
      <ShimmerSkeleton className="aspect-[2/3] w-full" />
      <ShimmerSkeleton className="h-3 w-3/4" />
      <ShimmerSkeleton className="h-2 w-1/2" />
    </div>
  )
}

export function RailSkeleton() {
  return (
    <div className="space-y-3">
      <ShimmerSkeleton className="h-6 w-48" />
      <div className="flex gap-3 overflow-hidden">
        {Array.from({ length: 6 }).map((_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
    </div>
  )
}

export function HeroSkeleton() {
  return (
    <div className="relative h-[50vh] min-h-[400px] w-full overflow-hidden rounded-2xl">
      <ShimmerSkeleton className="absolute inset-0 h-full w-full" />
      <div className="absolute bottom-0 left-0 right-0 p-8 space-y-3">
        <ShimmerSkeleton className="h-10 w-2/3" />
        <ShimmerSkeleton className="h-4 w-1/2" />
        <div className="flex gap-3 pt-2">
          <ShimmerSkeleton className="h-10 w-28" />
          <ShimmerSkeleton className="h-10 w-28" />
        </div>
      </div>
    </div>
  )
}
