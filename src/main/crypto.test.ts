import { randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { decryptArchive, decryptLocal, encryptArchive, encryptLocal } from './crypto'

describe('local vault encryption', () => {
  it('round-trips binary data', () => {
    const key = randomBytes(32)
    const contents = Buffer.from('private identity data')
    const encrypted = encryptLocal(contents, key)

    expect(encrypted.equals(contents)).toBe(false)
    expect(decryptLocal(encrypted, key)).toEqual(contents)
  })

  it('rejects a modified payload', () => {
    const key = randomBytes(32)
    const encrypted = encryptLocal(Buffer.from('private identity data'), key)
    encrypted[encrypted.length - 1] ^= 1

    expect(() => decryptLocal(encrypted, key)).toThrow()
  })

  it('binds encrypted data to its record context', () => {
    const key = randomBytes(32)
    const encrypted = encryptLocal(Buffer.from('passport bytes'), key, 'document:one')

    expect(() => decryptLocal(encrypted, key, 'document:two')).toThrow()
  })
})

describe('portable archive encryption', () => {
  it('round-trips with the export password', () => {
    const contents = Buffer.from('portable vault archive')
    const encrypted = encryptArchive(contents, 'a-secure-password')

    expect(decryptArchive(encrypted, 'a-secure-password')).toEqual(contents)
  })

  it('rejects a wrong password', () => {
    const encrypted = encryptArchive(Buffer.from('portable vault archive'), 'a-secure-password')

    expect(() => decryptArchive(encrypted, 'another-password')).toThrow(
      'The password is incorrect or the archive is damaged.'
    )
  })

  it('requires a useful password length', () => {
    expect(() => encryptArchive(Buffer.from('data'), 'short')).toThrow(
      'Use a password with at least 8 characters.'
    )
  })
})
