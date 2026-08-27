import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

export interface NativeAudioPocEnvironment {
  isPackaged: boolean
  resourcesPath: string
  appPath: string
}

export interface NativeAudioPocSupervisor {
  enabled: boolean
  stop: () => void
}

const POC_ENABLED_ENV = 'PIANO_NATIVE_AUDIO_POC'
const POC_PIPE_ENV = 'PIANO_NATIVE_AUDIO_POC_PIPE'
const POC_HELPER_ENV = 'PIANO_NATIVE_AUDIO_POC_HELPER'
const POC_SAMPLE_ENV = 'PIANO_NATIVE_AUDIO_POC_SAMPLE'

function resolvePocPaths(environment: NativeAudioPocEnvironment): { helper: string; sample: string } {
  const developmentRoot = join(environment.appPath, 'native-audio-poc', 'build', 'Release')
  return {
    helper: process.env[POC_HELPER_ENV] || join(developmentRoot, 'piano_native_audio_poc.exe'),
    sample: process.env[POC_SAMPLE_ENV] || join(developmentRoot, 'C4-48k-f32.pcm')
  }
}

export function startNativeAudioPocSupervisor(
  environment: NativeAudioPocEnvironment
): NativeAudioPocSupervisor {
  if (environment.isPackaged || process.env[POC_ENABLED_ENV] !== '1' || process.platform !== 'win32') {
    delete process.env[POC_PIPE_ENV]
    return { enabled: false, stop: () => undefined }
  }

  const pipe = process.env[POC_PIPE_ENV] || `\\\\.\\pipe\\piano-native-audio-poc-${process.pid}`
  process.env[POC_PIPE_ENV] = pipe
  const { helper, sample } = resolvePocPaths(environment)
  let child: ChildProcessWithoutNullStreams | null = null
  let stopping = false
  let helperCrashes = 0
  let restartTimer: NodeJS.Timeout | null = null

  const launch = (): void => {
    if (stopping) return
    if (!existsSync(helper) || !existsSync(sample)) {
      console.error('[native-audio-poc] POC helper/sample missing; run npm run poc:native-audio:build', {
        helper,
        sample
      })
      return
    }

    child = spawn(helper, ['--pipe', pipe, '--sample', sample], {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe']
    })
    child.stdout.on('data', (chunk: Buffer) => process.stdout.write(chunk))
    child.stderr.on('data', (chunk: Buffer) => process.stderr.write(chunk))
    child.once('error', (error) => {
      console.error('[native-audio-poc] helper process error', error)
    })
    child.once('exit', (code, signal) => {
      child = null
      if (stopping) return
      helperCrashes += 1
      console.error('[native-audio-poc] SUPERVISOR', {
        helperCrashes,
        code,
        signal
      })
      if (helperCrashes <= 3) restartTimer = setTimeout(launch, 500)
    })
  }

  launch()
  return {
    enabled: true,
    stop: () => {
      stopping = true
      if (restartTimer) clearTimeout(restartTimer)
      restartTimer = null
      child?.kill()
      child = null
    }
  }
}
