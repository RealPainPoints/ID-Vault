import { createHash } from 'node:crypto'
import type { VaultState } from '../shared/types'

export type SystemWidgetSnapshot = {
  version: 1
  revision: string
  updatedAt: string
  details: Array<{
    id: string
    label: string
    value: string
  }>
  documents: Array<{
    id: string
    title: string
    kind: string
  }>
}

function maskValue(value: string): string {
  const compact = value.trim()
  if (compact.length <= 4) return '••••'
  return `${compact.slice(0, -4).replace(/[A-Za-z0-9]/g, '•')}${compact.slice(-4)}`
}

export function createSystemWidgetSnapshot(state: VaultState): SystemWidgetSnapshot {
  const enabled = state.preferences.systemWidgetEnabled
  const details = enabled
    ? state.details
        .filter((detail) => detail.visibleInSystemWidget)
        .slice(0, 8)
        .map((detail) => ({
          id: detail.id,
          label: detail.label,
          value: maskValue(detail.value)
        }))
    : []
  const documents = enabled
    ? state.documents
        .filter((document) => document.visibleInSystemWidget)
        .slice(0, 8)
        .map((document) => ({
          id: document.id,
          title: document.title,
          kind: document.kind
        }))
    : []
  const content = JSON.stringify({ details, documents })

  return {
    version: 1,
    revision: createHash('sha256').update(content).digest('hex'),
    updatedAt: state.updatedAt,
    details,
    documents
  }
}
