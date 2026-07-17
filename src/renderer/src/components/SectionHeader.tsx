import type { ReactNode } from 'react'

interface SectionHeaderProps {
  eyebrow?: string
  title: string
  description?: string
  action?: ReactNode
  level?: 2 | 3
}

export function SectionHeader({
  action,
  description,
  eyebrow,
  level = 3,
  title
}: SectionHeaderProps): JSX.Element {
  const Heading = level === 2 ? 'h2' : 'h3'

  return (
    <div className="section-header">
      <div>
        {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
        <Heading>{title}</Heading>
        {description ? <p>{description}</p> : null}
      </div>
      {action ? <div>{action}</div> : null}
    </div>
  )
}
