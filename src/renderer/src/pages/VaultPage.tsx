import { useState } from 'react'
import {
  Copy,
  Eye,
  EyeOff,
  FileText,
  KeyRound,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
  Upload
} from 'lucide-react'
import type { Detail, VaultDocument, VaultState } from '../../../shared/types'
import { DocumentCard } from '../components/DocumentView'
import { Button, EmptyState, IconButton } from '../components/UI'
import { maskValue } from '../lib'

type Props = {
  vault: VaultState
  onAddDetail: () => void
  onAddDocuments: () => void
  onEditDetail: (detail: Detail) => void
  onDeleteDetail: (detail: Detail) => void
  onEditDocument: (document: VaultDocument) => void
  onDeleteDocument: (document: VaultDocument) => void
  notify: (message: string, tone?: 'success' | 'error') => void
}

export default function VaultPage({
  vault,
  onAddDetail,
  onAddDocuments,
  onEditDetail,
  onDeleteDetail,
  onEditDocument,
  onDeleteDocument,
  notify
}: Props) {
  async function openDocument(document: VaultDocument): Promise<void> {
    try {
      await window.idVault.vault.openDocument(document.id)
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error), 'error')
    }
  }

  async function saveDocument(document: VaultDocument): Promise<void> {
    try {
      if (await window.idVault.vault.saveDocumentAs(document.id)) notify('Document saved')
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error), 'error')
    }
  }

  return (
    <div className="page vault-page">
      <header className="page-header">
        <div>
          <h1>Vault</h1>
          <p>Everything important, ready when you need it.</p>
        </div>
        <div className="page-actions">
          <Button icon={<Upload size={16} />} onClick={onAddDocuments}>
            Upload
          </Button>
          <Button tone="primary" icon={<Plus size={16} />} onClick={onAddDetail}>
            New ID or number
          </Button>
        </div>
      </header>

      <section id="vault-details" className="vault-section">
        <header className="vault-section-header">
          <div>
            <h2>IDs & numbers</h2>
            <span>{vault.details.length}</span>
          </div>
        </header>

        {vault.details.length ? (
          <div className="detail-list surface-list">
            {vault.details.map((detail) => (
              <DetailRow
                key={detail.id}
                detail={detail}
                maskAll={vault.preferences.maskSensitiveValues}
                onEdit={() => onEditDetail(detail)}
                onDelete={() => onDeleteDetail(detail)}
                notify={notify}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<KeyRound size={22} />}
            title="No IDs or numbers yet"
            description="Add a tax ID, passport number, VAT ID, or any value you often need."
            action={
              <Button tone="primary" icon={<Plus size={16} />} onClick={onAddDetail}>
                Add your first one
              </Button>
            }
          />
        )}
      </section>

      <section id="vault-documents" className="vault-section">
        <header className="vault-section-header">
          <div>
            <h2>Documents</h2>
            <span>{vault.documents.length}</span>
          </div>
          {vault.documents.length > 0 && (
            <Button compact tone="ghost" icon={<Upload size={15} />} onClick={onAddDocuments}>
              Upload
            </Button>
          )}
        </header>

        {vault.documents.length ? (
          <div className="document-card-grid">
            {vault.documents.map((document) => (
              <DocumentCard
                key={document.id}
                document={document}
                onOpen={() => void openDocument(document)}
                onEdit={() => onEditDocument(document)}
                onSave={() => void saveDocument(document)}
                onDelete={() => onDeleteDocument(document)}
              />
            ))}
          </div>
        ) : (
          <button className="document-empty" onClick={onAddDocuments}>
            <span>
              <FileText size={22} />
            </span>
            <strong>Drop a document anywhere</strong>
            <small>or click to choose a PDF or image</small>
          </button>
        )}
      </section>
    </div>
  )
}

function DetailRow({
  detail,
  maskAll,
  onEdit,
  onDelete,
  notify
}: {
  detail: Detail
  maskAll: boolean
  onEdit: () => void
  onDelete: () => void
  notify: Props['notify']
}) {
  const [revealed, setRevealed] = useState(false)
  const canConceal = detail.concealed || maskAll
  const hidden = canConceal && !revealed

  async function copy(): Promise<void> {
    try {
      await window.idVault.vault.copyText(detail.value)
      notify(`${detail.label} copied`)
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error), 'error')
    }
  }

  return (
    <article id={`vault-item-${detail.id}`} className="detail-row">
      <div className="detail-row-main">
        <div className="detail-label">
          <strong>{detail.label}</strong>
          {(detail.country || detail.note) && (
            <span>{[detail.country, detail.note].filter(Boolean).join(' · ')}</span>
          )}
        </div>
        <span className={hidden ? 'detail-value masked-value' : 'detail-value'}>
          {hidden ? maskValue(detail.value) : detail.value}
        </span>
      </div>
      <div className="detail-actions">
        {canConceal && (
          <IconButton
            label={revealed ? 'Hide value' : 'Reveal value'}
            onClick={() => setRevealed(!revealed)}
          >
            {revealed ? <EyeOff size={16} /> : <Eye size={16} />}
          </IconButton>
        )}
        <Button compact className="copy-button" icon={<Copy size={15} />} onClick={() => void copy()}>
          Copy
        </Button>
        <details className="action-menu">
          <summary aria-label={`More actions for ${detail.label}`} title="More actions">
            <MoreHorizontal size={17} />
          </summary>
          <div className="action-menu-popover">
            <button
              onClick={(event) => {
                event.currentTarget.closest('details')?.removeAttribute('open')
                onEdit()
              }}
            >
              <Pencil size={15} /> Edit
            </button>
            <button
              className="danger-action"
              onClick={(event) => {
                event.currentTarget.closest('details')?.removeAttribute('open')
                onDelete()
              }}
            >
              <Trash2 size={15} /> Remove
            </button>
          </div>
        </details>
      </div>
    </article>
  )
}
