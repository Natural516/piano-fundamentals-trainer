export type ActivePracticeModule = 'sight' | 'chord'

export interface ActivePracticeSession {
  readonly id: string
  readonly generation: number
  readonly module: ActivePracticeModule
  readonly practiceScreen: string
  readonly finalized: boolean
}

interface AuxiliaryReturnContext {
  readonly auxiliaryScreen: string
  readonly originScreen: string
  readonly sessionId: string | null
}

function cloneSession(session: ActivePracticeSession | null): ActivePracticeSession | null {
  return session ? Object.freeze({ ...session }) : null
}

/**
 * Process-local owner for one logical active practice session. It owns only
 * identity, finalization and navigation attachment metadata; module runtimes
 * continue to own judgement, timers and facts.
 */
export class ActivePracticeSessionHost {
  private generation = 0
  private currentValue: ActivePracticeSession | null = null
  private returnContext: AuxiliaryReturnContext | null = null
  private readonly finalizedSessionIds = new Set<string>()

  get current(): ActivePracticeSession | null {
    return cloneSession(this.currentValue)
  }

  begin(module: ActivePracticeModule, practiceScreen: string): ActivePracticeSession {
    const generation = ++this.generation
    this.currentValue = Object.freeze({
      id: `${module}-${generation}`,
      generation,
      module,
      practiceScreen,
      finalized: false
    })
    this.returnContext = null
    return this.current!
  }

  rememberAuxiliaryReturn(originScreen: string, auxiliaryScreen: string): void {
    this.returnContext = Object.freeze({
      auxiliaryScreen,
      originScreen,
      sessionId: this.currentValue?.id ?? null
    })
  }

  consumeAuxiliaryReturn(auxiliaryScreen: string, fallbackScreen: string): string {
    const context = this.returnContext
    if (!context || context.auxiliaryScreen !== auxiliaryScreen) return fallbackScreen
    this.returnContext = null
    if (context.sessionId !== null && context.sessionId !== this.currentValue?.id) return fallbackScreen
    return context.originScreen
  }

  finalize(sessionId: string): boolean {
    if (this.finalizedSessionIds.has(sessionId)) return false
    if (!this.currentValue || this.currentValue.id !== sessionId) return false
    this.finalizedSessionIds.add(sessionId)
    this.currentValue = Object.freeze({ ...this.currentValue, finalized: true })
    return true
  }

  end(sessionId: string): boolean {
    const finalizedNow = this.finalize(sessionId)
    if (!this.currentValue || this.currentValue.id !== sessionId) return finalizedNow
    this.currentValue = null
    this.returnContext = null
    return finalizedNow
  }

  isFinalized(sessionId: string): boolean {
    return this.finalizedSessionIds.has(sessionId)
  }
}
