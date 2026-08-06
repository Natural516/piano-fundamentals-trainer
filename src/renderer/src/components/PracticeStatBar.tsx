import type { ReactNode } from 'react'

export interface PracticeStatItem {
  label: string
  value: ReactNode
}

interface PracticeStatBarProps {
  items: PracticeStatItem[]
}

export function PracticeStatBar({ items }: PracticeStatBarProps): JSX.Element {
  return (
    <section className="practice-stat-bar" aria-label="实时练习统计">
      {items.map((item) => (
        <div key={item.label} className="practice-stat-bar__item">
          <span>{item.label}</span>
          <strong>{item.value}</strong>
        </div>
      ))}
    </section>
  )
}
