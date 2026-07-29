import type { NavigationTarget, Page } from '../shared/types'

const pages = new Set<Page>(['overview', 'details', 'documents', 'settings'])
const itemIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const copyTokenPattern = /^[A-Za-z0-9_-]{43}$/

export type DeepLinkAction =
  | { type: 'navigate'; target: NavigationTarget }
  | { type: 'copy-detail'; detailId: string; copyToken: string }

function itemId(value: string | null): string | undefined {
  const normalized = value?.toLowerCase()
  return normalized && itemIdPattern.test(normalized) ? normalized : undefined
}

export function parseDeepLink(value: string, scheme = 'idvault'): DeepLinkAction | undefined {
  try {
    const url = new URL(value)
    if (url.protocol !== `${scheme}:`) return undefined

    if (url.hostname !== 'open') return undefined
    const requestedPage = url.searchParams.get('view')
    const page = requestedPage && pages.has(requestedPage as Page)
      ? (requestedPage as Page)
      : 'overview'
    const requestedId = itemId(url.searchParams.get('id'))
    if (url.searchParams.get('action') === 'copy') {
      const copyToken = url.searchParams.get('token')
      return page === 'details' && requestedId && copyToken && copyTokenPattern.test(copyToken)
        ? { type: 'copy-detail', detailId: requestedId, copyToken }
        : undefined
    }

    const target: NavigationTarget = { page }
    if ((page === 'details' || page === 'documents') && requestedId) {
      target.itemId = requestedId
    }
    return { type: 'navigate', target }
  } catch {
    return undefined
  }
}
