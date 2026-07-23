import { useEffect, useRef, useState } from 'react'
import { LoaderCircle, ShieldAlert } from 'lucide-react'
import type { VaultState } from '../../shared/types'
import MainApp from './MainApp'
import WidgetApp from './WidgetApp'
import BrandMark from './components/BrandMark'
import { Button, Toasts } from './components/UI'
import { formatError } from './lib'

type Toast = {
  id: number
  message: string
  tone: 'success' | 'error'
}

export default function App() {
  const [vault, setVault] = useState<VaultState | null>(null)
  const [error, setError] = useState('')
  const [toasts, setToasts] = useState<Toast[]>([])
  const toastId = useRef(0)
  const isWidget = new URLSearchParams(window.location.search).get('view') === 'widget'

  useEffect(() => {
    let active = true
    void window.idVault.vault
      .get()
      .then((state) => {
        if (active) setVault(state)
      })
      .catch((cause) => {
        if (active) setError(formatError(cause))
      })
    const unsubscribe = window.idVault.vault.onChanged((state) => {
      if (active) setVault(state)
    })
    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!vault) return
    document.documentElement.dataset.theme = vault.preferences.colorMode
  }, [vault])

  function notify(message: string, tone: 'success' | 'error' = 'success'): void {
    const id = ++toastId.current
    setToasts((current) => [...current, { id, message: formatError(message), tone }])
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id))
    }, 2600)
  }

  if (error) {
    return (
      <div className={`load-state ${isWidget ? 'load-state-widget' : ''}`}>
        <span className="load-error-icon">
          <ShieldAlert size={24} />
        </span>
        <h1>Vault unavailable</h1>
        <p>{error}</p>
        <Button onClick={() => window.location.reload()}>Try again</Button>
      </div>
    )
  }

  if (!vault) {
    return (
      <div className={`load-state ${isWidget ? 'load-state-widget' : ''}`}>
        <span className="loading-mark">
          <BrandMark className="loading-logo" />
          <LoaderCircle className="loading-spinner" size={42} />
        </span>
        <p>Opening your vault…</p>
      </div>
    )
  }

  return (
    <>
      {isWidget ? (
        <WidgetApp vault={vault} setVault={setVault} notify={notify} />
      ) : (
        <MainApp vault={vault} setVault={setVault} notify={notify} />
      )}
      <Toasts toasts={toasts} />
    </>
  )
}
