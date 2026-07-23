import type { Detail, VaultDocument } from '../../shared/types'

export function formatError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message
    .replace(/^Error invoking remote method '[^']+': Error: /, '')
    .replace(/^Error: /, '')
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  }).format(new Date(value))
}

export function getInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (!words.length) return 'ID'
  return words
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join('')
}

export function maskValue(value: string): string {
  const compact = value.trim()
  if (compact.length <= 4) return '••••'
  const visible = compact.slice(-4)
  const masked = compact
    .slice(0, -4)
    .replace(/[A-Za-z0-9]/g, '•')
  return `${masked}${visible}`
}

export function detailMatches(detail: Detail, query: string): boolean {
  const value = `${detail.label} ${detail.value} ${detail.country ?? ''} ${detail.category}`
  return value.toLowerCase().includes(query.toLowerCase())
}

export function documentMatches(document: VaultDocument, query: string): boolean {
  const value = `${document.title} ${document.originalName} ${document.kind} ${document.country ?? ''}`
  return value.toLowerCase().includes(query.toLowerCase())
}

export function documentKindLabel(kind: VaultDocument['kind']): string {
  const labels: Record<VaultDocument['kind'], string> = {
    passport: 'Passport',
    'identity-card': 'Identity card',
    'driver-license': 'Driver license',
    'tax-document': 'Tax document',
    certificate: 'Certificate',
    other: 'Document'
  }
  return labels[kind]
}
