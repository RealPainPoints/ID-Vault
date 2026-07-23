export type Page = 'overview' | 'details' | 'documents' | 'settings'

export type NavigationTarget = {
  page: Page
  itemId?: string
}

export type DetailCategory = 'identity' | 'tax' | 'business' | 'other'

export type Detail = {
  id: string
  label: string
  value: string
  category: DetailCategory
  country?: string
  note?: string
  concealed: boolean
  pinned: boolean
  visibleInWidget: boolean
  visibleInSystemWidget: boolean
  createdAt: string
  updatedAt: string
}

export type DocumentKind =
  | 'passport'
  | 'identity-card'
  | 'driver-license'
  | 'tax-document'
  | 'certificate'
  | 'other'

export type VaultDocument = {
  id: string
  title: string
  kind: DocumentKind
  originalName: string
  mimeType: string
  size: number
  country?: string
  expiresAt?: string
  note?: string
  visibleInSystemWidget: boolean
  createdAt: string
  updatedAt: string
}

export type Profile = {
  displayName: string
  legalName: string
  country: string
}

export type Preferences = {
  colorMode: 'system' | 'light' | 'dark'
  maskSensitiveValues: boolean
  widgetAlwaysOnTop: boolean
  systemWidgetEnabled: boolean
  launchAtLogin: boolean
}

export type VaultState = {
  version: 1
  profile: Profile
  details: Detail[]
  documents: VaultDocument[]
  preferences: Preferences
  createdAt: string
  updatedAt: string
}

export type DetailInput = Pick<
  Detail,
  | 'label'
  | 'value'
  | 'category'
  | 'concealed'
  | 'pinned'
  | 'visibleInWidget'
  | 'visibleInSystemWidget'
> & {
  id?: string
  country?: string
  note?: string
}

export type DocumentInput = {
  path: string
  title?: string
  kind?: DocumentKind
  country?: string
  expiresAt?: string
  note?: string
  visibleInSystemWidget?: boolean
}

export type DocumentMetadataInput = Pick<
  VaultDocument,
  'id' | 'title' | 'kind' | 'visibleInSystemWidget'
> & {
  country?: string
  expiresAt?: string
  note?: string
}

export type ProfileInput = Partial<Profile>
export type PreferencesInput = Partial<Preferences>
export type ImportMode = 'merge' | 'replace'

export type ArchiveResult = {
  canceled: boolean
  path?: string
  importedDetails?: number
  importedDocuments?: number
}

export type PlatformInfo = {
  platform: NodeJS.Platform
  isMac: boolean
  isWindows: boolean
}

export type Unsubscribe = () => void

export type IDVaultApi = {
  platform: PlatformInfo
  vault: {
    get: () => Promise<VaultState>
    saveDetail: (input: DetailInput) => Promise<VaultState>
    removeDetail: (id: string) => Promise<VaultState>
    updateProfile: (input: ProfileInput) => Promise<VaultState>
    updatePreferences: (input: PreferencesInput) => Promise<VaultState>
    addDocuments: (inputs: DocumentInput[]) => Promise<VaultState>
    saveDocument: (input: DocumentMetadataInput) => Promise<VaultState>
    removeDocument: (id: string) => Promise<VaultState>
    openDocument: (id: string) => Promise<void>
    saveDocumentAs: (id: string) => Promise<boolean>
    startDocumentDrag: (id: string) => Promise<void>
    getDocumentPreview: (id: string) => Promise<string | null>
    pickDocuments: () => Promise<string[]>
    exportArchive: (password: string) => Promise<ArchiveResult>
    importArchive: (password: string, mode: ImportMode) => Promise<ArchiveResult>
    copyText: (value: string) => Promise<void>
    showWidget: () => Promise<void>
    hideWidget: () => Promise<void>
    showMain: (page?: Page) => Promise<void>
    onChanged: (listener: (state: VaultState) => void) => Unsubscribe
    onQuickAdd: (listener: () => void) => Unsubscribe
    onNavigate: (listener: (target: NavigationTarget) => void) => Unsubscribe
  }
  files: {
    getPath: (file: File) => string
  }
}

declare global {
  interface Window {
    idVault: IDVaultApi
  }
}
