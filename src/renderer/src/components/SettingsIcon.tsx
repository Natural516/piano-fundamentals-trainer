interface SettingsIconProps {
  size?: number
}

export function SettingsIcon({ size = 22 }: SettingsIconProps): JSX.Element {
  const toothAngles = [0, 45, 90, 135, 180, 225, 270, 315]

  return (
    <svg aria-hidden="true" fill="none" height={size} viewBox="0 0 24 24" width={size}>
      {toothAngles.map((angle) => (
        <rect
          key={angle}
          height="4.2"
          rx="1.1"
          stroke="currentColor"
          strokeWidth="1.65"
          transform={`rotate(${angle} 12 12)`}
          width="2.4"
          x="10.8"
          y="1.55"
        />
      ))}
      <circle cx="12" cy="12" r="6.45" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="2.65" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  )
}
