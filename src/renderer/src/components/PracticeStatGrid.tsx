export interface PracticeStatItem {
  label: string
  value: string | number
}

interface PracticeStatGridProps {
  items: PracticeStatItem[]
  className?: string
}

export function PracticeStatGrid({ items, className = '' }: PracticeStatGridProps): JSX.Element {
  return (
    <div className={`practice-stat-grid ${className}`.trim()}>
      {items.map((item) => (
        <div key={item.label}>
          <span>{item.label}</span>
          <strong>{item.value}</strong>
        </div>
      ))}
    </div>
  )
}

