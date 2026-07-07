'use client'

/**
 * Custom loading spinner — pulsing radio waves emanating from a center dot.
 * Replaces the generic Loader2 with something on-theme for an IPTV player.
 */
export function RadioSpinner({ size = 32 }: { size?: number }) {
  return (
    <div
      className="relative flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      {/* Center dot */}
      <div
        className="absolute rounded-full bg-white"
        style={{ width: size * 0.2, height: size * 0.2 }}
      />
      {/* Three expanding rings */}
      {[0, 0.6, 1.2].map((delay, i) => (
        <span
          key={i}
          className="absolute rounded-full border-2 border-white/80"
          style={{
            width: size,
            height: size,
            animation: `radio-pulse 1.8s ease-out ${delay}s infinite`,
          }}
        />
      ))}
      <style jsx>{`
        @keyframes radio-pulse {
          0% {
            transform: scale(0.3);
            opacity: 1;
          }
          70% {
            transform: scale(1.2);
            opacity: 0;
          }
          100% {
            transform: scale(1.2);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  )
}
