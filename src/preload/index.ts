import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { IPC } from '../shared/ipc'
import type {
  DetailInput,
  DocumentInput,
  DocumentMetadataInput,
  IDVaultApi,
  ImportMode,
  NavigationTarget,
  Page,
  PreferencesInput,
  ProfileInput,
  VaultState
} from '../shared/types'

const api: IDVaultApi = {
  platform: {
    platform: process.platform,
    isMac: process.platform === 'darwin',
    isWindows: process.platform === 'win32'
  },
  vault: {
    get: () => ipcRenderer.invoke(IPC.getVault),
    saveDetail: (input: DetailInput) => ipcRenderer.invoke(IPC.saveDetail, input),
    removeDetail: (id: string) => ipcRenderer.invoke(IPC.removeDetail, id),
    updateProfile: (input: ProfileInput) => ipcRenderer.invoke(IPC.updateProfile, input),
    updatePreferences: (input: PreferencesInput) =>
      ipcRenderer.invoke(IPC.updatePreferences, input),
    addDocuments: (inputs: DocumentInput[]) => ipcRenderer.invoke(IPC.addDocuments, inputs),
    saveDocument: (input: DocumentMetadataInput) => ipcRenderer.invoke(IPC.saveDocument, input),
    removeDocument: (id: string) => ipcRenderer.invoke(IPC.removeDocument, id),
    openDocument: (id: string) => ipcRenderer.invoke(IPC.openDocument, id),
    saveDocumentAs: (id: string) => ipcRenderer.invoke(IPC.saveDocumentAs, id),
    startDocumentDrag: (id: string) => ipcRenderer.invoke(IPC.startDocumentDrag, id),
    getDocumentPreview: (id: string) => ipcRenderer.invoke(IPC.getDocumentPreview, id),
    pickDocuments: () => ipcRenderer.invoke(IPC.pickDocuments),
    exportArchive: (password: string) => ipcRenderer.invoke(IPC.exportArchive, password),
    importArchive: (password: string, mode: ImportMode) =>
      ipcRenderer.invoke(IPC.importArchive, password, mode),
    copyText: (value: string) => ipcRenderer.invoke(IPC.copyText, value),
    showWidget: () => ipcRenderer.invoke(IPC.showWidget),
    hideWidget: () => ipcRenderer.invoke(IPC.hideWidget),
    showMain: (page?: Page) => ipcRenderer.invoke(IPC.showMain, page),
    onChanged: (listener: (state: VaultState) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, state: VaultState): void => listener(state)
      ipcRenderer.on(IPC.changed, handler)
      return () => ipcRenderer.removeListener(IPC.changed, handler)
    },
    onQuickAdd: (listener: () => void) => {
      const handler = (): void => listener()
      ipcRenderer.on(IPC.quickAdd, handler)
      return () => ipcRenderer.removeListener(IPC.quickAdd, handler)
    },
    onNavigate: (listener: (target: NavigationTarget) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, target: NavigationTarget): void =>
        listener(target)
      ipcRenderer.on(IPC.navigate, handler)
      return () => ipcRenderer.removeListener(IPC.navigate, handler)
    }
  },
  files: {
    getPath: (file: File) => webUtils.getPathForFile(file)
  }
}

contextBridge.exposeInMainWorld('idVault', api)
