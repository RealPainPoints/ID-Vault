import { describe, expect, it } from 'vitest'
import type { Detail, VaultDocument } from '../../shared/types'
import {
  detailMatches,
  documentKindLabel,
  documentMatches,
  formatBytes,
  formatError,
  getInitials,
  maskValue
} from './lib'

const detail: Detail = {
  id: 'detail-1',
  label: 'German Tax ID',
  value: '12 345 678 901',
  category: 'tax',
  country: 'Germany',
  note: 'Private note',
  concealed: true,
  pinned: false,
  visibleInWidget: true,
  visibleInSystemWidget: true,
  createdAt: '2026-07-23T00:00:00.000Z',
  updatedAt: '2026-07-23T00:00:00.000Z'
}

const document: VaultDocument = {
  id: 'document-1',
  title: 'Current Passport',
  kind: 'passport',
  originalName: 'passport-front.pdf',
  mimeType: 'application/pdf',
  size: 1_048_576,
  country: 'Germany',
  visibleInSystemWidget: true,
  createdAt: '2026-07-23T00:00:00.000Z',
  updatedAt: '2026-07-23T00:00:00.000Z'
}

describe('renderer formatting', () => {
  it('removes IPC boilerplate from errors', () => {
    expect(
      formatError(
        new Error("Error invoking remote method 'vault:save': Error: Unable to save vault")
      )
    ).toBe('Unable to save vault')
    expect(formatError('Error: Invalid password')).toBe('Invalid password')
  })

  it('formats file sizes at each unit boundary', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1024)).toBe('1 KB')
    expect(formatBytes(1_048_576)).toBe('1.0 MB')
  })

  it('creates compact initials with a safe empty fallback', () => {
    expect(getInitials('  Ada   Lovelace Byron ')).toBe('AL')
    expect(getInitials('cher')).toBe('C')
    expect(getInitials('   ')).toBe('ID')
  })

  it('masks all but the final four characters while preserving separators', () => {
    expect(maskValue('1234')).toBe('••••')
    expect(maskValue('ABCD1234')).toBe('••••1234')
    expect(maskValue('12-345-6789')).toBe('••-•••-6789')
    expect(maskValue('  ABCD1234  ')).toBe('••••1234')
  })
})

describe('renderer search', () => {
  it.each(['german', '678 901', 'TAX', 'Germany'])('finds details by %s', (query) => {
    expect(detailMatches(detail, query)).toBe(true)
  })

  it('does not match unrelated or private note-only text', () => {
    expect(detailMatches(detail, 'passport')).toBe(false)
    expect(detailMatches(detail, 'Private note')).toBe(false)
  })

  it.each(['current', 'passport-front', 'PASSPORT', 'germany'])(
    'finds documents by %s',
    (query) => {
      expect(documentMatches(document, query)).toBe(true)
    }
  )

  it('does not match unrelated documents', () => {
    expect(documentMatches(document, 'driver license')).toBe(false)
  })
})

describe('document labels', () => {
  it.each([
    ['passport', 'Passport'],
    ['identity-card', 'Identity card'],
    ['driver-license', 'Driver license'],
    ['tax-document', 'Tax document'],
    ['certificate', 'Certificate'],
    ['other', 'Document']
  ] as const)('labels %s as %s', (kind, label) => {
    expect(documentKindLabel(kind)).toBe(label)
  })
})
