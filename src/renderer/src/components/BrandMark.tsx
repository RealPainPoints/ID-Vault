import logoUrl from '../assets/logo.svg'

export default function BrandMark({ className = '' }: { className?: string }) {
  return <img className={className} src={logoUrl} alt="" draggable={false} />
}
