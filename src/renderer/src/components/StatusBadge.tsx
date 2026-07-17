import type { HTMLAttributes } from 'react'

type StatusTone = 'danger' | 'info' | 'success' | 'warning'

interface StatusBadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: StatusTone
}

export function StatusBadge({ className = '', tone = 'info', ...props }: StatusBadgeProps): JSX.Element {
  const classes = ['app-status-badge', `app-status-${tone}`, className].filter(Boolean).join(' ')

  return <span className={classes} {...props} />
}
