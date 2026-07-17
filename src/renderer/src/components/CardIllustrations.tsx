import type { ReactNode } from 'react'
import type { VisualKind } from '../types'

interface CardIllustrationProps {
  kind: VisualKind
}

function IconShell({ children }: { children: ReactNode }): JSX.Element {
  return (
    <svg className="card-illustration" viewBox="0 0 80 80" aria-hidden="true">
      {children}
    </svg>
  )
}

export function CardIllustration({ kind }: CardIllustrationProps): JSX.Element {
  if (kind === 'staff') {
    return (
      <IconShell>
        <path className="illustration-soft" d="M17 24h46M17 32h46M17 40h46M17 48h46M17 56h46" />
        <path className="illustration-line" d="M36 18v33" />
        <ellipse className="illustration-solid" cx="28" cy="54" rx="9" ry="6" transform="rotate(-18 28 54)" />
        <path className="illustration-line" d="M50 26v26" />
        <ellipse className="illustration-solid" cx="43" cy="55" rx="8" ry="5" transform="rotate(-18 43 55)" />
      </IconShell>
    )
  }

  if (kind === 'metronome') {
    return (
      <IconShell>
        <path className="illustration-line" d="M29 16h22l14 48H15L29 16Z" />
        <path className="illustration-soft" d="M29 58h22M35 26h10M36 34h9M38 42h6" />
        <path className="illustration-line" d="M40 24l9 29" />
        <circle className="illustration-solid" cx="48" cy="47" r="4" />
      </IconShell>
    )
  }

  if (kind === 'stairs') {
    return (
      <IconShell>
        <path className="illustration-line" d="M16 54h38" />
        <path className="illustration-soft" d="M18 54V35M28 54V35M38 54V35M48 54V35" />
        <path className="illustration-line" d="M22 30c12 0 24-8 34-20" />
        <path className="illustration-line" d="M51 10h8v8" />
      </IconShell>
    )
  }

  if (kind === 'rings') {
    return (
      <IconShell>
        <path className="illustration-soft" d="M18 24h44M18 32h44M18 40h44M18 48h44M18 56h44" />
        <circle className="illustration-line" cx="39" cy="28" r="8" />
        <circle className="illustration-line" cx="39" cy="40" r="8" />
        <circle className="illustration-line" cx="39" cy="52" r="8" />
      </IconShell>
    )
  }

  if (kind === 'hands') {
    return (
      <IconShell>
        <path className="illustration-line" d="M18 51c0-12 8-19 18-16M62 51c0-12-8-19-18-16" />
        <path className="illustration-soft" d="M23 33v18M32 27v21M48 27v21M57 33v18" />
        <text x="23" y="65" className="illustration-label">L</text>
        <text x="50" y="65" className="illustration-label">R</text>
      </IconShell>
    )
  }

  return (
    <IconShell>
      <rect className="illustration-line" x="20" y="18" width="40" height="44" rx="8" />
      <path className="illustration-soft" d="M29 31h16M29 41h22M29 51h14" />
      <path className="illustration-line" d="M51 23l8 8-24 24-10 2 2-10 24-24Z" />
    </IconShell>
  )
}
