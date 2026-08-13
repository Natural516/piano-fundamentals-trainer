import { useEffect, useRef, useState } from 'react'

interface NumericStepperProps {
  value: number
  min: number
  max: number
  step: number
  disabled?: boolean
  onChange: (value: number) => void
}

function clampToStep(value: number, min: number, max: number, step: number): number {
  const clamped = Math.min(max, Math.max(min, value))
  const steps = Math.round((clamped - min) / step)
  return Math.min(max, Math.max(min, min + steps * step))
}

export function NumericStepper({
  value,
  min,
  max,
  step,
  disabled = false,
  onChange
}: NumericStepperProps): JSX.Element {
  const [draft, setDraft] = useState(String(value))
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (document.activeElement !== inputRef.current) setDraft(String(value))
  }, [value])

  const commit = (): void => {
    const normalizedDraft = draft.trim()
    if (!/^\d+$/.test(normalizedDraft)) {
      setDraft(String(value))
      return
    }

    const parsed = Number(normalizedDraft)
    const nextValue = clampToStep(parsed, min, max, step)
    setDraft(String(nextValue))
    if (nextValue !== value) onChange(nextValue)
  }

  return (
    <div className="numeric-stepper">
      <input
        ref={inputRef}
        type="text"
        aria-label="BPM 数值"
        disabled={disabled}
        inputMode="numeric"
        value={draft}
        onBlur={commit}
        onClick={(event) => event.currentTarget.select()}
        onChange={(event) => setDraft(event.target.value)}
        onFocus={(event) => event.currentTarget.select()}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            commit()
            inputRef.current?.select()
          } else if (event.key === 'Escape') {
            setDraft(String(value))
            inputRef.current?.select()
          }
        }}
      />
    </div>
  )
}
