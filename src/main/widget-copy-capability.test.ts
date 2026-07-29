import { describe, expect, it } from 'vitest'
import {
  createWidgetCopyCapability,
  resolveWidgetCopyDetail,
  verifyWidgetCopyCapability
} from './widget-copy-capability'
import type { Detail } from '../shared/types'

const key = Buffer.alloc(32, 7)
const detail: Detail = {
  id: '54f3b28e-6a43-47c9-b705-cb9c8a1f5871',
  label: 'Tax ID',
  category: 'tax',
  concealed: true,
  pinned: true,
  visibleInWidget: true,
  visibleInSystemWidget: true,
  createdAt: '2026-07-29T12:00:00.000Z',
  updatedAt: '2026-07-29T12:00:00.000Z',
  value: '12 345 678 901'
}

describe('widget copy capabilities', () => {
  it('authorizes the exact detail version', () => {
    const capability = createWidgetCopyCapability(key, detail)

    expect(capability).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(verifyWidgetCopyCapability(key, detail, capability)).toBe(true)
  })

  it('rejects changed details, keys, and malformed capabilities', () => {
    const capability = createWidgetCopyCapability(key, detail)

    expect(
      verifyWidgetCopyCapability(key, { ...detail, updatedAt: '2026-07-29T12:01:00.000Z' }, capability)
    ).toBe(false)
    expect(verifyWidgetCopyCapability(key, { ...detail, value: 'replacement' }, capability)).toBe(false)
    expect(verifyWidgetCopyCapability(Buffer.alloc(32, 8), detail, capability)).toBe(false)
    expect(verifyWidgetCopyCapability(key, detail, 'not-a-capability')).toBe(false)
  })

  it('resolves only enabled and visible details with a current capability', () => {
    const capability = createWidgetCopyCapability(key, detail)
    const enabledState = {
      details: [detail],
      preferences: { systemWidgetEnabled: true }
    }

    expect(resolveWidgetCopyDetail(key, enabledState, detail.id, capability)).toEqual({
      label: detail.label,
      value: detail.value
    })
    expect(
      resolveWidgetCopyDetail(
        key,
        { ...enabledState, preferences: { systemWidgetEnabled: false } },
        detail.id,
        capability
      )
    ).toBeUndefined()
    expect(
      resolveWidgetCopyDetail(
        key,
        { ...enabledState, details: [{ ...detail, visibleInSystemWidget: false }] },
        detail.id,
        capability
      )
    ).toBeUndefined()
    expect(
      resolveWidgetCopyDetail(
        key,
        enabledState,
        'd3469906-47d6-4eba-a44b-f76cc00ce942',
        capability
      )
    ).toBeUndefined()
    expect(resolveWidgetCopyDetail(key, enabledState, detail.id, 'A'.repeat(43))).toBeUndefined()
  })
})
