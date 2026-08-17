import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('pianoApp', {
  platform: process.platform,
  inflateRaw: (bytes: Uint8Array): Promise<Uint8Array> => ipcRenderer.invoke('piano:inflate-raw', bytes)
})
