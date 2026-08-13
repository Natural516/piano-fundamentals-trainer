export const FIRST_RUN_STORAGE_KEY = 'piano-trainer.first-run.v1'

export function isFirstRun(storage: Pick<Storage, 'getItem'> = window.localStorage): boolean {
  try {
    return storage.getItem(FIRST_RUN_STORAGE_KEY) !== 'completed'
  } catch {
    return true
  }
}

export function completeFirstRun(storage: Pick<Storage, 'setItem'> = window.localStorage): void {
  try {
    storage.setItem(FIRST_RUN_STORAGE_KEY, 'completed')
  } catch {
    // Non-fatal: the welcome dialog may appear again next launch.
  }
}
