import { describe, expect, it } from 'vitest'
import type { VaultState } from '../shared/types'
import { createSystemWidgetSnapshot } from './system-widget-snapshot'

const copyToken = 'A'.repeat(43)
const createCopyToken = (): string => copyToken

function state(): VaultState {
  const date = '2026-07-21T10:00:00.000Z'
  return {
    version: 1,
    profile: { displayName: 'Alex', legalName: 'Alex Morgan', country: 'Germany' },
    details: [
      {
        id: '54f3b28e-6a43-47c9-b705-cb9c8a1f5871',
        label: 'Tax ID',
        value: '123456789',
        category: 'tax',
        note: 'Private note',
        concealed: true,
        pinned: true,
        visibleInWidget: true,
        visibleInSystemWidget: true,
        createdAt: date,
        updatedAt: date
      },
      {
        id: 'aaeece60-e3d1-4baf-8c99-738342b69e70',
        label: 'Hidden',
        value: 'never-publish',
        category: 'other',
        concealed: true,
        pinned: false,
        visibleInWidget: true,
        visibleInSystemWidget: false,
        createdAt: date,
        updatedAt: date
      }
    ],
    documents: [
      {
        id: '72e2ab41-660e-4161-a596-7ee031275d10',
        title: 'Passport',
        kind: 'passport',
        originalName: 'secret-passport.pdf',
        mimeType: 'application/pdf',
        size: 18,
        expiresAt: '2031-04-12',
        note: 'Never publish this',
        visibleInSystemWidget: true,
        createdAt: date,
        updatedAt: date
      }
    ],
    preferences: {
      colorMode: 'system',
      maskSensitiveValues: false,
      widgetAlwaysOnTop: false,
      systemWidgetEnabled: true,
      launchAtLogin: false
    },
    createdAt: date,
    updatedAt: date
  }
}

describe('system widget snapshot', () => {
  it('publishes only opted-in masked content', () => {
    const snapshot = createSystemWidgetSnapshot(state(), createCopyToken)
    const serialized = JSON.stringify(snapshot)

    expect(snapshot.details).toEqual([
      {
        id: '54f3b28e-6a43-47c9-b705-cb9c8a1f5871',
        label: 'Tax ID',
        value: '•••••6789',
        copyToken
      }
    ])
    expect(snapshot.documents).toHaveLength(1)
    expect(serialized).not.toContain('123456789')
    expect(serialized).not.toContain('never-publish')
    expect(serialized).not.toContain('Alex Morgan')
    expect(serialized).not.toContain('secret-passport.pdf')
    expect(serialized).not.toContain('2031-04-12')
    expect(serialized).not.toContain('Private note')
  })

  it('publishes an empty snapshot when disabled', () => {
    const vault = state()
    vault.preferences.systemWidgetEnabled = false
    const snapshot = createSystemWidgetSnapshot(vault, createCopyToken)

    expect(snapshot.details).toEqual([])
    expect(snapshot.documents).toEqual([])
  })

  it('keeps the revision stable for unrelated private changes', () => {
    const first = state()
    const second = state()
    second.profile.legalName = 'Different private name'
    second.updatedAt = '2026-07-21T11:00:00.000Z'

    expect(createSystemWidgetSnapshot(first, createCopyToken).revision).toBe(
      createSystemWidgetSnapshot(second, createCopyToken).revision
    )
  })
})
