import type { HTMLAttributes } from 'react'

type AppCardElement = 'article' | 'aside' | 'div' | 'section'

interface AppCardProps extends HTMLAttributes<HTMLElement> {
  as?: AppCardElement
  interactive?: boolean
}

export function AppCard({
  as: Element = 'section',
  className = '',
  interactive = false,
  ...props
}: AppCardProps): JSX.Element {
  const classes = ['app-card', interactive ? 'is-interactive' : '', className].filter(Boolean).join(' ')

  return <Element className={classes} {...props} />
}
