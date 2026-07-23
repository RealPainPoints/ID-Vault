import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync
} from 'node:crypto'

const LOCAL_MAGIC_V1 = Buffer.from('IDVLOCAL')
const LOCAL_MAGIC_V2 = Buffer.from('IDVLOC02')
const ARCHIVE_MAGIC = Buffer.from('IDVAULT1')
const IV_LENGTH = 12
const TAG_LENGTH = 16
const SALT_LENGTH = 16

function encryptWithKey(data: Buffer, key: Buffer, magic: Buffer, aad = magic): Buffer {
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  cipher.setAAD(aad)
  const encrypted = Buffer.concat([cipher.update(data), cipher.final()])
  return Buffer.concat([magic, iv, cipher.getAuthTag(), encrypted])
}

function decryptWithKey(data: Buffer, key: Buffer, magic: Buffer, aad = magic): Buffer {
  const headerLength = magic.length + IV_LENGTH + TAG_LENGTH
  if (data.length <= headerLength || !data.subarray(0, magic.length).equals(magic)) {
    throw new Error('This vault data is not valid.')
  }

  const ivStart = magic.length
  const tagStart = ivStart + IV_LENGTH
  const contentStart = tagStart + TAG_LENGTH
  const decipher = createDecipheriv('aes-256-gcm', key, data.subarray(ivStart, tagStart))
  decipher.setAAD(aad)
  decipher.setAuthTag(data.subarray(tagStart, contentStart))
  return Buffer.concat([decipher.update(data.subarray(contentStart)), decipher.final()])
}

function localAad(context: string): Buffer {
  return Buffer.concat([LOCAL_MAGIC_V2, Buffer.from(`\0${context}`, 'utf8')])
}

export function encryptLocal(data: Buffer, key: Buffer, context = 'vault-state'): Buffer {
  return encryptWithKey(data, key, LOCAL_MAGIC_V2, localAad(context))
}

export function decryptLocal(data: Buffer, key: Buffer, context = 'vault-state'): Buffer {
  if (data.subarray(0, LOCAL_MAGIC_V2.length).equals(LOCAL_MAGIC_V2)) {
    return decryptWithKey(data, key, LOCAL_MAGIC_V2, localAad(context))
  }
  return decryptWithKey(data, key, LOCAL_MAGIC_V1)
}

export function encryptArchive(data: Buffer, password: string): Buffer {
  if (password.length < 8) {
    throw new Error('Use a password with at least 8 characters.')
  }

  const salt = randomBytes(SALT_LENGTH)
  const key = scryptSync(password, salt, 32, {
    N: 32768,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024
  })
  const encrypted = encryptWithKey(data, key, ARCHIVE_MAGIC)
  return Buffer.concat([
    encrypted.subarray(0, ARCHIVE_MAGIC.length),
    salt,
    encrypted.subarray(ARCHIVE_MAGIC.length)
  ])
}

export function decryptArchive(data: Buffer, password: string): Buffer {
  const minimumLength = ARCHIVE_MAGIC.length + SALT_LENGTH + IV_LENGTH + TAG_LENGTH + 1
  if (
    data.length < minimumLength ||
    !data.subarray(0, ARCHIVE_MAGIC.length).equals(ARCHIVE_MAGIC)
  ) {
    throw new Error('This is not a valid ID Vault archive.')
  }

  const saltStart = ARCHIVE_MAGIC.length
  const contentStart = saltStart + SALT_LENGTH
  const salt = data.subarray(saltStart, contentStart)
  const key = scryptSync(password, salt, 32, {
    N: 32768,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024
  })
  const localEnvelope = Buffer.concat([
    ARCHIVE_MAGIC,
    data.subarray(contentStart)
  ])

  try {
    return decryptWithKey(localEnvelope, key, ARCHIVE_MAGIC)
  } catch {
    throw new Error('The password is incorrect or the archive is damaged.')
  }
}

export const archiveHeader = ARCHIVE_MAGIC.toString('utf8')
