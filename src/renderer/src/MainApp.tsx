import { useEffect, useRef, useState } from 'react'
import { LayoutGrid, PanelTopOpen, Search, Settings, Upload } from 'lucide-react'
import type {
  Detail,
  DetailCategory,
  ImportMode,
  NavigationTarget,
  VaultDocument,
  VaultState
} from '../../shared/types'
import {
  AddChooser,
  ConfirmModal,
  DetailEditor,
  DocumentEditor,
  DocumentPicker,
  ExportModal,
  ImportModal,
  SearchModal
} from './components/Modals'
import BrandMark from './components/BrandMark'
import SettingsPage from './pages/SettingsPage'
import VaultPage from './pages/VaultPage'

type DialogState =
  | { type: 'add' }
  | { type: 'detail'; detail?: Detail; initialLabel?: string; initialCategory?: DetailCategory }
  | { type: 'document' }
  | { type: 'edit-document'; document: VaultDocument }
  | { type: 'export' }
  | { type: 'import' }
  | { type: 'search' }
  | { type: 'delete-detail'; detail: Detail }
  | { type: 'delete-document'; document: VaultDocument }
  | null

type Section = 'vault' | 'settings'

type Props = {
  vault: VaultState
  setVault: (vault: VaultState) => void
  notify: (message: string, tone?: 'success' | 'error') => void
}

const NAV_ITEMS = [
  { section: 'vault' as const, label: 'Vault', icon: LayoutGrid },
  { section: 'settings' as const, label: 'Settings', icon: Settings }
]

function initialSection(): Section {
  return new URLSearchParams(window.location.search).get('page') === 'settings'
    ? 'settings'
    : 'vault'
}

function initialDialog(): DialogState {
  if (!import.meta.env.DEV) return null
  const modal = new URLSearchParams(window.location.search).get('modal')
  if (modal === 'detail') return { type: 'detail' }
  if (modal === 'document') return { type: 'document' }
  if (modal === 'export') return { type: 'export' }
  if (modal === 'import') return { type: 'import' }
  if (modal === 'search') return { type: 'search' }
  return null
}

export default function MainApp({ vault, setVault, notify }: Props) {
  const [section, setSection] = useState<Section>(initialSection)
  const [dialog, setDialog] = useState<DialogState>(initialDialog)
  const [dropActive, setDropActive] = useState(false)
  const dragDepth = useRef(0)
  const mainContentRef = useRef<HTMLElement>(null)

  useEffect(() => {
    return window.idVault.vault.onQuickAdd(() =>
      setDialog((current) => current ?? { type: 'add' })
    )
  }, [])

  useEffect(() => window.idVault.vault.onNavigate(navigate), [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!(event.metaKey || event.ctrlKey) || dialog) return
      const key = event.key.toLowerCase()
      if (key === 'k') {
        event.preventDefault()
        setDialog({ type: 'search' })
      } else if (key === 'n') {
        event.preventDefault()
        setDialog({ type: 'add' })
      } else if (key === 'e') {
        event.preventDefault()
        setDialog({ type: 'export' })
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [dialog])

  function navigate(target: NavigationTarget): void {
    const { page, itemId } = target
    setSection(page === 'settings' ? 'settings' : 'vault')
    setDialog(null)
    mainContentRef.current?.scrollTo({ top: 0 })
    if (page !== 'details' && page !== 'documents') return
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const element =
          (itemId ? document.getElementById(`vault-item-${itemId}`) : null) ??
          document.getElementById(`vault-${page}`)
        element?.scrollIntoView({ block: itemId ? 'center' : 'start' })
        if (!itemId || !element) return
        element.classList.remove('deep-link-highlight')
        void element.getBoundingClientRect()
        element.classList.add('deep-link-highlight')
        element.addEventListener(
          'animationend',
          () => element.classList.remove('deep-link-highlight'),
          { once: true }
        )
      })
    })
  }

  async function addDocuments(paths: string[]): Promise<void> {
    const next = await window.idVault.vault.addDocuments(paths.map((path) => ({ path })))
    setVault(next)
    notify(`${paths.length} document${paths.length === 1 ? '' : 's'} added`)
  }

  async function enableSystemWidgetWhenSelected(
    state: VaultState,
    selected: boolean
  ): Promise<VaultState> {
    if (!window.idVault.platform.isMac || !selected || state.preferences.systemWidgetEnabled) {
      return state
    }
    return window.idVault.vault.updatePreferences({ systemWidgetEnabled: true })
  }

  async function handleDrop(event: React.DragEvent): Promise<void> {
    event.preventDefault()
    dragDepth.current = 0
    setDropActive(false)
    const paths = Array.from(event.dataTransfer.files)
      .map((file) => window.idVault.files.getPath(file))
      .filter(Boolean)
    if (!paths.length) return
    try {
      await addDocuments(paths)
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error), 'error')
    }
  }

  async function exportVault(password: string): Promise<void> {
    const result = await window.idVault.vault.exportArchive(password)
    if (!result.canceled) notify('Encrypted vault exported')
  }

  async function importVault(password: string, mode: ImportMode): Promise<void> {
    const result = await window.idVault.vault.importArchive(password, mode)
    if (result.canceled) return
    const next = await window.idVault.vault.get()
    setVault(next)
    setSection('vault')
    notify(
      `Imported ${result.importedDetails ?? 0} IDs and ${result.importedDocuments ?? 0} documents`
    )
  }

  async function copySearchResult(detail: Detail): Promise<void> {
    try {
      await window.idVault.vault.copyText(detail.value)
      setDialog(null)
      notify(`${detail.label} copied`)
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error), 'error')
    }
  }

  return (
    <div
      className={`app-shell ${window.idVault.platform.isMac ? 'platform-mac' : 'platform-other'}`}
      onDragEnter={(event) => {
        if (
          !event.dataTransfer.types.includes('Files') ||
          (event.target instanceof Element && event.target.closest('.document-picker'))
        ) {
          return
        }
        event.preventDefault()
        dragDepth.current += 1
        setDropActive(true)
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={() => {
        if (!dragDepth.current) return
        dragDepth.current -= 1
        if (dragDepth.current <= 0) {
          dragDepth.current = 0
          setDropActive(false)
        }
      }}
      onDrop={(event) => void handleDrop(event)}
    >
      <header className="titlebar">
        <div className="titlebar-brand">
          <BrandMark />
          <span>ID Vault</span>
        </div>
        <button className="titlebar-search no-drag" onClick={() => setDialog({ type: 'search' })}>
          <Search size={14} />
          <span>Search</span>
          <kbd>{window.idVault.platform.isMac ? '⌘' : 'Ctrl'} K</kbd>
        </button>
      </header>

      <aside className="sidebar">
        <nav>
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon
            return (
              <button
                key={item.section}
                className={section === item.section ? 'active' : ''}
                aria-current={section === item.section ? 'page' : undefined}
                onClick={() => {
                  setSection(item.section)
                  setDialog(null)
                  mainContentRef.current?.scrollTo({ top: 0 })
                }}
              >
                <Icon size={17} />
                <span>{item.label}</span>
              </button>
            )
          })}
        </nav>
        <div className="sidebar-bottom">
          <button className="quick-access-link" onClick={() => void window.idVault.vault.showWidget()}>
            <PanelTopOpen size={16} />
            <span>Quick Access</span>
          </button>
        </div>
      </aside>

      <main ref={mainContentRef} className="main-content">
        {section === 'vault' ? (
          <VaultPage
            vault={vault}
            onAddDetail={() => setDialog({ type: 'detail' })}
            onAddDocuments={() => setDialog({ type: 'document' })}
            onEditDetail={(detail) => setDialog({ type: 'detail', detail })}
            onDeleteDetail={(detail) => setDialog({ type: 'delete-detail', detail })}
            onEditDocument={(document) => setDialog({ type: 'edit-document', document })}
            onDeleteDocument={(document) => setDialog({ type: 'delete-document', document })}
            notify={notify}
          />
        ) : (
          <SettingsPage
            vault={vault}
            setVault={setVault}
            onImport={() => setDialog({ type: 'import' })}
            onExport={() => setDialog({ type: 'export' })}
            notify={notify}
          />
        )}
      </main>

      {dropActive && (
        <div className="global-drop-overlay">
          <span>
            <Upload size={24} />
          </span>
          <strong>Drop to add documents</strong>
          <small>They’ll be encrypted automatically.</small>
        </div>
      )}

      {dialog?.type === 'add' && (
        <AddChooser
          onClose={() => setDialog(null)}
          onDetail={() => setDialog({ type: 'detail' })}
          onDocument={() => setDialog({ type: 'document' })}
        />
      )}
      {dialog?.type === 'detail' && (
        <DetailEditor
          detail={dialog.detail}
          initialLabel={dialog.initialLabel}
          initialCategory={dialog.initialCategory}
          onClose={() => setDialog(null)}
          onSave={async (input) => {
            const next = await window.idVault.vault.saveDetail(input)
            setVault(await enableSystemWidgetWhenSelected(next, input.visibleInSystemWidget))
            notify(dialog.detail ? 'ID updated' : 'ID added')
          }}
        />
      )}
      {dialog?.type === 'document' && (
        <DocumentPicker onClose={() => setDialog(null)} onAdd={addDocuments} />
      )}
      {dialog?.type === 'edit-document' && (
        <DocumentEditor
          document={dialog.document}
          onClose={() => setDialog(null)}
          onSave={async (input) => {
            const next = await window.idVault.vault.saveDocument(input)
            setVault(await enableSystemWidgetWhenSelected(next, input.visibleInSystemWidget))
            notify('Document updated')
          }}
        />
      )}
      {dialog?.type === 'export' && (
        <ExportModal onClose={() => setDialog(null)} onExport={exportVault} />
      )}
      {dialog?.type === 'import' && (
        <ImportModal onClose={() => setDialog(null)} onImport={importVault} />
      )}
      {dialog?.type === 'search' && (
        <SearchModal
          vault={vault}
          onClose={() => setDialog(null)}
          onDetail={(detail) => void copySearchResult(detail)}
          onDocument={(id) => {
            setDialog(null)
            void window.idVault.vault.openDocument(id).catch((error) => {
              notify(error instanceof Error ? error.message : String(error), 'error')
            })
          }}
        />
      )}
      {dialog?.type === 'delete-detail' && (
        <ConfirmModal
          title={`Remove “${dialog.detail.label}”?`}
          description="This ID or number will be permanently removed."
          confirmLabel="Remove"
          onClose={() => setDialog(null)}
          onConfirm={async () => {
            setVault(await window.idVault.vault.removeDetail(dialog.detail.id))
            notify('ID removed')
          }}
        />
      )}
      {dialog?.type === 'delete-document' && (
        <ConfirmModal
          title={`Remove “${dialog.document.title}”?`}
          description="The encrypted file and its information will be permanently removed."
          confirmLabel="Remove"
          onClose={() => setDialog(null)}
          onConfirm={async () => {
            setVault(await window.idVault.vault.removeDocument(dialog.document.id))
            notify('Document removed')
          }}
        />
      )}
    </div>
  )
}
