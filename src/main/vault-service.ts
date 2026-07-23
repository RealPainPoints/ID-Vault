import { app, safeStorage } from 'electron'
import { randomBytes, randomUUID } from 'node:crypto'
import {
  chmod,
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile
} from 'node:fs/promises'
import { basename, dirname, extname, join } from 'node:path'
import { createArchive, readArchive } from './archive'
import { decryptLocal, encryptLocal } from './crypto'
import type {
  Detail,
  DetailInput,
  DocumentInput,
  DocumentMetadataInput,
  ImportMode,
  PreferencesInput,
  ProfileInput,
  VaultDocument,
  VaultState
} from '../shared/types'

const MAX_DOCUMENT_SIZE = 50 * 1024 * 1024
const MAX_ARCHIVE_SIZE = 512 * 1024 * 1024
const MAX_DOCUMENTS = 200
const MAX_DETAILS = 5000
const ALLOWED_EXTENSIONS = new Set(['.pdf', '.png', '.jpg', '.jpeg', '.webp', '.heic'])
const DOCUMENT_KINDS = new Set([
  'passport',
  'identity-card',
  'driver-license',
  'tax-document',
  'certificate',
  'other'
])

const MIME_TYPES: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.heic': 'image/heic'
}

function now(): string {
  return new Date().toISOString()
}

function initialState(): VaultState {
  const timestamp = now()
  return {
    version: 1,
    profile: {
      displayName: '',
      legalName: '',
      country: ''
    },
    details: [],
    documents: [],
    preferences: {
      colorMode: 'system',
      maskSensitiveValues: true,
      widgetAlwaysOnTop: false,
      systemWidgetEnabled: false,
      launchAtLogin: false
    },
    createdAt: timestamp,
    updatedAt: timestamp
  }
}

function cleanText(value: unknown, maxLength = 500): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
}

function inferTitle(path: string): string {
  return basename(path, extname(path)).replace(/[_-]+/g, ' ').trim().slice(0, 100) || 'Document'
}

function inferKind(path: string): VaultDocument['kind'] {
  const value = basename(path).toLowerCase()
  if (value.includes('passport')) return 'passport'
  if (value.includes('driver') || value.includes('licence') || value.includes('license')) {
    return 'driver-license'
  }
  if (value.includes('tax') || value.includes('vat')) return 'tax-document'
  if (value.includes('certificate')) return 'certificate'
  if (value.includes('identity') || value.includes('id-card') || value.includes('id_card')) {
    return 'identity-card'
  }
  return 'other'
}

function processIsRunning(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}

async function atomicWriteFile(target: string, contents: Buffer): Promise<void> {
  const pending = `${target}.${randomUUID()}.partial`
  try {
    const handle = await open(pending, 'wx', 0o600)
    try {
      await handle.writeFile(contents)
      await handle.sync()
    } finally {
      await handle.close()
    }
    await rename(pending, target)
    const directory = await open(dirname(target), 'r').catch(() => null)
    if (directory) {
      try {
        await directory.sync().catch(() => undefined)
      } finally {
        await directory.close()
      }
    }
  } catch (error) {
    await rm(pending, { force: true })
    throw error
  }
}

export class VaultService {
  private readonly root: string
  private readonly documentsRoot: string
  private readonly statePath: string
  private readonly keyPath: string
  private readonly tempRoot: string
  private key: Buffer = Buffer.alloc(0)
  private state: VaultState = initialState()
  private readonly tempTimers = new Map<string, NodeJS.Timeout>()

  constructor(private readonly onChange: (state: VaultState) => void) {
    this.root = join(app.getPath('userData'), 'vault')
    this.documentsRoot = join(this.root, 'documents')
    this.statePath = join(this.root, 'vault.data')
    this.keyPath = join(this.root, 'master.key')
    this.tempRoot = join(app.getPath('temp'), `id-vault-${process.pid}`)
  }

  async initialize(): Promise<void> {
    const tempEntries = await readdir(app.getPath('temp'), { withFileTypes: true })
    await Promise.all(
      tempEntries
        .filter((entry) => {
          const match = /^id-vault-(\d+)$/.exec(entry.name)
          return entry.isDirectory() && Boolean(match) && !processIsRunning(Number(match?.[1]))
        })
        .map((entry) => rm(join(app.getPath('temp'), entry.name), { recursive: true, force: true }))
    )
    await mkdir(this.documentsRoot, { recursive: true, mode: 0o700 })
    await mkdir(this.tempRoot, { recursive: true, mode: 0o700 })
    this.key = await this.loadOrCreateKey()

    try {
      const encrypted = await readFile(this.statePath)
      const parsed = JSON.parse(
        decryptLocal(encrypted, this.key, 'vault-state').toString('utf8')
      ) as VaultState
      this.state = this.normalizeState(parsed)
      const referencedFiles = new Set(this.state.documents.map((document) => `${document.id}.data`))
      const storedFiles = await readdir(this.documentsRoot)
      await Promise.all(
        storedFiles
          .filter((file) => /^[0-9a-f-]{36}\.data$/i.test(file) && !referencedFiles.has(file))
          .map((file) => rm(join(this.documentsRoot, file), { force: true }))
      )
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      this.state = initialState()
      await this.persist()
    }
  }

  async cleanup(): Promise<void> {
    for (const timer of this.tempTimers.values()) clearTimeout(timer)
    this.tempTimers.clear()
    this.key.fill(0)
    await rm(this.tempRoot, { recursive: true, force: true })
  }

  get(): VaultState {
    return structuredClone(this.state)
  }

  async saveDetail(input: DetailInput): Promise<VaultState> {
    const previousState = this.get()
    const timestamp = now()
    const existing = input.id ? this.state.details.find((detail) => detail.id === input.id) : undefined
    const label = cleanText(input.label, 80)
    const value = cleanText(input.value, 300)
    if (!label || !value) throw new Error('A label and value are required.')
    if (!['identity', 'tax', 'business', 'other'].includes(input.category)) {
      throw new Error('This detail category is not valid.')
    }
    if (!existing && this.state.details.length >= MAX_DETAILS) {
      throw new Error(`A vault can hold up to ${MAX_DETAILS} details.`)
    }

    const detail: Detail = {
      id: existing?.id ?? randomUUID(),
      label,
      value,
      category: input.category,
      country: cleanText(input.country, 80) || undefined,
      note: cleanText(input.note, 500) || undefined,
      concealed: Boolean(input.concealed),
      pinned: Boolean(input.pinned),
      visibleInWidget: Boolean(input.visibleInWidget),
      visibleInSystemWidget: Boolean(input.visibleInSystemWidget),
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp
    }

    this.state.details = existing
      ? this.state.details.map((item) => (item.id === detail.id ? detail : item))
      : [detail, ...this.state.details]
    return this.commitOrRestore(previousState)
  }

  async removeDetail(id: string): Promise<VaultState> {
    const previousState = this.get()
    this.state.details = this.state.details.filter((detail) => detail.id !== id)
    return this.commitOrRestore(previousState)
  }

  async updateProfile(input: ProfileInput): Promise<VaultState> {
    const previousState = this.get()
    this.state.profile = {
      displayName:
        input.displayName === undefined
          ? this.state.profile.displayName
          : cleanText(input.displayName, 80),
      legalName:
        input.legalName === undefined ? this.state.profile.legalName : cleanText(input.legalName, 120),
      country:
        input.country === undefined ? this.state.profile.country : cleanText(input.country, 80)
    }
    return this.commitOrRestore(previousState)
  }

  async updatePreferences(input: PreferencesInput): Promise<VaultState> {
    if (
      (input.colorMode !== undefined && !['system', 'light', 'dark'].includes(input.colorMode)) ||
      (input.maskSensitiveValues !== undefined && typeof input.maskSensitiveValues !== 'boolean') ||
      (input.widgetAlwaysOnTop !== undefined && typeof input.widgetAlwaysOnTop !== 'boolean') ||
      (input.systemWidgetEnabled !== undefined && typeof input.systemWidgetEnabled !== 'boolean') ||
      (input.launchAtLogin !== undefined && typeof input.launchAtLogin !== 'boolean')
    ) {
      throw new Error('These preferences are not valid.')
    }
    const previousState = this.get()
    this.state.preferences = { ...this.state.preferences, ...input }
    return this.commitOrRestore(previousState)
  }

  async addDocuments(inputs: DocumentInput[]): Promise<VaultState> {
    if (!inputs.length) return this.get()
    if (inputs.length > 20) throw new Error('Add up to 20 documents at a time.')
    if (this.state.documents.length + inputs.length > MAX_DOCUMENTS) {
      throw new Error(`A vault can hold up to ${MAX_DOCUMENTS} documents.`)
    }

    const added: VaultDocument[] = []
    const previousState = this.get()
    try {
      for (const input of inputs) {
        if (!input || typeof input.path !== 'string' || !input.path) {
          throw new Error('A document path is required.')
        }
        const extension = extname(input.path).toLowerCase()
        if (!ALLOWED_EXTENSIONS.has(extension)) {
          throw new Error('Use a PDF, PNG, JPEG, WebP, or HEIC file.')
        }
        const fileStat = await stat(input.path)
        if (!fileStat.isFile()) throw new Error('Only files can be added.')
        if (fileStat.size > MAX_DOCUMENT_SIZE) {
          throw new Error('Documents must be smaller than 50 MB.')
        }

        const id = randomUUID()
        const timestamp = now()
        const originalName = basename(input.path).slice(0, 180)
        const document: VaultDocument = {
          id,
          title: cleanText(input.title, 100) || inferTitle(input.path),
          kind: input.kind ?? inferKind(input.path),
          originalName,
          mimeType: MIME_TYPES[extension],
          size: fileStat.size,
          country: cleanText(input.country, 80) || undefined,
          expiresAt: cleanText(input.expiresAt, 10) || undefined,
          note: cleanText(input.note, 500) || undefined,
          visibleInSystemWidget: Boolean(input.visibleInSystemWidget),
          createdAt: timestamp,
          updatedAt: timestamp
        }
        const contents = await readFile(input.path)
        document.size = contents.length
        await this.writeDocument(id, contents)
        added.push(document)
      }
    } catch (error) {
      await Promise.all(added.map((document) => rm(this.documentPath(document.id), { force: true })))
      throw error
    }

    this.state.documents = [...added, ...this.state.documents]
    try {
      return await this.commitOrRestore(previousState)
    } catch (error) {
      await Promise.all(added.map((document) => rm(this.documentPath(document.id), { force: true })))
      throw error
    }
  }

  async removeDocument(id: string): Promise<VaultState> {
    if (!this.state.documents.some((document) => document.id === id)) return this.get()
    const previousState = this.get()
    this.state.documents = this.state.documents.filter((document) => document.id !== id)
    const snapshot = await this.commitOrRestore(previousState)
    await rm(this.documentPath(id), { force: true }).catch(() => undefined)
    await this.removeMaterializedDocument(id).catch(() => undefined)
    return snapshot
  }

  async saveDocument(input: DocumentMetadataInput): Promise<VaultState> {
    const previousState = this.get()
    const existing = this.requireDocument(input.id)
    const title = cleanText(input.title, 100)
    if (!title) throw new Error('A document title is required.')
    if (!DOCUMENT_KINDS.has(input.kind)) throw new Error('This document type is not valid.')
    const expiresAt = cleanText(input.expiresAt, 10)
    if (expiresAt && !/^\d{4}-\d{2}-\d{2}$/.test(expiresAt)) {
      throw new Error('Use a valid expiry date.')
    }
    const updated: VaultDocument = {
      ...existing,
      title,
      kind: input.kind,
      country: cleanText(input.country, 80) || undefined,
      expiresAt: expiresAt || undefined,
      note: cleanText(input.note, 500) || undefined,
      visibleInSystemWidget: Boolean(input.visibleInSystemWidget),
      updatedAt: now()
    }
    this.state.documents = this.state.documents.map((document) =>
      document.id === updated.id ? updated : document
    )
    return this.commitOrRestore(previousState)
  }

  async readDocument(id: string): Promise<Buffer> {
    const document = this.requireDocument(id)
    const encrypted = await readFile(this.documentPath(document.id))
    return decryptLocal(encrypted, this.key, `document:${document.id}`)
  }

  async materializeDocument(id: string): Promise<string> {
    const document = this.requireDocument(id)
    const safeName = document.originalName.replace(/[^a-zA-Z0-9._ -]/g, '_').slice(0, 120)
    const target = join(this.tempRoot, `${document.id}-${safeName}`)
    await writeFile(target, await this.readDocument(id), { mode: 0o600 })
    const existingTimer = this.tempTimers.get(target)
    if (existingTimer) clearTimeout(existingTimer)
    const timer = setTimeout(() => {
      this.tempTimers.delete(target)
      void rm(target, { force: true })
    }, 15 * 60 * 1000)
    timer.unref()
    this.tempTimers.set(target, timer)
    return target
  }

  async exportArchive(password: string, target: string): Promise<void> {
    const archive = await createArchive(this.get(), (id) => this.readDocument(id), password)
    await atomicWriteFile(target, archive)
  }

  async importArchive(password: string, source: string, mode: ImportMode): Promise<{
    details: number
    documents: number
  }> {
    if (mode !== 'merge' && mode !== 'replace') throw new Error('This import mode is not valid.')
    const archiveStat = await stat(source)
    if (!archiveStat.isFile() || archiveStat.size > MAX_ARCHIVE_SIZE) {
      throw new Error('This archive is too large to import.')
    }
    const archive = await readArchive(await readFile(source), password)
    const timestamp = now()
    const previousState = this.get()
    const stagingRoot = join(this.root, `.import-${randomUUID()}`)
    await mkdir(stagingRoot, { recursive: false, mode: 0o700 })

    if (mode === 'replace') {
      const backupRoot = join(this.root, `.documents-backup-${randomUUID()}`)
      try {
        for (const document of archive.vault.documents) {
          const contents = archive.documents.get(document.id)
          if (!contents) throw new Error(`The file for “${document.title}” is missing.`)
          await this.writeDocumentTo(stagingRoot, document.id, contents)
        }
        await this.clearMaterializedDocuments()
        await rename(this.documentsRoot, backupRoot)
        try {
          await rename(stagingRoot, this.documentsRoot)
          this.state = this.normalizeState({ ...archive.vault, updatedAt: timestamp })
          await this.commit()
        } catch (error) {
          this.state = previousState
          await rm(this.documentsRoot, { recursive: true, force: true })
          await rename(backupRoot, this.documentsRoot)
          throw error
        }
        await rm(backupRoot, { recursive: true, force: true }).catch(() => undefined)
      } finally {
        await rm(stagingRoot, { recursive: true, force: true })
      }
    } else {
      const currentDetailIds = new Set(this.state.details.map((detail) => detail.id))
      const importedDetails = archive.vault.details.map((detail) => ({
        ...detail,
        id: currentDetailIds.has(detail.id) ? randomUUID() : detail.id,
        visibleInSystemWidget: Boolean(detail.visibleInSystemWidget),
        updatedAt: timestamp
      }))
      const currentDocumentIds = new Set(this.state.documents.map((document) => document.id))
      const importedDocuments: VaultDocument[] = []
      const movedIds: string[] = []
      try {
        for (const document of archive.vault.documents) {
          const sourceId = document.id
          const id = currentDocumentIds.has(sourceId) ? randomUUID() : sourceId
          const contents = archive.documents.get(sourceId)
          if (!contents) throw new Error(`The file for “${document.title}” is missing.`)
          await this.writeDocumentTo(stagingRoot, id, contents)
          importedDocuments.push({
            ...document,
            id,
            visibleInSystemWidget: Boolean(document.visibleInSystemWidget),
            updatedAt: timestamp
          })
        }
        for (const document of importedDocuments) {
          await rename(
            this.documentPathAt(stagingRoot, document.id),
            this.documentPath(document.id)
          )
          movedIds.push(document.id)
        }
        this.state.details = [...importedDetails, ...this.state.details]
        this.state.documents = [...importedDocuments, ...this.state.documents]
        this.state.profile = {
          displayName: this.state.profile.displayName || archive.vault.profile.displayName,
          legalName: this.state.profile.legalName || archive.vault.profile.legalName,
          country: this.state.profile.country || archive.vault.profile.country
        }
        await this.commit()
      } catch (error) {
        this.state = previousState
        await Promise.all(movedIds.map((id) => rm(this.documentPath(id), { force: true })))
        throw error
      } finally {
        await rm(stagingRoot, { recursive: true, force: true })
      }
    }

    return {
      details: archive.vault.details.length,
      documents: archive.vault.documents.length
    }
  }

  private async loadOrCreateKey(): Promise<Buffer> {
    try {
      const stored = await readFile(this.keyPath)
      const mode = stored.subarray(0, 1).toString('utf8')
      const payload = stored.subarray(1)
      if (mode === 'S') {
        return Buffer.from(safeStorage.decryptString(payload), 'base64')
      }
      if (mode === 'P') {
        throw new Error('This vault used an insecure legacy key and cannot be opened safely.')
      }
      throw new Error('The vault key is not valid.')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      const secureBackendAvailable =
        safeStorage.isEncryptionAvailable() &&
        (process.platform !== 'linux' || safeStorage.getSelectedStorageBackend() !== 'basic_text')
      if (!secureBackendAvailable) {
        throw new Error(
          'Secure credential storage is unavailable. Enable Keychain, Credential Manager, or a Linux secret service and reopen ID Vault.'
        )
      }
      const key = randomBytes(32)
      const payload = Buffer.concat([
        Buffer.from('S'),
        safeStorage.encryptString(key.toString('base64'))
      ])
      await writeFile(this.keyPath, payload, { mode: 0o600 })
      await chmod(this.keyPath, 0o600)
      return key
    }
  }

  private normalizeState(state: VaultState): VaultState {
    const fallback = initialState()
    return {
      ...fallback,
      ...state,
      version: 1,
      profile: { ...fallback.profile, ...state.profile },
      details: Array.isArray(state.details)
        ? state.details.map((detail) => ({
            ...detail,
            visibleInSystemWidget: Boolean(detail.visibleInSystemWidget)
          }))
        : [],
      documents: Array.isArray(state.documents)
        ? state.documents.map((document) => ({
            ...document,
            visibleInSystemWidget: Boolean(document.visibleInSystemWidget)
          }))
        : [],
      preferences: { ...fallback.preferences, ...state.preferences }
    }
  }

  private requireDocument(id: string): VaultDocument {
    const document = this.state.documents.find((item) => item.id === id)
    if (!document) throw new Error('This document is no longer in your vault.')
    return document
  }

  private documentPath(id: string): string {
    return this.documentPathAt(this.documentsRoot, id)
  }

  private documentPathAt(root: string, id: string): string {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id)) {
      throw new Error('The document identifier is not valid.')
    }
    return join(root, `${id}.data`)
  }

  private async writeDocument(id: string, contents: Buffer): Promise<void> {
    await this.writeDocumentTo(this.documentsRoot, id, contents)
  }

  private async writeDocumentTo(root: string, id: string, contents: Buffer): Promise<void> {
    await writeFile(
      this.documentPathAt(root, id),
      encryptLocal(contents, this.key, `document:${id}`),
      { mode: 0o600 }
    )
  }

  private async removeMaterializedDocument(id: string): Promise<void> {
    const files = await readdir(this.tempRoot).catch(() => [])
    const matching = files.filter((file) => file.startsWith(`${id}-`))
    for (const file of matching) {
      const path = join(this.tempRoot, file)
      const timer = this.tempTimers.get(path)
      if (timer) clearTimeout(timer)
      this.tempTimers.delete(path)
      await rm(path, { force: true })
    }
  }

  private async clearMaterializedDocuments(): Promise<void> {
    for (const timer of this.tempTimers.values()) clearTimeout(timer)
    this.tempTimers.clear()
    await rm(this.tempRoot, { recursive: true, force: true })
    await mkdir(this.tempRoot, { recursive: true, mode: 0o700 })
  }

  private async persist(): Promise<void> {
    await atomicWriteFile(
      this.statePath,
      encryptLocal(Buffer.from(JSON.stringify(this.state)), this.key, 'vault-state')
    )
  }

  private async commit(): Promise<VaultState> {
    this.state.updatedAt = now()
    await this.persist()
    const snapshot = this.get()
    this.onChange(snapshot)
    return snapshot
  }

  private async commitOrRestore(previousState: VaultState): Promise<VaultState> {
    try {
      return await this.commit()
    } catch (error) {
      this.state = previousState
      throw error
    }
  }
}
