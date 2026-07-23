import type { DetailInput, IDVaultApi, VaultState } from '../../shared/types'

function previewState(): VaultState {
  const date = new Date().toISOString()
  const requestedTheme = new URLSearchParams(window.location.search).get('theme')
  const colorMode =
    requestedTheme === 'light' || requestedTheme === 'dark' ? requestedTheme : 'system'
  return {
    version: 1,
    profile: {
      displayName: 'Alex',
      legalName: 'Alex Morgan',
      country: 'Germany'
    },
    details: [
      {
        id: 'detail-tax',
        label: 'Tax ID',
        value: '12 345 678 901',
        category: 'tax',
        country: 'Germany',
        concealed: true,
        pinned: true,
        visibleInWidget: true,
        visibleInSystemWidget: true,
        createdAt: date,
        updatedAt: date
      },
      {
        id: 'detail-vat',
        label: 'VAT ID',
        value: 'DE123456789',
        category: 'business',
        country: 'Germany',
        concealed: true,
        pinned: true,
        visibleInWidget: true,
        visibleInSystemWidget: true,
        createdAt: date,
        updatedAt: date
      },
      {
        id: 'detail-passport',
        label: 'Passport number',
        value: 'C01X00T47',
        category: 'identity',
        country: 'Germany',
        concealed: true,
        pinned: true,
        visibleInWidget: false,
        visibleInSystemWidget: false,
        createdAt: date,
        updatedAt: date
      }
    ],
    documents: [
      {
        id: 'document-passport',
        title: 'Passport scan',
        kind: 'passport',
        originalName: 'Passport scan.pdf',
        mimeType: 'application/pdf',
        size: 1840000,
        visibleInSystemWidget: true,
        country: 'Germany',
        expiresAt: '2031-08-14',
        createdAt: date,
        updatedAt: date
      },
      {
        id: 'document-id',
        title: 'Identity card',
        kind: 'identity-card',
        originalName: 'Identity card.jpg',
        mimeType: 'image/jpeg',
        size: 928000,
        visibleInSystemWidget: false,
        country: 'Germany',
        expiresAt: '2029-03-22',
        createdAt: date,
        updatedAt: date
      }
    ],
    preferences: {
      colorMode,
      maskSensitiveValues: true,
      widgetAlwaysOnTop: false,
      systemWidgetEnabled: true,
      launchAtLogin: false
    },
    createdAt: date,
    updatedAt: date
  }
}

export function installPreviewBridge(): void {
  if (window.idVault || !import.meta.env.DEV) return
  let state = previewState()
  const listeners = new Set<(state: VaultState) => void>()
  const commit = (next: VaultState): VaultState => {
    state = structuredClone(next)
    listeners.forEach((listener) => listener(structuredClone(state)))
    return structuredClone(state)
  }

  const api: IDVaultApi = {
    platform: {
      platform: 'darwin',
      isMac: true,
      isWindows: false
    },
    vault: {
      get: async () => structuredClone(state),
      saveDetail: async (input: DetailInput) => {
        const existing = input.id ? state.details.find((detail) => detail.id === input.id) : undefined
        const date = new Date().toISOString()
        const detail = {
          ...input,
          id: existing?.id ?? crypto.randomUUID(),
          createdAt: existing?.createdAt ?? date,
          updatedAt: date
        }
        return commit({
          ...state,
          details: existing
            ? state.details.map((item) => (item.id === detail.id ? detail : item))
            : [detail, ...state.details],
          updatedAt: date
        })
      },
      removeDetail: async (id) => commit({ ...state, details: state.details.filter((item) => item.id !== id) }),
      updateProfile: async (input) => commit({ ...state, profile: { ...state.profile, ...input } }),
      updatePreferences: async (input) =>
        commit({ ...state, preferences: { ...state.preferences, ...input } }),
      addDocuments: async () => structuredClone(state),
      saveDocument: async (input) =>
        commit({
          ...state,
          documents: state.documents.map((document) =>
            document.id === input.id
              ? { ...document, ...input, updatedAt: new Date().toISOString() }
              : document
          )
        }),
      removeDocument: async (id) =>
        commit({ ...state, documents: state.documents.filter((item) => item.id !== id) }),
      openDocument: async () => undefined,
      saveDocumentAs: async () => true,
      startDocumentDrag: async () => undefined,
      getDocumentPreview: async () => null,
      pickDocuments: async () => [],
      exportArchive: async () => ({ canceled: false, path: 'Identity Vault.idvault' }),
      importArchive: async () => ({ canceled: true }),
      copyText: async (value) => navigator.clipboard.writeText(value),
      showWidget: async () => undefined,
      hideWidget: async () => undefined,
      showMain: async () => undefined,
      onChanged: (listener) => {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
      onQuickAdd: () => () => undefined,
      onNavigate: () => () => undefined
    },
    files: {
      getPath: (file) => file.name
    }
  }
  window.idVault = api
}
