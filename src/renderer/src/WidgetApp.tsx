import { useEffect, useMemo, useState } from 'react'
import { ArrowUpRight, Copy, Eye, EyeOff, Upload, X } from 'lucide-react'
import type { VaultState } from '../../shared/types'
import BrandMark from './components/BrandMark'
import { DocumentRow } from './components/DocumentView'
import { IconButton } from './components/UI'
import { maskValue } from './lib'

export default function WidgetApp({
  vault,
  setVault,
  notify
}: {
  vault: VaultState
  setVault: (vault: VaultState) => void
  notify: (message: string, tone?: 'success' | 'error') => void
}) {
  const [revealed, setRevealed] = useState(false)
  const visibleDetails = useMemo(
    () => vault.details.filter((detail) => detail.visibleInWidget).slice(0, 6),
    [vault.details]
  )
  const documents = useMemo(() => vault.documents.slice(0, 4), [vault.documents])

  useEffect(() => {
    const conceal = (): void => setRevealed(false)
    const concealWhenHidden = (): void => {
      if (document.hidden) conceal()
    }
    window.addEventListener('blur', conceal)
    document.addEventListener('visibilitychange', concealWhenHidden)
    return () => {
      window.removeEventListener('blur', conceal)
      document.removeEventListener('visibilitychange', concealWhenHidden)
    }
  }, [])

  async function dropDocuments(event: React.DragEvent): Promise<void> {
    event.preventDefault()
    const paths = Array.from(event.dataTransfer.files)
      .map((file) => window.idVault.files.getPath(file))
      .filter(Boolean)
    if (!paths.length) return
    try {
      setVault(await window.idVault.vault.addDocuments(paths.map((path) => ({ path }))))
      notify(`${paths.length} document${paths.length === 1 ? '' : 's'} added`)
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error), 'error')
    }
  }

  async function copy(label: string, value: string): Promise<void> {
    try {
      await window.idVault.vault.copyText(value)
      notify(`${label} copied`)
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error), 'error')
    }
  }

  async function openDocument(id: string): Promise<void> {
    try {
      await window.idVault.vault.openDocument(id)
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error), 'error')
    }
  }

  return (
    <div
      className="widget-shell"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => void dropDocuments(event)}
    >
      <header className="widget-header">
        <strong className="widget-brand">
          <BrandMark />
          <span>ID Vault</span>
        </strong>
        <div className="widget-header-actions no-drag">
          <IconButton label="Open ID Vault" onClick={() => void window.idVault.vault.showMain()}>
            <ArrowUpRight size={16} />
          </IconButton>
          <IconButton label="Close Quick Access" onClick={() => void window.idVault.vault.hideWidget()}>
            <X size={17} />
          </IconButton>
        </div>
      </header>

      <div className="widget-scroll no-drag">
        <section className="widget-section">
          <div className="widget-section-heading">
            <h2>IDs & numbers</h2>
            {visibleDetails.length > 0 && (
              <IconButton label={revealed ? 'Hide values' : 'Reveal values'} onClick={() => setRevealed(!revealed)}>
                {revealed ? <EyeOff size={14} /> : <Eye size={14} />}
              </IconButton>
            )}
          </div>
          {visibleDetails.length ? (
            <div className="widget-detail-list">
              {visibleDetails.map((detail) => (
                <button
                  key={detail.id}
                  className="widget-detail"
                  onClick={() => void copy(detail.label, detail.value)}
                >
                  <span>
                    <small>{detail.label}</small>
                    <strong className={revealed ? '' : 'masked-value'}>
                      {revealed ? detail.value : maskValue(detail.value)}
                    </strong>
                  </span>
                  <Copy size={15} />
                </button>
              ))}
            </div>
          ) : (
            <button className="widget-empty" onClick={() => void window.idVault.vault.showMain('details')}>
              Open ID Vault to choose items
            </button>
          )}
        </section>

        <section className="widget-section widget-documents">
          <div className="widget-section-heading">
            <h2>Documents</h2>
            <span>Drag to upload</span>
          </div>
          {documents.length ? (
            <div className="widget-document-list">
              {documents.map((document) => (
                <DocumentRow
                  key={document.id}
                  document={document}
                  compact
                  onOpen={() => void openDocument(document.id)}
                />
              ))}
            </div>
          ) : (
            <button className="widget-empty" onClick={() => void window.idVault.vault.showMain('documents')}>
              <Upload size={15} /> Drop here or open the vault
            </button>
          )}
        </section>
      </div>
    </div>
  )
}
