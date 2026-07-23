import { useEffect, useRef, useState } from 'react'
import {
  Download,
  FileImage,
  FileText,
  GripVertical,
  MoreHorizontal,
  Pencil,
  Trash2
} from 'lucide-react'
import type { VaultDocument } from '../../../shared/types'
import { documentKindLabel, formatBytes, formatDate } from '../lib'
import { IconButton } from './UI'

export function DocumentPreview({ document }: { document: VaultDocument }) {
  const [preview, setPreview] = useState<string | null>(null)
  const [visible, setVisible] = useState(false)
  const previewRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!document.mimeType.startsWith('image/')) return
    const element = previewRef.current
    if (!element || !('IntersectionObserver' in window)) {
      setVisible(true)
      return
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return
        setVisible(true)
        observer.disconnect()
      },
      { rootMargin: '180px' }
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [document.id, document.mimeType])

  useEffect(() => {
    let active = true
    if (visible && document.mimeType.startsWith('image/')) {
      void window.idVault.vault
        .getDocumentPreview(document.id)
        .then((value) => {
          if (active) setPreview(value)
        })
        .catch(() => {
          if (active) setPreview(null)
        })
    }
    return () => {
      active = false
    }
  }, [document.id, document.mimeType, visible])

  return (
    <span ref={previewRef} className="document-preview-content">
      {preview ? (
        <img src={preview} alt="" />
      ) : document.mimeType === 'application/pdf' ? (
        <FileText />
      ) : (
        <FileImage />
      )}
    </span>
  )
}

export function DocumentCard({
  document,
  onOpen,
  onEdit,
  onSave,
  onDelete
}: {
  document: VaultDocument
  onOpen: () => void
  onEdit: () => void
  onSave: () => void
  onDelete: () => void
}) {
  return (
    <article id={`vault-item-${document.id}`} className="document-card">
      <button
        type="button"
        className="document-card-preview"
        draggable
        aria-label={`Open ${document.title}`}
        title="Drag this file into another app"
        onClick={onOpen}
        onDragStart={(event) => {
          event.preventDefault()
          void window.idVault.vault.startDocumentDrag(document.id)
        }}
      >
        <DocumentPreview document={document} />
        <span className="drag-badge">
          <GripVertical size={13} /> Drag
        </span>
      </button>
      <div className="document-card-info">
        <div>
          <h3>{document.title}</h3>
          <p>
            {documentKindLabel(document.kind)} · {formatBytes(document.size)}
          </p>
        </div>
        <details className="action-menu document-card-menu">
          <summary aria-label={`More actions for ${document.title}`} title="More actions">
            <MoreHorizontal size={17} />
          </summary>
          <div className="action-menu-popover">
            <button
              onClick={(event) => {
                event.currentTarget.closest('details')?.removeAttribute('open')
                onSave()
              }}
            >
              <Download size={15} /> Save a copy
            </button>
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

export function DocumentRow({
  document,
  onOpen,
  onEdit,
  onSave,
  onDelete,
  compact = false
}: {
  document: VaultDocument
  onOpen: () => void
  onEdit?: () => void
  onSave?: () => void
  onDelete?: () => void
  compact?: boolean
}) {
  return (
    <div className={`document-row ${compact ? 'document-row-compact' : ''}`}>
      <div
        className="document-row-preview"
        draggable
        title="Drag this file into another app"
        onDragStart={(event) => {
          event.preventDefault()
          void window.idVault.vault.startDocumentDrag(document.id)
        }}
      >
        <DocumentPreview document={document} />
      </div>
      <button className="document-row-main" onClick={onOpen}>
        <strong>{document.title}</strong>
        <span>
          {documentKindLabel(document.kind)} · {formatBytes(document.size)}
        </span>
      </button>
      {!compact && (
        <div className="document-row-meta">
          <span>{document.expiresAt ? `Expires ${formatDate(document.expiresAt)}` : 'No expiry'}</span>
          <small>{document.country || '—'}</small>
        </div>
      )}
      <div className="document-row-actions">
        {onEdit && (
          <IconButton label="Edit document details" onClick={onEdit}>
            <Pencil size={16} />
          </IconButton>
        )}
        {onSave && (
          <IconButton label="Save a copy" onClick={onSave}>
            <Download size={16} />
          </IconButton>
        )}
        {onDelete && (
          <IconButton label="Delete document" onClick={onDelete}>
            <Trash2 size={16} />
          </IconButton>
        )}
        {compact && (
          <span
            className="drag-handle"
            title="Drag to use this document"
            draggable
            onDragStart={(event) => {
              event.preventDefault()
              void window.idVault.vault.startDocumentDrag(document.id)
            }}
          >
            <GripVertical size={16} />
          </span>
        )}
        {!compact && !onDelete && <MoreHorizontal size={16} />}
      </div>
    </div>
  )
}
