import { describe, expect, it } from 'vitest'
import { parseDeepLink } from './deep-link'

const detailId = '54f3b28e-6a43-47c9-b705-cb9c8a1f5871'
const importedDetailId = '018f22e2-7d6b-7fcc-98c0-123456789abc'
const copyToken = 'A'.repeat(43)

describe('deep links', () => {
  it('parses widget copy actions without carrying the value', () => {
    expect(
      parseDeepLink(
        `idvault://open?view=details&id=${detailId}&action=copy&token=${copyToken}`
      )
    ).toEqual({
      type: 'copy-detail',
      detailId,
      copyToken
    })
  })

  it('parses navigation targets', () => {
    expect(parseDeepLink(`idvault://open?view=details&id=${detailId}`)).toEqual({
      type: 'navigate',
      target: { page: 'details', itemId: detailId }
    })
    expect(parseDeepLink('idvault://open?view=settings')).toEqual({
      type: 'navigate',
      target: { page: 'settings' }
    })
  })

  it('accepts imported UUIDv6-v8 detail identifiers', () => {
    expect(
      parseDeepLink(
        `idvault://open?view=details&id=${importedDetailId}&action=copy&token=${copyToken}`
      )
    ).toEqual({
      type: 'copy-detail',
      detailId: importedDetailId,
      copyToken
    })
  })

  it('rejects malformed copy actions and unrelated protocols', () => {
    expect(parseDeepLink('idvault://open?view=details&id=tax-id&action=copy')).toBeUndefined()
    expect(
      parseDeepLink(`idvault://open?view=details&id=${detailId}&action=copy`)
    ).toBeUndefined()
    expect(
      parseDeepLink(`idvault://open?view=details&id=${detailId}&action=copy&token=invalid`)
    ).toBeUndefined()
    expect(parseDeepLink(`https://copy?id=${detailId}`)).toBeUndefined()
    expect(parseDeepLink(`idvault://unknown?id=${detailId}`)).toBeUndefined()
  })
})
