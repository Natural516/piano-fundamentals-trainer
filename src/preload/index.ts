import { contextBridge, ipcRenderer } from 'electron'
import { createNativeAudioPocBridge } from './nativeAudioPocBridge'

const nativeAudioPoc = createNativeAudioPocBridge()

contextBridge.exposeInMainWorld('pianoApp', {
  platform: process.platform,
  inflateRaw: (bytes: Uint8Array): Promise<Uint8Array> => ipcRenderer.invoke('piano:inflate-raw', bytes),
  pianoSamples: {
    readFile: (relativePath: string) => ipcRenderer.invoke('piano:samples:read', relativePath)
  },
  nativeAudioPoc: {
    enabled: nativeAudioPoc.enabled,
    noteOn: nativeAudioPoc.noteOn,
    requestReport: nativeAudioPoc.requestReport,
    status: nativeAudioPoc.status
  },
  midiLifecycle: {
    onPowerEvent: (callback: (event: 'suspend' | 'resume') => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, powerEvent: unknown): void => {
        if (powerEvent === 'suspend' || powerEvent === 'resume') callback(powerEvent)
      }
      ipcRenderer.on('piano:midi:power-event', listener)
      return () => ipcRenderer.removeListener('piano:midi:power-event', listener)
    }
  },
  secrets: {
    getAiApiKey: () => ipcRenderer.invoke('piano:secret:get-ai-api-key'),
    setAiApiKey: (value: string) => ipcRenderer.invoke('piano:secret:set-ai-api-key', value),
    deleteAiApiKey: () => ipcRenderer.invoke('piano:secret:delete-ai-api-key'),
    hasAiApiKey: () => ipcRenderer.invoke('piano:secret:has-ai-api-key')
  }
})
