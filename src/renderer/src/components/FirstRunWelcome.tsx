import { useState } from 'react'
import { completeFirstRun } from '../storage/firstRun'
import { AppButton } from './AppButton'

interface FirstRunWelcomeProps {
  onClose: () => void
}

const STEPS = [
  { title: '欢迎', body: '欢迎使用钢琴基本功训练器。本向导只需一次。' },
  { title: 'MIDI 设备', body: '连接 Roland FP-30X 等 MIDI 键盘后，在侧栏选择设备开始识别。' },
  { title: '钢琴发声', body: '默认使用内置钢琴采样发声；也可关闭软件内发声，MIDI 识别与训练仍会正常工作。' },
  { title: '练习目标', body: '从识谱、节奏、和弦或自由练习开始，建立每日稳定练习。' }
]

export function FirstRunWelcome({ onClose }: FirstRunWelcomeProps): JSX.Element {
  const [stepIndex, setStepIndex] = useState(0)
  const step = STEPS[stepIndex]

  const finish = (): void => {
    completeFirstRun()
    onClose()
  }

  return (
    <div className="first-run-backdrop">
      <section className="first-run-card" role="dialog" aria-modal="true" aria-labelledby="first-run-title">
        <span className="eyebrow">首次使用 · {stepIndex + 1}/{STEPS.length}</span>
        <h3 id="first-run-title">{step.title}</h3>
        <p>{step.body}</p>
        <div className="first-run-actions">
          {stepIndex > 0 ? <AppButton variant="ghost" onClick={() => setStepIndex((index) => index - 1)}>上一步</AppButton> : null}
          {stepIndex < STEPS.length - 1 ? (
            <AppButton onClick={() => setStepIndex((index) => index + 1)}>下一步</AppButton>
          ) : (
            <AppButton onClick={finish}>开始使用</AppButton>
          )}
        </div>
      </section>
    </div>
  )
}
