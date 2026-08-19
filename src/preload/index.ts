import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('pianoApp', {
  platform: process.platform,
  inflateRaw: (bytes: Uint8Array): Promise<Uint8Array> => ipcRenderer.invoke('piano:inflate-raw', bytes),
  secrets: {
    getAiApiKey: () => ipcRenderer.invoke('piano:secret:get-ai-api-key'),
    setAiApiKey: (value: string) => ipcRenderer.invoke('piano:secret:set-ai-api-key', value),
    deleteAiApiKey: () => ipcRenderer.invoke('piano:secret:delete-ai-api-key'),
    hasAiApiKey: () => ipcRenderer.invoke('piano:secret:has-ai-api-key')
  }
})
