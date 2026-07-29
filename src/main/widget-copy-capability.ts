import { createHmac, hkdfSync, timingSafeEqual } from 'node:crypto'
import type { Detail, Preferences } from '../shared/types'

type CopyableDetail = Pick<Detail, 'id' | 'updatedAt' | 'value'>
type WidgetCopyState = {
  details: Detail[]
  preferences: Pick<Preferences, 'systemWidgetEnabled'>
}

const capabilityPattern = /^[A-Za-z0-9_-]{43}$/
const capabilityContext = Buffer.from('id-vault-widget-actions-v1', 'utf8')

function capabilityKey(masterKey: Buffer): Buffer {
  if (masterKey.length !== 32) throw new Error('The vault key is not initialized.')
  return Buffer.from(hkdfSync('sha256', masterKey, Buffer.alloc(0), capabilityContext, 32))
}

function capabilityPayload(detail: CopyableDetail): string {
  return `widget-copy:v1\0${detail.id}\0${detail.updatedAt}\0${detail.value}`
}

export function createWidgetCopyCapability(
  masterKey: Buffer,
  detail: CopyableDetail
): string {
  return createHmac('sha256', capabilityKey(masterKey))
    .update(capabilityPayload(detail), 'utf8')
    .digest('base64url')
}

export function verifyWidgetCopyCapability(
  masterKey: Buffer,
  detail: CopyableDetail,
  capability: string
): boolean {
  if (!capabilityPattern.test(capability)) return false
  const expected = Buffer.from(createWidgetCopyCapability(masterKey, detail), 'base64url')
  const provided = Buffer.from(capability, 'base64url')
  return provided.length === expected.length && timingSafeEqual(provided, expected)
}

export function resolveWidgetCopyDetail(
  masterKey: Buffer,
  state: WidgetCopyState,
  detailId: string,
  capability: string
): Pick<Detail, 'label' | 'value'> | undefined {
  if (!state.preferences.systemWidgetEnabled) return undefined
  const detail = state.details.find(
    (candidate) => candidate.id === detailId && candidate.visibleInSystemWidget
  )
  if (!detail || !verifyWidgetCopyCapability(masterKey, detail, capability)) return undefined
  return { label: detail.label, value: detail.value }
}
