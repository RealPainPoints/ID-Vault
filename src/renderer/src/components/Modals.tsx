import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowRight,
  Check,
  Copy,
  FileKey2,
  FileUp,
  FolderOpen,
  IdCard,
  KeyRound,
  Merge,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  Upload
} from 'lucide-react'
import { DETAIL_CATEGORIES, DOCUMENT_KINDS } from '../../../shared/constants'
import type {
  Detail,
  DetailCategory,
  DetailInput,
  DocumentMetadataInput,
  ImportMode,
  VaultDocument,
  VaultState
} from '../../../shared/types'
import { detailMatches, documentMatches, formatBytes, formatError } from '../lib'
import { Button, Modal, Toggle } from './UI'

export function AddChooser({
  onClose,
  onDetail,
  onDocument
}: {
  onClose: () => void
  onDetail: () => void
  onDocument: () => void
}) {
  return (
    <Modal
      title="Add to ID Vault"
      onClose={onClose}
      width="small"
    >
      <div className="choice-grid">
        <button onClick={onDetail}>
          <span className="choice-icon choice-icon-detail">
            <KeyRound size={22} />
          </span>
          <span>
            <strong>ID or number</strong>
            <small>Tax ID, VAT ID, passport number, or anything else</small>
          </span>
          <ArrowRight size={18} />
        </button>
        <button onClick={onDocument}>
          <span className="choice-icon choice-icon-document">
            <FileUp size={22} />
          </span>
          <span>
            <strong>Document</strong>
            <small>Passport, identity card, certificate, image, or PDF</small>
          </span>
          <ArrowRight size={18} />
        </button>
      </div>
    </Modal>
  )
}

export function DetailEditor({
  detail,
  initialLabel = '',
  initialCategory = 'identity',
  onClose,
  onSave
}: {
  detail?: Detail
  initialLabel?: string
  initialCategory?: DetailCategory
  onClose: () => void
  onSave: (input: DetailInput) => Promise<void>
}) {
  const [label, setLabel] = useState(detail?.label ?? initialLabel)
  const [value, setValue] = useState(detail?.value ?? '')
  const [category, setCategory] = useState<DetailCategory>(detail?.category ?? initialCategory)
  const [country, setCountry] = useState(detail?.country ?? '')
  const [note, setNote] = useState(detail?.note ?? '')
  const [concealed, setConcealed] = useState(detail?.concealed ?? true)
  const pinned = detail?.pinned ?? true
  const [visibleInWidget, setVisibleInWidget] = useState(detail?.visibleInWidget ?? true)
  const [visibleInSystemWidget, setVisibleInSystemWidget] = useState(
    detail?.visibleInSystemWidget ?? false
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      await onSave({
        id: detail?.id,
        label,
        value,
        category,
        country,
        note,
        concealed,
        pinned,
        visibleInWidget,
        visibleInSystemWidget
      })
      onClose()
    } catch (cause) {
      setError(formatError(cause))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title={detail ? 'Edit ID or number' : 'New ID or number'}
      onClose={onClose}
      dismissible={!saving}
    >
      <form className="modal-form" onSubmit={submit}>
        <label>
          <span>Label</span>
          <input
            autoFocus
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="Tax ID"
            maxLength={80}
            required
          />
        </label>
        <label>
          <span>Value</span>
          <input
            className="value-input"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="Enter the number or value"
            maxLength={300}
            required
          />
        </label>
        <details className="advanced-options">
          <summary>More options</summary>
          <div className="advanced-options-content">
            <div className="field-grid field-grid-two">
              <label>
                <span>Category</span>
                <select
                  value={category}
                  onChange={(event) => setCategory(event.target.value as DetailCategory)}
                >
                  {DETAIL_CATEGORIES.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Country or region</span>
                <input
                  value={country}
                  onChange={(event) => setCountry(event.target.value)}
                  placeholder="Optional"
                  maxLength={80}
                />
              </label>
            </div>
            <label>
              <span>Note</span>
              <input
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Optional"
                maxLength={500}
              />
            </label>
            <div className="option-list">
              <div>
                <span>
                  <strong>Mask by default</strong>
                  <small>Reveal it only when needed.</small>
                </span>
                <Toggle checked={concealed} onChange={setConcealed} label="Mask by default" />
              </div>
              <div>
                <span>
                  <strong>Show in Quick Access</strong>
                  <small>Copy it from the compact desktop window.</small>
                </span>
                <Toggle
                  checked={visibleInWidget}
                  onChange={setVisibleInWidget}
                  label="Show in Quick Access"
                />
              </div>
              {window.idVault.platform.isMac && (
                <div>
                  <span>
                    <strong>Show in the macOS widget</strong>
                    <small>Only the label and a masked value are shared.</small>
                  </span>
                  <Toggle
                    checked={visibleInSystemWidget}
                    onChange={setVisibleInSystemWidget}
                    label="Show in the macOS widget"
                  />
                </div>
              )}
            </div>
          </div>
        </details>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <footer className="modal-footer">
          <Button type="button" tone="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" tone="primary" disabled={saving || !label.trim() || !value.trim()}>
            {saving ? 'Saving…' : detail ? 'Save changes' : 'Add'}
          </Button>
        </footer>
      </form>
    </Modal>
  )
}

export function DocumentPicker({
  onClose,
  onAdd
}: {
  onClose: () => void
  onAdd: (paths: string[]) => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState('')

  async function add(paths: string[]): Promise<void> {
    if (!paths.length) return
    setBusy(true)
    setError('')
    try {
      await onAdd(paths)
      onClose()
    } catch (cause) {
      setError(formatError(cause))
    } finally {
      setBusy(false)
    }
  }

  async function pick(): Promise<void> {
    setError('')
    try {
      await add(await window.idVault.vault.pickDocuments())
    } catch (cause) {
      setError(formatError(cause))
    }
  }

  return (
    <Modal
      title="Add documents"
      description="Original files are encrypted before they are stored."
      onClose={onClose}
      dismissible={!busy}
    >
      <div
        className={`document-picker ${dragging ? 'document-picker-active' : ''}`}
        onDragEnter={(event) => {
          event.preventDefault()
          event.stopPropagation()
          setDragging(true)
        }}
        onDragOver={(event) => {
          event.preventDefault()
          event.stopPropagation()
          setDragging(true)
        }}
        onDragLeave={(event) => {
          event.stopPropagation()
          setDragging(false)
        }}
        onDrop={(event) => {
          event.preventDefault()
          event.stopPropagation()
          setDragging(false)
          const paths = Array.from(event.dataTransfer.files)
            .map((file) => window.idVault.files.getPath(file))
            .filter(Boolean)
          void add(paths)
        }}
      >
        <span>
          <Upload size={24} />
        </span>
        <h3>{dragging ? 'Drop to add' : 'Drop documents here'}</h3>
        <p>PDF, PNG, JPEG, WebP, or HEIC · up to 50 MB each</p>
        <Button type="button" icon={<FolderOpen size={16} />} onClick={() => void pick()} disabled={busy}>
          {busy ? 'Adding…' : 'Choose files'}
        </Button>
      </div>
      {error && (
        <p className="form-error modal-inline-error" role="alert">
          {error}
        </p>
      )}
    </Modal>
  )
}

export function DocumentEditor({
  document,
  onClose,
  onSave
}: {
  document: VaultDocument
  onClose: () => void
  onSave: (input: DocumentMetadataInput) => Promise<void>
}) {
  const [title, setTitle] = useState(document.title)
  const [kind, setKind] = useState(document.kind)
  const [country, setCountry] = useState(document.country ?? '')
  const [expiresAt, setExpiresAt] = useState(document.expiresAt ?? '')
  const [note, setNote] = useState(document.note ?? '')
  const [visibleInSystemWidget, setVisibleInSystemWidget] = useState(
    document.visibleInSystemWidget
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      await onSave({
        id: document.id,
        title,
        kind,
        country,
        expiresAt,
        note,
        visibleInSystemWidget
      })
      onClose()
    } catch (cause) {
      setError(formatError(cause))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title="Edit document"
      description={document.originalName}
      onClose={onClose}
      dismissible={!saving}
    >
      <form className="modal-form" onSubmit={submit}>
        <div className="field-grid field-grid-two">
          <label>
            <span>Title</span>
            <input
              autoFocus
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={100}
              required
            />
          </label>
          <label>
            <span>Document type</span>
            <select value={kind} onChange={(event) => setKind(event.target.value as VaultDocument['kind'])}>
              {DOCUMENT_KINDS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <details className="advanced-options">
          <summary>More options</summary>
          <div className="advanced-options-content">
            <div className="field-grid field-grid-two">
              <label>
                <span>Country or region</span>
                <input
                  value={country}
                  onChange={(event) => setCountry(event.target.value)}
                  placeholder="Optional"
                  maxLength={80}
                />
              </label>
              <label>
                <span>Expiry date</span>
                <input
                  type="date"
                  value={expiresAt}
                  onChange={(event) => setExpiresAt(event.target.value)}
                />
              </label>
            </div>
            <label>
              <span>Note</span>
              <input
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Optional"
                maxLength={500}
              />
            </label>
            {window.idVault.platform.isMac && (
              <div className="option-list">
                <div>
                  <span>
                    <strong>Show in the macOS widget</strong>
                    <small>Only the title and document type are shared.</small>
                  </span>
                  <Toggle
                    checked={visibleInSystemWidget}
                    onChange={setVisibleInSystemWidget}
                    label="Show document in the macOS widget"
                  />
                </div>
              </div>
            )}
          </div>
        </details>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <footer className="modal-footer">
          <Button type="button" tone="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" tone="primary" disabled={saving || !title.trim()}>
            {saving ? 'Saving…' : 'Save details'}
          </Button>
        </footer>
      </form>
    </Modal>
  )
}

export function ExportModal({
  onClose,
  onExport
}: {
  onClose: () => void
  onExport: (password: string) => Promise<void>
}) {
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault()
    if (password !== confirmation) {
      setError('The passwords do not match.')
      return
    }
    setBusy(true)
    setError('')
    try {
      await onExport(password)
      onClose()
    } catch (cause) {
      setError(formatError(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title="Export your vault"
      description="Everything is packed into one portable, encrypted file."
      onClose={onClose}
      dismissible={!busy}
    >
      <form className="modal-form" onSubmit={submit}>
        <div className="archive-callout">
          <span>
            <FileKey2 size={21} />
          </span>
          <div>
            <strong>Encrypted .idvault archive</strong>
            <p>Your details and original documents stay password-protected.</p>
          </div>
          <ShieldCheck size={18} />
        </div>
        <label>
          <span>Archive password</span>
          <input
            type="password"
            autoFocus
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="At least 8 characters"
            minLength={8}
            required
          />
        </label>
        <label>
          <span>Confirm password</span>
          <input
            type="password"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            placeholder="Repeat your password"
            minLength={8}
            required
          />
        </label>
        <p className="form-hint">Keep this password safe. It cannot be recovered.</p>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <footer className="modal-footer">
          <Button type="button" tone="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            type="submit"
            tone="primary"
            disabled={busy || password.length < 8 || confirmation.length < 8}
          >
            {busy ? 'Encrypting…' : 'Choose location'}
          </Button>
        </footer>
      </form>
    </Modal>
  )
}

export function ImportModal({
  onClose,
  onImport
}: {
  onClose: () => void
  onImport: (password: string, mode: ImportMode) => Promise<void>
}) {
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<ImportMode>('merge')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await onImport(password, mode)
      onClose()
    } catch (cause) {
      setError(formatError(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title="Import a vault"
      description="Choose a .idvault archive after entering its password."
      onClose={onClose}
      dismissible={!busy}
    >
      <form className="modal-form" onSubmit={submit}>
        <label>
          <span>Archive password</span>
          <input
            type="password"
            autoFocus
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Enter the archive password"
            required
          />
        </label>
        <fieldset className="import-options" role="radiogroup" aria-labelledby="import-mode-label">
          <legend id="import-mode-label">How should items be imported?</legend>
          <button
            id="import-mode-merge"
            type="button"
            role="radio"
            aria-checked={mode === 'merge'}
            tabIndex={mode === 'merge' ? 0 : -1}
            className={mode === 'merge' ? 'selected' : ''}
            onClick={() => setMode('merge')}
            onKeyDown={(event) => {
              if (!['ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowUp'].includes(event.key)) return
              event.preventDefault()
              setMode('replace')
              document.getElementById('import-mode-replace')?.focus()
            }}
          >
            <span>
              <Merge size={18} />
            </span>
            <span>
              <strong>Merge with this vault</strong>
              <small>Keep everything already here and add imported items.</small>
            </span>
            {mode === 'merge' && <Check size={17} />}
          </button>
          <button
            id="import-mode-replace"
            type="button"
            role="radio"
            aria-checked={mode === 'replace'}
            tabIndex={mode === 'replace' ? 0 : -1}
            className={mode === 'replace' ? 'selected replace' : 'replace'}
            onClick={() => setMode('replace')}
            onKeyDown={(event) => {
              if (!['ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowUp'].includes(event.key)) return
              event.preventDefault()
              setMode('merge')
              document.getElementById('import-mode-merge')?.focus()
            }}
          >
            <span>
              <Trash2 size={18} />
            </span>
            <span>
              <strong>Replace this vault</strong>
              <small>Remove current items and restore only the archive.</small>
            </span>
            {mode === 'replace' && <Check size={17} />}
          </button>
        </fieldset>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <footer className="modal-footer">
          <Button type="button" tone="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" tone="primary" disabled={busy || !password}>
            {busy ? 'Importing…' : 'Choose archive'}
          </Button>
        </footer>
      </form>
    </Modal>
  )
}

export function ConfirmModal({
  title,
  description,
  confirmLabel,
  onClose,
  onConfirm
}: {
  title: string
  description: string
  confirmLabel: string
  onClose: () => void
  onConfirm: () => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  return (
    <Modal
      title={title}
      description={description}
      onClose={onClose}
      width="small"
      dismissible={!busy}
    >
      {error && (
        <p className="form-error confirm-error" role="alert">
          {error}
        </p>
      )}
      <footer className="modal-footer modal-footer-standalone">
        <Button tone="ghost" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button
          tone="danger"
          disabled={busy}
          onClick={() => {
            setBusy(true)
            void onConfirm()
              .then(onClose)
              .catch((cause) => setError(formatError(cause)))
              .finally(() => setBusy(false))
          }}
        >
          {busy ? 'Removing…' : confirmLabel}
        </Button>
      </footer>
    </Modal>
  )
}

export function SearchModal({
  vault,
  onClose,
  onDetail,
  onDocument
}: {
  vault: VaultState
  onClose: () => void
  onDetail: (detail: Detail) => void
  onDocument: (id: string) => void
}) {
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const searchRef = useRef<HTMLElement>(null)
  const openerRef = useRef<HTMLElement | null>(
    typeof document !== 'undefined' && document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
  )
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  const details = useMemo(
    () => vault.details.filter((detail) => detailMatches(detail, query)).slice(0, 6),
    [query, vault.details]
  )
  const documents = useMemo(
    () => vault.documents.filter((document) => documentMatches(document, query)).slice(0, 6),
    [query, vault.documents]
  )
  const resultCount = details.length + documents.length

  useEffect(() => {
    setSelectedIndex((current) => (resultCount ? Math.min(current, resultCount - 1) : 0))
  }, [resultCount])

  useEffect(() => {
    const focusableSelector =
      'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeRef.current()
        return
      }
      if (event.key !== 'Tab' || !searchRef.current) return
      const focusable = Array.from(
        searchRef.current.querySelectorAll<HTMLElement>(focusableSelector)
      ).filter((element) => element.offsetParent !== null)
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      if (openerRef.current?.isConnected) openerRef.current.focus()
    }
  }, [])

  useEffect(() => {
    searchRef.current
      ?.querySelector<HTMLElement>(`[data-result-index="${selectedIndex}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  useEffect(() => {
    const handleResultNavigation = (event: KeyboardEvent): void => {
      if (event.isComposing || event.metaKey || event.ctrlKey || event.altKey || !resultCount) return

      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setSelectedIndex((current) => (current + 1) % resultCount)
        return
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setSelectedIndex((current) => (current - 1 + resultCount) % resultCount)
        return
      }

      if (event.key !== 'Enter') return
      event.preventDefault()
      const detail = details[selectedIndex]
      if (detail) {
        onDetail(detail)
        return
      }
      const document = documents[selectedIndex - details.length]
      if (document) onDocument(document.id)
    }

    window.addEventListener('keydown', handleResultNavigation)
    return () => window.removeEventListener('keydown', handleResultNavigation)
  }, [details, documents, onDetail, onDocument, resultCount, selectedIndex])

  return (
    <div className="search-backdrop" onMouseDown={onClose}>
      <section
        ref={searchRef}
        className="search-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Search your vault"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="search-input-wrap">
          <Search size={19} />
          <input
            autoFocus
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setSelectedIndex(0)
            }}
            placeholder="Search details and documents"
          />
          <kbd>esc</kbd>
        </div>
        <div className="search-results">
          {details.length > 0 && (
            <div className="search-group">
              <h3>IDs & numbers</h3>
              {details.map((detail, index) => (
                <button
                  key={detail.id}
                  data-result-index={index}
                  className={selectedIndex === index ? 'active' : undefined}
                  onClick={() => onDetail(detail)}
                  onFocus={() => setSelectedIndex(index)}
                  onMouseEnter={() => setSelectedIndex(index)}
                >
                  <span className="result-icon">
                    <KeyRound size={17} />
                  </span>
                  <span>
                    <strong>{detail.label}</strong>
                    <small>{detail.country || detail.category}</small>
                  </span>
                  <Copy size={16} />
                </button>
              ))}
            </div>
          )}
          {documents.length > 0 && (
            <div className="search-group">
              <h3>Documents</h3>
              {documents.map((document, index) => {
                const resultIndex = details.length + index
                return (
                  <button
                    key={document.id}
                    data-result-index={resultIndex}
                    className={selectedIndex === resultIndex ? 'active' : undefined}
                    onClick={() => onDocument(document.id)}
                    onFocus={() => setSelectedIndex(resultIndex)}
                    onMouseEnter={() => setSelectedIndex(resultIndex)}
                  >
                    <span className="result-icon result-icon-file">
                      <IdCard size={17} />
                    </span>
                    <span>
                      <strong>{document.title}</strong>
                      <small>{formatBytes(document.size)}</small>
                    </span>
                    <ArrowRight size={16} />
                  </button>
                )
              })}
            </div>
          )}
          {query && !details.length && !documents.length && (
            <div className="search-empty">
              <Search size={22} />
              <p>No results for “{query}”</p>
            </div>
          )}
          {!query && !vault.details.length && !vault.documents.length && (
            <div className="search-empty">
              <Plus size={22} />
              <p>Add something to your vault to find it here.</p>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
