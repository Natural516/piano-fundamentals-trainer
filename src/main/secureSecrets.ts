import { app, safeStorage } from 'electron'
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

interface SecureSecretFile {
  version: 1
  values: Record<string, string>
}

export interface SecureSecretResult<T = null> {
  success: boolean
  value?: T
  configured?: boolean
  reason?: 'encryption_unavailable' | 'read_failed' | 'write_failed' | 'decrypt_failed'
  error?: string
}

const SECRET_FILE_NAME = 'secure-secrets.v1.json'
const AI_API_KEY_NAME = 'aiApiKey'

function secretFilePath(): string {
  return join(app.getPath('userData'), SECRET_FILE_NAME)
}

function emptyFile(): SecureSecretFile {
  return { version: 1, values: {} }
}

function readSecretFile(): SecureSecretResult<SecureSecretFile> {
  try {
    const raw = readFileSync(secretFilePath(), 'utf8')
    const parsed = JSON.parse(raw) as Partial<SecureSecretFile>
    if (parsed.version !== 1 || !parsed.values || typeof parsed.values !== 'object') {
      return { success: true, value: emptyFile() }
    }
    return { success: true, value: { version: 1, values: parsed.values as Record<string, string> } }
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : ''
    if (code === 'ENOENT') return { success: true, value: emptyFile() }
    return { success: false, reason: 'read_failed', error: error instanceof Error ? error.message : String(error) }
  }
}

function writeSecretFile(state: SecureSecretFile): SecureSecretResult {
  const target = secretFilePath()
  const temporary = `${target}.tmp`
  try {
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(temporary, JSON.stringify(state), { encoding: 'utf8', mode: 0o600 })
    renameSync(temporary, target)
    return { success: true }
  } catch (error) {
    try {
      rmSync(temporary, { force: true })
    } catch {
      // A failed cleanup must not mask the original storage failure.
    }
    return { success: false, reason: 'write_failed', error: error instanceof Error ? error.message : String(error) }
  }
}

export function setAiApiKey(value: string): SecureSecretResult {
  if (!safeStorage.isEncryptionAvailable()) return { success: false, reason: 'encryption_unavailable' }
  const current = readSecretFile()
  if (!current.success || !current.value) {
    return { success: false, reason: current.reason ?? 'read_failed', error: current.error }
  }
  const next: SecureSecretFile = { ...current.value, values: { ...current.value.values } }
  if (value) next.values[AI_API_KEY_NAME] = safeStorage.encryptString(value).toString('base64')
  else delete next.values[AI_API_KEY_NAME]
  return writeSecretFile(next)
}

export function getAiApiKey(): SecureSecretResult<string> {
  if (!safeStorage.isEncryptionAvailable()) return { success: false, reason: 'encryption_unavailable' }
  const current = readSecretFile()
  if (!current.success || !current.value) {
    return { success: false, reason: current.reason ?? 'read_failed', error: current.error }
  }
  const encrypted = current.value.values[AI_API_KEY_NAME]
  if (!encrypted) return { success: true, value: '', configured: false }
  try {
    return {
      success: true,
      value: safeStorage.decryptString(Buffer.from(encrypted, 'base64')),
      configured: true
    }
  } catch (error) {
    return { success: false, reason: 'decrypt_failed', error: error instanceof Error ? error.message : String(error) }
  }
}

export function deleteAiApiKey(): SecureSecretResult {
  return setAiApiKey('')
}

export function hasAiApiKey(): SecureSecretResult {
  const current = readSecretFile()
  if (!current.success || !current.value) {
    return { success: false, reason: current.reason ?? 'read_failed', error: current.error }
  }
  return { success: true, configured: Boolean(current.value.values[AI_API_KEY_NAME]) }
}
