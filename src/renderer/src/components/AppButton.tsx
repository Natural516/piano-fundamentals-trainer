import type { ButtonHTMLAttributes } from 'react'

type AppButtonVariant = 'ghost' | 'primary' | 'secondary'
type AppButtonTone = 'blue' | 'cyan' | 'gold' | 'indigo' | 'pink' | 'purple'

interface AppButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: AppButtonVariant
  tone?: AppButtonTone
}

export function AppButton({
  className = '',
  tone,
  type = 'button',
  variant = 'primary',
  ...props
}: AppButtonProps): JSX.Element {
  const classes = [
    'app-button',
    `app-button-${variant}`,
    tone ? `app-button-tone-${tone}` : '',
    className
  ]
    .filter(Boolean)
    .join(' ')

  return <button className={classes} type={type} {...props} />
}
