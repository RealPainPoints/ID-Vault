import { useEffect, useId, useRef } from 'react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { ShieldCheck, X } from 'lucide-react'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  icon?: ReactNode
  tone?: 'primary' | 'secondary' | 'ghost' | 'danger'
  compact?: boolean
}

export function Button({
  icon,
  children,
  tone = 'secondary',
  compact = false,
  className = '',
  ...props
}: ButtonProps) {
  return (
    <button
      className={`button button-${tone} ${compact ? 'button-compact' : ''} ${className}`}
      {...props}
    >
      {icon}
      {children}
    </button>
  )
}

export function IconButton({
  label,
  children,
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; children: ReactNode }) {
  return (
    <button className={`icon-button ${className}`} aria-label={label} title={label} {...props}>
      {children}
    </button>
  )
}

export function AppMark({ small = false }: { small?: boolean }) {
  return (
    <span className={`app-mark ${small ? 'app-mark-small' : ''}`} aria-hidden="true">
      <ShieldCheck strokeWidth={2.2} />
    </span>
  )
}

export function Modal({
  title,
  description,
  children,
  onClose,
  width = 'medium',
  dismissible = true
}: {
  title: string
  description?: string
  children: ReactNode
  onClose: () => void
  width?: 'small' | 'medium' | 'large'
  dismissible?: boolean
}) {
  const modalRef = useRef<HTMLElement>(null)
  const openerRef = useRef<HTMLElement | null>(
    typeof document !== 'undefined' && document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
  )
  const closeRef = useRef(onClose)
  const dismissibleRef = useRef(dismissible)
  const titleId = useId()
  const descriptionId = useId()
  closeRef.current = onClose
  dismissibleRef.current = dismissible

  useEffect(() => {
    const focusableSelector =
      'a[href], area[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), iframe, object, embed, [contenteditable]:not([contenteditable="false"]), [tabindex]:not([tabindex="-1"])'
    const isVisible = (element: HTMLElement): boolean => {
      const style = window.getComputedStyle(element)
      return style.display !== 'none' && style.visibility !== 'hidden' && element.getClientRects().length > 0
    }
    const getFocusableElements = (modal: HTMLElement): HTMLElement[] =>
      Array.from(modal.querySelectorAll<HTMLElement>(focusableSelector)).filter(
        (element) => !element.closest('[inert]') && isVisible(element)
      )
    const focusInside = (): void => {
      const modal = modalRef.current
      if (!modal || modal.contains(document.activeElement)) return
      const autofocusElement = modal.querySelector<HTMLElement>('[autofocus]')
      if (autofocusElement && isVisible(autofocusElement)) autofocusElement.focus()
      if (modal.contains(document.activeElement)) return
      const focusable = getFocusableElements(modal)
      const initialFocus = focusable.find((element) => !element.hasAttribute('data-modal-close'))
      ;(initialFocus ?? focusable[0] ?? modal).focus()
    }
    const frame = requestAnimationFrame(focusInside)
    const handleKeyDown = (event: KeyboardEvent): void => {
      const modal = modalRef.current
      if (!modal) return
      const dialogs = document.querySelectorAll('[role="dialog"][aria-modal="true"]')
      if (dialogs[dialogs.length - 1] !== modal) return
      if (event.key === 'Escape' && dismissibleRef.current) {
        event.preventDefault()
        event.stopPropagation()
        closeRef.current()
        return
      }
      if (event.key !== 'Tab') return
      const focusable = getFocusableElements(modal)
      if (!focusable.length) {
        event.preventDefault()
        modal.focus()
        return
      }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (!modal.contains(document.activeElement)) {
        event.preventDefault()
        ;(event.shiftKey ? last : first).focus()
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', handleKeyDown, true)
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('keydown', handleKeyDown, true)
      if (openerRef.current?.isConnected) openerRef.current.focus()
    }
  }, [])

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={dismissible ? onClose : undefined}
    >
      <section
        ref={modalRef}
        className={`modal modal-${width}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="modal-header">
          <div>
            <h2 id={titleId}>{title}</h2>
            {description && <p id={descriptionId}>{description}</p>}
          </div>
          <IconButton
            label="Close"
            onClick={onClose}
            disabled={!dismissible}
            data-modal-close
          >
            <X size={18} />
          </IconButton>
        </header>
        {children}
      </section>
    </div>
  )
}

export function Toggle({
  checked,
  onChange,
  label
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
}) {
  return (
    <button
      type="button"
      className={`toggle ${checked ? 'toggle-on' : ''}`}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
    >
      <span />
    </button>
  )
}

export function Toasts({ toasts }: { toasts: { id: number; message: string; tone: string }[] }) {
  return (
    <div className="toast-stack" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast-${toast.tone}`}>
          {toast.message}
        </div>
      ))}
    </div>
  )
}

export function EmptyState({
  icon,
  title,
  description,
  action
}: {
  icon: ReactNode
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">{icon}</span>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  )
}
