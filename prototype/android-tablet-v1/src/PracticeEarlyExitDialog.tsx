import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

interface ExitControls {
  open: boolean
  isPaused: () => boolean
  pause: () => void
  resume: () => void
  show: () => void
  hide: () => void
}

/** Confirmation owns no judgement or persistence; no decision means no finalization. */
export function usePracticeEarlyExit(controls: ExitControls): { request: () => void; cancel: () => void } {
  const latest = useRef(controls)
  latest.current = controls
  const resumeOnCancel = useRef(false)
  const request = useCallback(() => {
    const current = latest.current
    if (current.open) return
    resumeOnCancel.current = !current.isPaused()
    current.pause()
    current.show()
  }, [])
  const cancel = useCallback(() => {
    const current = latest.current
    current.hide()
    if (resumeOnCancel.current) current.resume()
    resumeOnCancel.current = false
  }, [])
  useEffect(() => {
    const handleBack = (): void => { if (latest.current.open) cancel(); else request() }
    window.addEventListener('practice-request-end', handleBack)
    return () => window.removeEventListener('practice-request-end', handleBack)
  }, [cancel, request])
  return { request, cancel }
}

export function PracticeEarlyExitDialog({ moduleTitle, completed, total, icon, onCancel, onSave, onDiscard }: {
  moduleTitle: string
  completed: number
  total: number | 'endless'
  icon: ReactNode
  onCancel: () => void
  onSave: () => void
  onDiscard: () => void
}): JSX.Element {
  const { t } = useTranslation('practiceExit')
  const [stage, setStage] = useState<'confirm' | 'save-choice'>('confirm')
  const decided = useRef(false)
  const cancel = useCallback(() => { if (!decided.current) onCancel() }, [onCancel])
  useEffect(() => {
    const escape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') { event.preventDefault(); cancel() }
    }
    window.addEventListener('keydown', escape)
    return () => window.removeEventListener('keydown', escape)
  }, [cancel])
  const finish = (action: () => void): void => {
    if (decided.current) return
    decided.current = true
    action()
  }
  const saveChoice = stage === 'save-choice'
  return (
    <div className="early-end-backdrop" onClick={(event) => { if (event.target === event.currentTarget) cancel() }}>
      <section aria-labelledby="practice-early-exit-title" aria-modal="true" className="early-end-dialog" role="dialog" data-exit-stage={stage}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="early-end-dialog__icon">{icon}</span>
          <button className="icon-button subtle" type="button" aria-label={t('cancel')} onClick={cancel}>×</button>
        </div>
        <div>
          <span className="eyebrow">{moduleTitle}</span>
          <h1 id="practice-early-exit-title">{t(saveChoice ? 'saveTitle' : 'endTitle')}</h1>
          <p>{total === 'endless' ? t('progressEndless', { completed }) : t('progressFixed', { completed, total })}<br />{t(saveChoice ? 'saveHelp' : 'endHelp')}</p>
        </div>
        <div className="early-end-dialog__actions">
          {saveChoice ? <>
            <button className="primary-action" type="button" onClick={() => finish(onSave)}>{t('saveEnd')}</button>
            <button className="secondary-action" type="button" onClick={() => finish(onDiscard)}>{t('discardEnd')}</button>
          </> : <>
            <button className="secondary-action" type="button" onClick={cancel}>{t('continuePractice')}</button>
            <button className="primary-action" type="button" onClick={() => setStage('save-choice')}>{t('end')}</button>
          </>}
        </div>
      </section>
    </div>
  )
}
