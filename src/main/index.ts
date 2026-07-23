import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  nativeTheme,
  screen,
  shell,
  Tray
} from 'electron'
import squirrelStartup from 'electron-squirrel-startup'
import { basename, extname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { IPC } from '../shared/ipc'
import type {
  DetailInput,
  DocumentInput,
  DocumentMetadataInput,
  ImportMode,
  NavigationTarget,
  Page,
  PreferencesInput,
  ProfileInput,
  VaultState
} from '../shared/types'
import { VaultService } from './vault-service'
import { SystemWidgetService } from './system-widget'

let mainWindow: BrowserWindow | null = null
let widgetWindow: BrowserWindow | null = null
let tray: Tray | null = null
let vault: VaultService
let isQuitting = false
let vaultOperations: Promise<void> = Promise.resolve()
let pendingDeepLink: string | null = null

const isMac = process.platform === 'darwin'
const systemWidget = new SystemWidgetService()
const protocolScheme = 'idvault'

if (squirrelStartup) app.quit()

function serializeVaultOperation<T>(operation: () => Promise<T>): Promise<T> {
  const result = vaultOperations.then(operation)
  vaultOperations = result.then(
    () => undefined,
    () => undefined
  )
  return result
}

function afterVaultOperations<T>(operation: () => T | Promise<T>): Promise<T> {
  return vaultOperations.then(operation)
}

function isAllowedRendererUrl(value: string): boolean {
  try {
    const candidate = new URL(value)
    if (process.env.ELECTRON_RENDERER_URL) {
      const development = new URL(process.env.ELECTRON_RENDERER_URL)
      return candidate.origin === development.origin && candidate.pathname === development.pathname
    }
    const packaged = pathToFileURL(join(__dirname, '../renderer/index.html'))
    return candidate.protocol === 'file:' && candidate.pathname === packaged.pathname
  } catch {
    return false
  }
}

function assertTrustedIpc(event: Electron.IpcMainInvokeEvent): void {
  const senderIsWindow = [mainWindow, widgetWindow].some(
    (window) => window && !window.isDestroyed() && window.webContents.id === event.sender.id
  )
  if (
    !senderIsWindow ||
    event.senderFrame !== event.sender.mainFrame ||
    !event.senderFrame ||
    !isAllowedRendererUrl(event.senderFrame.url)
  ) {
    throw new Error('This request did not come from ID Vault.')
  }
}

function registerHandler(
  channel: string,
  handler: (event: Electron.IpcMainInvokeEvent, ...args: any[]) => unknown
): void {
  ipcMain.handle(channel, (event, ...args) => {
    assertTrustedIpc(event)
    return handler(event, ...args)
  })
}

function usesDarkChrome(state = vault?.get()): boolean {
  const mode = state?.preferences.colorMode ?? 'system'
  return mode === 'dark' || (mode === 'system' && nativeTheme.shouldUseDarkColors)
}

function syncWindowChrome(state = vault?.get()): void {
  if (isMac || !mainWindow || mainWindow.isDestroyed()) return
  const dark = usesDarkChrome(state)
  mainWindow.setTitleBarOverlay({
    color: dark ? '#161815' : '#f6f6f4',
    symbolColor: dark ? '#f3f4f0' : '#181a18',
    height: 52
  })
}

function showSaveDialog(options: Electron.SaveDialogOptions): Promise<Electron.SaveDialogReturnValue> {
  return mainWindow ? dialog.showSaveDialog(mainWindow, options) : dialog.showSaveDialog(options)
}

function showOpenDialog(options: Electron.OpenDialogOptions): Promise<Electron.OpenDialogReturnValue> {
  return mainWindow ? dialog.showOpenDialog(mainWindow, options) : dialog.showOpenDialog(options)
}

function broadcast(state: VaultState): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send(IPC.changed, state)
  }
}

function publishState(state: VaultState): void {
  broadcast(state)
  void systemWidget.publish(state).catch((error: unknown) => {
    console.error('Unable to update the macOS widget:', error)
  })
}

function targetFromDeepLink(value: string): NavigationTarget | undefined {
  try {
    const url = new URL(value)
    if (url.protocol !== `${protocolScheme}:` || url.hostname !== 'open') return undefined
    const view = url.searchParams.get('view')
    const page = view && ['overview', 'details', 'documents', 'settings'].includes(view)
      ? (view as Page)
      : 'overview'
    const id = url.searchParams.get('id')?.toLowerCase()
    const itemId =
      (page === 'details' || page === 'documents') &&
      id &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id)
        ? id
        : undefined
    return { page, itemId }
  } catch {
    return undefined
  }
}

function handleDeepLink(value: string): void {
  const target = targetFromDeepLink(value)
  if (!target) return
  if (!app.isReady() || !vault) {
    pendingDeepLink = value
    return
  }
  showMain(target)
}

function deepLinkFromArguments(argumentsList: string[]): string | undefined {
  return argumentsList.find((argument) => argument.startsWith(`${protocolScheme}://`))
}

function secureWindow(window: BrowserWindow): void {
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event, url) => {
    if (isAllowedRendererUrl(url)) return
    event.preventDefault()
  })
  window.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false)
  })
}

function loadRenderer(window: BrowserWindow, view: 'main' | 'widget'): void {
  const query = view === 'widget' ? { view: 'widget' } : undefined
  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(
      `${process.env.ELECTRON_RENDERER_URL}${view === 'widget' ? '?view=widget' : ''}`
    )
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'), { query })
  }
}

function createMainWindow(): BrowserWindow {
  if (mainWindow && !mainWindow.isDestroyed()) return mainWindow

  mainWindow = new BrowserWindow({
    width: 1240,
    height: 820,
    minWidth: 900,
    minHeight: 640,
    show: false,
    backgroundColor: usesDarkChrome() ? '#161815' : '#f6f6f4',
    title: 'ID Vault',
    titleBarStyle: isMac ? 'hiddenInset' : 'hidden',
    trafficLightPosition: isMac ? { x: 18, y: 17 } : undefined,
    titleBarOverlay: !isMac
      ? usesDarkChrome()
        ? { color: '#161815', symbolColor: '#f3f4f0', height: 52 }
        : { color: '#f6f6f4', symbolColor: '#181a18', height: 52 }
      : undefined,
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false
    }
  })

  secureWindow(mainWindow)
  loadRenderer(mainWindow, 'main')
  mainWindow.once('ready-to-show', () => mainWindow?.show())
  mainWindow.on('closed', () => {
    mainWindow = null
  })
  return mainWindow
}

function positionWidget(): void {
  if (!widgetWindow) return
  const cursor = screen.getCursorScreenPoint()
  const display = screen.getDisplayNearestPoint(cursor)
  const bounds = widgetWindow.getBounds()
  const trayBounds = tray?.getBounds()
  const anchorX = trayBounds && trayBounds.width > 0 ? trayBounds.x + trayBounds.width / 2 : cursor.x
  const anchorY = trayBounds && trayBounds.height > 0 ? trayBounds.y + trayBounds.height : cursor.y
  const x = Math.round(
    Math.min(
      Math.max(anchorX - bounds.width / 2, display.workArea.x + 12),
      display.workArea.x + display.workArea.width - bounds.width - 12
    )
  )
  const placeBelow = anchorY < display.workArea.y + display.workArea.height / 2
  const y = placeBelow
    ? Math.min(anchorY + 8, display.workArea.y + display.workArea.height - bounds.height - 12)
    : Math.max(anchorY - bounds.height - 8, display.workArea.y + 12)
  widgetWindow.setPosition(x, Math.round(y), false)
}

function createWidgetWindow(): BrowserWindow {
  if (widgetWindow && !widgetWindow.isDestroyed()) return widgetWindow

  widgetWindow = new BrowserWindow({
    width: 376,
    height: 524,
    minWidth: 340,
    minHeight: 420,
    maxWidth: 460,
    maxHeight: 720,
    show: false,
    frame: false,
    transparent: isMac,
    backgroundColor: isMac ? '#00000000' : '#f7f7f4',
    resizable: true,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: vault.get().preferences.widgetAlwaysOnTop,
    hasShadow: true,
    type: isMac ? 'panel' : undefined,
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false
    }
  })

  secureWindow(widgetWindow)
  loadRenderer(widgetWindow, 'widget')
  widgetWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  widgetWindow.on('blur', () => {
    if (!vault.get().preferences.widgetAlwaysOnTop && !widgetWindow?.webContents.isDevToolsOpened()) {
      widgetWindow?.hide()
    }
  })
  widgetWindow.on('closed', () => {
    widgetWindow = null
  })
  return widgetWindow
}

function showWidget(): void {
  const window = createWidgetWindow()
  positionWidget()
  window.show()
  window.focus()
}

function toggleWidget(): void {
  if (widgetWindow?.isVisible()) widgetWindow.hide()
  else showWidget()
}

function showMain(destination?: Page | NavigationTarget): void {
  const window = createMainWindow()
  if (window.isMinimized()) window.restore()
  window.show()
  window.focus()
  const target =
    typeof destination === 'string' ? { page: destination } : destination
  if (target && ['overview', 'details', 'documents', 'settings'].includes(target.page)) {
    if (window.webContents.isLoading()) {
      window.webContents.once('did-finish-load', () => window.webContents.send(IPC.navigate, target))
    } else {
      window.webContents.send(IPC.navigate, target)
    }
  }
}

function createTray(): void {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18">
      <path d="M9 1.5 15 3.7v4.7c0 4.4-2.55 7.3-6 8.7-3.45-1.4-6-4.3-6-8.7V3.7L9 1.5Z" fill="none" stroke="#111" stroke-width="1.35" stroke-linejoin="round"/>
      <path d="m5.8 8.7 2.15 2.1 4.25-4.6" fill="none" stroke="#111" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`
  const icon = nativeImage.createFromDataURL(
    `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
  )
  if (isMac) icon.setTemplateImage(true)
  tray = new Tray(icon.resize({ width: 18, height: 18 }))
  tray.setToolTip('ID Vault')
  tray.on('click', toggleWidget)
  tray.on('right-click', () => tray?.popUpContextMenu())
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open ID Vault', click: () => showMain() },
      { label: 'Quick Access', click: toggleWidget },
      { type: 'separator' },
      { label: 'Quit', role: 'quit' }
    ])
  )
}

function createApplicationMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' as const },
              { type: 'separator' as const },
              { role: 'services' as const },
              { type: 'separator' as const },
              { role: 'hide' as const },
              { role: 'hideOthers' as const },
              { role: 'unhide' as const },
              { type: 'separator' as const },
              { role: 'quit' as const }
            ]
          }
        ]
      : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'Add item',
          accelerator: 'CmdOrCtrl+N',
          click: () => {
            showMain()
            mainWindow?.webContents.send(IPC.quickAdd)
          }
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' }
      ]
    },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function registerIpc(): void {
  registerHandler(IPC.getVault, () => afterVaultOperations(() => vault.get()))
  registerHandler(IPC.saveDetail, (_event, input: DetailInput) =>
    serializeVaultOperation(() => vault.saveDetail(input))
  )
  registerHandler(IPC.removeDetail, (_event, id: string) =>
    serializeVaultOperation(() => vault.removeDetail(id))
  )
  registerHandler(IPC.updateProfile, (_event, input: ProfileInput) =>
    serializeVaultOperation(() => vault.updateProfile(input))
  )
  registerHandler(IPC.updatePreferences, (_event, input: PreferencesInput) =>
    serializeVaultOperation(async () => {
      const state = await vault.updatePreferences(input)
      if (input.launchAtLogin !== undefined && process.platform !== 'linux') {
        app.setLoginItemSettings({ openAtLogin: input.launchAtLogin })
      }
      if (input.widgetAlwaysOnTop !== undefined) {
        widgetWindow?.setAlwaysOnTop(input.widgetAlwaysOnTop)
      }
      if (input.colorMode !== undefined) syncWindowChrome(state)
      return state
    })
  )
  registerHandler(IPC.addDocuments, (_event, inputs: DocumentInput[]) =>
    serializeVaultOperation(() => vault.addDocuments(inputs))
  )
  registerHandler(IPC.saveDocument, (_event, input: DocumentMetadataInput) =>
    serializeVaultOperation(() => vault.saveDocument(input))
  )
  registerHandler(IPC.removeDocument, (_event, id: string) =>
    serializeVaultOperation(() => vault.removeDocument(id))
  )
  registerHandler(IPC.openDocument, async (_event, id: string) => {
    await vaultOperations
    const path = await vault.materializeDocument(id)
    const error = await shell.openPath(path)
    if (error) throw new Error(error)
  })
  registerHandler(IPC.saveDocumentAs, async (_event, id: string) => {
    await vaultOperations
    const document = vault.get().documents.find((item) => item.id === id)
    if (!document) throw new Error('This document is no longer in your vault.')
    const result = await showSaveDialog({
      title: 'Save document',
      defaultPath: document.originalName
    })
    if (result.canceled || !result.filePath) return false
    const { writeFile } = await import('node:fs/promises')
    await writeFile(result.filePath, await vault.readDocument(id), { mode: 0o600 })
    return true
  })
  registerHandler(IPC.startDocumentDrag, async (event, id: string) => {
    await vaultOperations
    const file = await vault.materializeDocument(id)
    const icon = await app.getFileIcon(file, { size: 'normal' })
    event.sender.startDrag({ file, icon })
  })
  registerHandler(IPC.getDocumentPreview, async (_event, id: string) => {
    await vaultOperations
    const document = vault.get().documents.find((item) => item.id === id)
    if (!document || !document.mimeType.startsWith('image/')) return null
    const image = nativeImage.createFromBuffer(await vault.readDocument(id))
    if (image.isEmpty()) return null
    return image.resize({ width: 640, height: 420, quality: 'good' }).toDataURL()
  })
  registerHandler(IPC.pickDocuments, async () => {
    const result = await showOpenDialog({
      title: 'Add identity documents',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Documents', extensions: ['pdf', 'png', 'jpg', 'jpeg', 'webp', 'heic'] }
      ]
    })
    return result.canceled ? [] : result.filePaths
  })
  registerHandler(IPC.exportArchive, async (_event, password: string) => {
    const name = vault.get().profile.displayName || vault.get().profile.legalName || 'Identity'
    const result = await showSaveDialog({
      title: 'Export encrypted vault',
      defaultPath: `${name.replace(/[^a-zA-Z0-9 _-]/g, '').trim() || 'Identity'} Vault.idvault`,
      filters: [{ name: 'ID Vault archive', extensions: ['idvault'] }]
    })
    if (result.canceled || !result.filePath) return { canceled: true }
    const target = extname(result.filePath).toLowerCase() === '.idvault'
      ? result.filePath
      : `${result.filePath}.idvault`
    await serializeVaultOperation(() => vault.exportArchive(password, target))
    return { canceled: false, path: target }
  })
  registerHandler(IPC.importArchive, async (_event, password: string, mode: ImportMode) => {
    const result = await showOpenDialog({
      title: 'Import ID Vault archive',
      properties: ['openFile'],
      filters: [{ name: 'ID Vault archive', extensions: ['idvault'] }]
    })
    if (result.canceled || !result.filePaths[0]) return { canceled: true }
    const imported = await serializeVaultOperation(() =>
      vault.importArchive(password, result.filePaths[0], mode)
    )
    return {
      canceled: false,
      path: basename(result.filePaths[0]),
      importedDetails: imported.details,
      importedDocuments: imported.documents
    }
  })
  registerHandler(IPC.copyText, (_event, value: string) => clipboard.writeText(value.slice(0, 1000)))
  registerHandler(IPC.showWidget, showWidget)
  registerHandler(IPC.hideWidget, () => widgetWindow?.hide())
  registerHandler(IPC.showMain, (_event, page?: Page) => showMain(page))
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('open-url', (event, url) => {
    event.preventDefault()
    handleDeepLink(url)
  })
  app.on('second-instance', (_event, commandLine) => {
    const deepLink = deepLinkFromArguments(commandLine)
    if (deepLink) handleDeepLink(deepLink)
    else showMain()
  })

  app
    .whenReady()
    .then(async () => {
      app.setAsDefaultProtocolClient(protocolScheme)
      vault = new VaultService(publishState)
      await vault.initialize()
      await systemWidget.publish(vault.get()).catch((error: unknown) => {
        console.error('Unable to initialize the macOS widget:', error)
      })
      registerIpc()
      createApplicationMenu()
      createTray()
      createMainWindow()
      const startupDeepLink = pendingDeepLink ?? deepLinkFromArguments(process.argv)
      pendingDeepLink = null
      if (startupDeepLink) handleDeepLink(startupDeepLink)
      globalShortcut.register('CommandOrControl+Shift+Space', toggleWidget)
      nativeTheme.on('updated', () => {
        if (vault.get().preferences.colorMode === 'system') syncWindowChrome()
      })
      app.on('activate', () => showMain())
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error)
      dialog.showErrorBox('ID Vault could not open', message)
      app.quit()
    })

  app.on('before-quit', (event) => {
    if (isQuitting || !vault) return
    event.preventDefault()
    void vaultOperations
      .then(() => systemWidget.flush())
      .then(() => vault.cleanup())
      .finally(() => {
        isQuitting = true
        app.quit()
      })
  })

  app.on('will-quit', () => globalShortcut.unregisterAll())
  app.on('window-all-closed', () => undefined)
}
