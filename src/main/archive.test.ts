import { describe, expect, it } from 'vitest'
import type { VaultState } from '../shared/types'
import { createArchive, readArchive } from './archive'

function state(): VaultState {
  const date = '2026-07-21T10:00:00.000Z'
  return {
    version: 1,
    profile: {
      displayName: 'Alex',
      legalName: 'Alex Morgan',
      country: 'Germany'
    },
    details: [
      {
        id: '54f3b28e-6a43-47c9-b705-cb9c8a1f5871',
        label: 'Tax ID',
        value: '123456789',
        category: 'tax',
        concealed: true,
        pinned: true,
        visibleInWidget: false,
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
        originalName: 'passport.pdf',
        mimeType: 'application/pdf',
        size: 18,
        visibleInSystemWidget: false,
        createdAt: date,
        updatedAt: date
      }
    ],
    preferences: {
      colorMode: 'system',
      maskSensitiveValues: true,
      widgetAlwaysOnTop: false,
      systemWidgetEnabled: false,
      launchAtLogin: false
    },
    createdAt: date,
    updatedAt: date
  }
}

describe('ID Vault archive', () => {
  it('preserves details, metadata, and original document bytes', async () => {
    const vault = state()
    const source = Buffer.from('%PDF-identity-data')
    const archive = await createArchive(vault, async () => source, 'archive-password')
    const imported = await readArchive(archive, 'archive-password')

    expect(imported.vault).toEqual(vault)
    expect(imported.documents.get(vault.documents[0].id)).toEqual(source)
  })

  it('does not expose manifest values in the encrypted file', async () => {
    const vault = state()
    const archive = await createArchive(
      vault,
      async () => Buffer.from('%PDF-identity-data'),
      'archive-password'
    )

    expect(archive.toString('utf8')).not.toContain('123456789')
    expect(archive.toString('utf8')).not.toContain('Alex Morgan')
  })

  it('round-trips the maximum supported document count', async () => {
    const vault = state()
    vault.documents = Array.from({ length: 200 }, (_, index) => ({
      ...vault.documents[0],
      id: `00000000-0000-4000-8000-${index.toString(16).padStart(12, '0')}`,
      title: `Document ${index + 1}`,
      originalName: `document-${index + 1}.pdf`,
      size: 0
    }))
    const archive = await createArchive(vault, async () => Buffer.alloc(0), 'archive-password')
    const imported = await readArchive(archive, 'archive-password')

    expect(imported.vault.documents).toHaveLength(200)
    expect(imported.documents.size).toBe(200)
  })

  it('rejects non-canonical document identifiers', async () => {
    const vault = state()
    vault.documents[0].id = 'not-a-document-id'
    const archive = await createArchive(
      vault,
      async () => Buffer.from('%PDF-identity-data'),
      'archive-password'
    )

    await expect(readArchive(archive, 'archive-password')).rejects.toThrow(
      'This archive format is not supported.'
    )
  })
})
