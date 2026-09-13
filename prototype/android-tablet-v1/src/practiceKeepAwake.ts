import { Capacitor, registerPlugin } from '@capacitor/core'

export type PracticeScreenId =
  | 'sight-active'
  | 'sight-correct'
  | 'sight-wrong'
  | 'sight-timeout'
  | 'chord-practice'
  | string

export interface PracticeKeepAwakePolicyInput {
  readonly appForeground: boolean
  readonly screen: PracticeScreenId
  readonly sightStatus: 'idle' | 'running' | 'finished' | 'stopped'
  readonly sightPaused: boolean
  readonly chordStatus: 'IDLE' | 'RUNNING' | 'SUCCESS_FEEDBACK' | 'SUSPENDED' | 'SESSION_COMPLETE' | 'STOPPED'
}

export function shouldKeepPracticeAwake(input: PracticeKeepAwakePolicyInput): boolean {
  if (!input.appForeground) return false

  const sightPracticeVisible =
    input.screen === 'sight-active'
    || input.screen === 'sight-correct'
    || input.screen === 'sight-wrong'
    || input.screen === 'sight-timeout'

  if (sightPracticeVisible && input.sightStatus === 'running' && !input.sightPaused) return true

  return input.screen === 'chord-practice'
    && (input.chordStatus === 'RUNNING' || input.chordStatus === 'SUCCESS_FEEDBACK')
}

export interface PracticeKeepAwakePort {
  setEnabled(options: { enabled: boolean }): Promise<{ enabled: boolean }>
}

const NativePracticeKeepAwake = registerPlugin<PracticeKeepAwakePort>('PracticeKeepAwake')

/** Serializes and deduplicates the single application-level native screen policy. */
export class PracticeKeepAwakeController {
  private desired = false
  private applied = false
  private dirty = false
  private queue: Promise<void> = Promise.resolve()

  constructor(private readonly port: PracticeKeepAwakePort | null) {}

  get desiredEnabled(): boolean {
    return this.desired
  }

  get appliedEnabled(): boolean {
    return this.applied
  }

  setEnabled(enabled: boolean): Promise<void> {
    this.desired = enabled
    if (!this.dirty && this.applied === enabled) return this.queue
    this.dirty = true
    this.queue = this.queue.then(
      () => this.drain(),
      () => this.drain()
    )
    return this.queue
  }

  dispose(): Promise<void> {
    return this.setEnabled(false)
  }

  private async drain(): Promise<void> {
    while (this.dirty) {
      this.dirty = false
      const target = this.desired
      try {
        if (this.port) {
          const result = await this.port.setEnabled({ enabled: target })
          this.applied = result.enabled === target ? target : false
        } else {
          this.applied = target
        }
      } catch {
        this.applied = false
      }
      if (this.desired !== target) this.dirty = true
    }
  }
}

export function createPracticeKeepAwakeController(): PracticeKeepAwakeController {
  return new PracticeKeepAwakeController(Capacitor.isNativePlatform() ? NativePracticeKeepAwake : null)
}
