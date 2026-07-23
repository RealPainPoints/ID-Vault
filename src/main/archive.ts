import JSZip from 'jszip'
import { decryptArchive, encryptArchive } from './crypto'
import type { VaultState } from '../shared/types'

type ArchiveManifest = {
  format: 'idvault'
  version: 1
  exportedAt: string
  vault: VaultState
  files: Record<string, string>
}

export type ImportedArchive = {
  vault: VaultState
  documents: Map<string, Buffer>
}

const MAX_ARCHIVE_SIZE = 512 * 1024 * 1024
const MAX_FILES = 250
const MAX_DOCUMENTS = 200
const MAX_DOCUMENT_SIZE = 50 * 1024 * 1024
const MAX_DOCUMENT_BYTES = 450 * 1024 * 1024
const MAX_MANIFEST_SIZE = 5 * 1024 * 1024
const MAX_DETAILS = 5000

const DETAIL_CATEGORIES = new Set(['identity', 'tax', 'business', 'other'])
const DOCUMENT_KINDS = new Set([
  'passport',
  'identity-card',
  'driver-license',
  'tax-document',
  'certificate',
  'other'
])
const MIME_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/heic'
])
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

function safeArchiveName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._ -]/g, '_').slice(0, 160) || 'document'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isText(value: unknown, max: number, required = false): value is string {
  return typeof value === 'string' && value.length <= max && (!required || value.trim().length > 0)
}

function isOptionalText(value: unknown, max: number): boolean {
  return value === undefined || isText(value, max)
}

function isOptionalBoolean(value: unknown): boolean {
  return value === undefined || typeof value === 'boolean'
}

function isTimestamp(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 40 && Number.isFinite(Date.parse(value))
}

function hasUniqueCanonicalIds(values: unknown[]): boolean {
  const ids = values.map((value) => (isRecord(value) ? value.id : undefined))
  return (
    ids.every((id) => typeof id === 'string' && UUID_PATTERN.test(id)) &&
    new Set(ids).size === ids.length
  )
}

function isVaultState(value: unknown): value is VaultState {
  if (!isRecord(value)) return false
  const { profile, details, documents, preferences } = value
  if (
    value.version !== 1 ||
    !isRecord(profile) ||
    !Array.isArray(details) ||
    !Array.isArray(documents) ||
    !isRecord(preferences) ||
    details.length > MAX_DETAILS ||
    documents.length > MAX_DOCUMENTS ||
    !hasUniqueCanonicalIds(details) ||
    !hasUniqueCanonicalIds(documents) ||
    !isTimestamp(value.createdAt) ||
    !isTimestamp(value.updatedAt)
  ) {
    return false
  }

  if (
    !isText(profile.displayName, 80) ||
    !isText(profile.legalName, 120) ||
    !isText(profile.country, 80)
  ) {
    return false
  }

  if (
    !['system', 'light', 'dark'].includes(String(preferences.colorMode)) ||
    typeof preferences.maskSensitiveValues !== 'boolean' ||
    typeof preferences.widgetAlwaysOnTop !== 'boolean' ||
    !isOptionalBoolean(preferences.systemWidgetEnabled) ||
    typeof preferences.launchAtLogin !== 'boolean'
  ) {
    return false
  }

  const validDetails = details.every(
    (detail) =>
      isRecord(detail) &&
      isText(detail.label, 80, true) &&
      isText(detail.value, 300, true) &&
      typeof detail.category === 'string' &&
      DETAIL_CATEGORIES.has(detail.category) &&
      isOptionalText(detail.country, 80) &&
      isOptionalText(detail.note, 500) &&
      typeof detail.concealed === 'boolean' &&
      typeof detail.pinned === 'boolean' &&
      typeof detail.visibleInWidget === 'boolean' &&
      isOptionalBoolean(detail.visibleInSystemWidget) &&
      isTimestamp(detail.createdAt) &&
      isTimestamp(detail.updatedAt)
  )
  if (!validDetails) return false

  return documents.every(
    (document) =>
      isRecord(document) &&
      isText(document.title, 100, true) &&
      isText(document.originalName, 180, true) &&
      !/[\\/]/.test(document.originalName) &&
      typeof document.kind === 'string' &&
      DOCUMENT_KINDS.has(document.kind) &&
      typeof document.mimeType === 'string' &&
      MIME_TYPES.has(document.mimeType) &&
      typeof document.size === 'number' &&
      Number.isInteger(document.size) &&
      document.size >= 0 &&
      document.size <= MAX_DOCUMENT_SIZE &&
      isOptionalText(document.country, 80) &&
      isOptionalText(document.note, 500) &&
      isOptionalBoolean(document.visibleInSystemWidget) &&
      (document.expiresAt === undefined || /^\d{4}-\d{2}-\d{2}$/.test(String(document.expiresAt))) &&
      isTimestamp(document.createdAt) &&
      isTimestamp(document.updatedAt)
  )
}

export async function createArchive(
  vault: VaultState,
  readDocument: (id: string) => Promise<Buffer>,
  password: string
): Promise<Buffer> {
  if (vault.documents.length > MAX_DOCUMENTS) {
    throw new Error(`A vault can export up to ${MAX_DOCUMENTS} documents at a time.`)
  }
  const zip = new JSZip()
  const files: Record<string, string> = {}
  let totalDocumentBytes = 0

  for (const document of vault.documents) {
    const contents = await readDocument(document.id)
    if (contents.length > MAX_DOCUMENT_SIZE) {
      throw new Error(`“${document.title}” is larger than 50 MB.`)
    }
    totalDocumentBytes += contents.length
    if (totalDocumentBytes > MAX_DOCUMENT_BYTES) {
      throw new Error('This vault is too large for one portable archive. Remove a few documents first.')
    }
    const archivePath = `documents/${document.id}/${safeArchiveName(document.originalName)}`
    files[document.id] = archivePath
    zip.file(archivePath, contents, {
      binary: true,
      compression: 'DEFLATE'
    })
  }

  const manifest: ArchiveManifest = {
    format: 'idvault',
    version: 1,
    exportedAt: new Date().toISOString(),
    vault,
    files
  }
  zip.file('manifest.json', JSON.stringify(manifest), { compression: 'DEFLATE' })

  const zipped = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 }
  })
  return encryptArchive(zipped, password)
}

export async function readArchive(data: Buffer, password: string): Promise<ImportedArchive> {
  if (data.length > MAX_ARCHIVE_SIZE) {
    throw new Error('This archive is too large to import.')
  }

  const decrypted = decryptArchive(data, password)
  const zip = await JSZip.loadAsync(decrypted, {
    checkCRC32: true,
    createFolders: false
  })
  const entries = Object.values(zip.files)
  if (entries.filter((entry) => !entry.dir).length > MAX_FILES) {
    throw new Error('This archive contains too many files.')
  }
  const hasUnsafePath = entries.some((entry) => {
    const originalName =
      (entry as JSZip.JSZipObject & { unsafeOriginalName?: string }).unsafeOriginalName ?? entry.name
    return (
      originalName.startsWith('/') ||
      originalName.startsWith('\\') ||
      originalName.split(/[\\/]/).some((part) => part === '..')
    )
  })
  if (hasUnsafePath) {
    throw new Error('This archive contains an invalid file path.')
  }
  let declaredBytes = 0
  for (const entry of entries.filter((item) => !item.dir)) {
    const internalData = (entry as JSZip.JSZipObject & {
      _data?: { uncompressedSize?: number } | Promise<unknown>
    })._data
    const size =
      internalData && !('then' in internalData) ? internalData.uncompressedSize : 0
    if (typeof size !== 'number' || !Number.isFinite(size) || size < 0) {
      throw new Error('This archive contains invalid size metadata.')
    }
    const limit = entry.name === 'manifest.json' ? MAX_MANIFEST_SIZE : MAX_DOCUMENT_SIZE
    if (size > limit) throw new Error(`“${entry.name}” is too large to import.`)
    declaredBytes += size
    if (declaredBytes > MAX_DOCUMENT_BYTES + MAX_MANIFEST_SIZE) {
      throw new Error('This archive expands beyond the supported size.')
    }
  }

  const manifestEntry = zip.file('manifest.json')
  if (!manifestEntry) throw new Error('This archive does not contain a manifest.')

  const manifest = JSON.parse(await manifestEntry.async('string')) as Partial<ArchiveManifest>
  if (
    manifest.format !== 'idvault' ||
    manifest.version !== 1 ||
    !isVaultState(manifest.vault) ||
    !manifest.files ||
    typeof manifest.files !== 'object'
  ) {
    throw new Error('This archive format is not supported.')
  }

  const documents = new Map<string, Buffer>()
  if (manifest.vault.documents.length > MAX_DOCUMENTS) {
    throw new Error(`This archive contains more than ${MAX_DOCUMENTS} documents.`)
  }
  let totalDocumentBytes = 0
  for (const document of manifest.vault.documents) {
    const archivePath = manifest.files[document.id]
    if (!archivePath || archivePath.includes('..')) {
      throw new Error(`The file for “${document.title}” is missing.`)
    }
    const entry = zip.file(archivePath)
    if (!entry) throw new Error(`The file for “${document.title}” is missing.`)
    const contents = await entry.async('nodebuffer')
    if (contents.length > MAX_DOCUMENT_SIZE) {
      throw new Error(`“${document.title}” is larger than 50 MB.`)
    }
    totalDocumentBytes += contents.length
    if (totalDocumentBytes > MAX_DOCUMENT_BYTES) {
      throw new Error('This archive contains too much document data.')
    }
    if (contents.length !== document.size) {
      throw new Error(`The size recorded for “${document.title}” does not match its file.`)
    }
    documents.set(document.id, contents)
  }

  return { vault: manifest.vault, documents }
}
