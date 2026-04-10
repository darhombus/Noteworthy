/**
 * Solid-colour book icon rendered as an inline SVG.
 * The spine and cover share the accent colour; pages edge is white.
 */
export default function BookIcon({
  color,
  size = 48,
  className,
}: {
  color: string
  size?: number
  className?: string
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 52"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      {/* Spine */}
      <rect x="2" y="2" width="9" height="48" rx="2.5" fill={color} />
      {/* Spine depth overlay */}
      <rect x="2" y="2" width="9" height="48" rx="2.5" fill="rgba(0,0,0,0.22)" />

      {/* Cover body */}
      <rect x="9" y="2" width="28" height="48" rx="3" fill={color} />

      {/* Spine-to-cover join shadow line */}
      <rect x="10" y="2" width="1.5" height="48" fill="rgba(0,0,0,0.1)" />

      {/* Pages edge — right side */}
      <rect x="34.5" y="6" width="3.5" height="40" rx="1.5" fill="rgba(255,255,255,0.6)" />

      {/* Decorative title lines on cover */}
      <rect x="16" y="16" width="14" height="2.5" rx="1.25" fill="rgba(255,255,255,0.35)" />
      <rect x="16" y="22" width="10" height="1.5" rx="0.75" fill="rgba(255,255,255,0.22)" />
    </svg>
  )
}
