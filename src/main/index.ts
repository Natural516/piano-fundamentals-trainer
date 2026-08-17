import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { join } from 'node:path'
import { inflateRawSync } from 'node:zlib'

const APP_ID = 'com.piano.fundamentals.trainer'
const INFLATE_RAW_CHANNEL = 'piano:inflate-raw'

ipcMain.handle(INFLATE_RAW_CHANNEL, (_event, input: Uint8Array) => {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input)
  return Uint8Array.from(inflateRawSync(bytes))
})

app.commandLine.appendSwitch('enable-features', 'WebMIDI')

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1536,
    height: 864,
    minWidth: 1366,
    minHeight: 768,
    backgroundColor: '#080b13',
    title: '钢琴基本功训练器',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      enableBlinkFeatures: 'WebMIDI'
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedUrl, isMainFrame) => {
    if (isMainFrame && errorCode !== -3) {
      console.error('[main] 页面加载失败', { errorCode, errorDescription, validatedUrl })
    }
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  const loadWindow = process.env.ELECTRON_RENDERER_URL
    ? mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
    : mainWindow.loadFile(join(__dirname, '../renderer/index.html'))

  void loadWindow.catch((error: unknown) => {
    console.error('[main] 无法加载应用窗口', error)
    dialog.showErrorBox('钢琴基本功训练器', '应用页面加载失败，请重新启动软件。')
  })
}

app.whenReady().then(() => {
  app.setAppUserModelId(APP_ID)
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('render-process-gone', (_event, _webContents, details) => {
  console.error('[main] 渲染进程异常退出', details)
})

process.on('unhandledRejection', (reason) => {
  console.error('[main] 未处理的异步异常', reason)
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
