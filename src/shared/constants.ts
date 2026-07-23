import type { DetailCategory, DocumentKind } from './types'

export const DETAIL_CATEGORIES: { value: DetailCategory; label: string }[] = [
  { value: 'identity', label: 'Identity' },
  { value: 'tax', label: 'Tax' },
  { value: 'business', label: 'Business' },
  { value: 'other', label: 'Other' }
]

export const DOCUMENT_KINDS: { value: DocumentKind; label: string }[] = [
  { value: 'passport', label: 'Passport' },
  { value: 'identity-card', label: 'Identity card' },
  { value: 'driver-license', label: 'Driver license' },
  { value: 'tax-document', label: 'Tax document' },
  { value: 'certificate', label: 'Certificate' },
  { value: 'other', label: 'Other' }
]

export const ACCEPTED_DOCUMENT_EXTENSIONS = ['pdf', 'png', 'jpg', 'jpeg', 'webp', 'heic']

export const ACCEPTED_DOCUMENT_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/heic'
]
