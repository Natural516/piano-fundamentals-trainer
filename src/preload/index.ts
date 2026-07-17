import { contextBridge } from 'electron'

contextBridge.exposeInMainWorld('pianoApp', {
  platform: process.platform
})
