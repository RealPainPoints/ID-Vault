import { useEffect, useState } from 'react'
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  LockKeyhole,
  PanelTopOpen
} from 'lucide-react'
import type { PreferencesInput, VaultState } from '../../../shared/types'
import { Button, Toggle } from '../components/UI'

type Props = {
  vault: VaultState
  setVault: (vault: VaultState) => void
  onImport: () => void
  onExport: () => void
  notify: (message: string, tone?: 'success' | 'error') => void
}

export default function SettingsPage({
  vault,
  setVault,
  onImport,
  onExport,
  notify
}: Props) {
  const [displayName, setDisplayName] = useState(vault.profile.displayName)
  const [legalName, setLegalName] = useState(vault.profile.legalName)
  const [country, setCountry] = useState(vault.profile.country)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setDisplayName(vault.profile.displayName)
    setLegalName(vault.profile.legalName)
    setCountry(vault.profile.country)
  }, [vault.profile.country, vault.profile.displayName, vault.profile.legalName])

  async function updatePreference(input: PreferencesInput): Promise<void> {
    try {
      setVault(await window.idVault.vault.updatePreferences(input))
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error), 'error')
    }
  }

  async function saveProfile(event: React.FormEvent): Promise<void> {
    event.preventDefault()
    setSaving(true)
    try {
      setVault(await window.idVault.vault.updateProfile({ displayName, legalName, country }))
      notify('Profile saved')
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error), 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="page settings-page">
      <header className="page-header">
        <div>
          <h1>Settings</h1>
          <p>Keep ID Vault working the way you prefer.</p>
        </div>
      </header>

      <section className="settings-group">
        <header>
          <h2>Profile</h2>
        </header>
        <form className="settings-card profile-form" onSubmit={saveProfile}>
          <div className="field-grid field-grid-three">
            <label>
              <span>Preferred name</span>
              <input
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="Name"
              />
            </label>
            <label>
              <span>Legal name</span>
              <input
                value={legalName}
                onChange={(event) => setLegalName(event.target.value)}
                placeholder="As shown on your ID"
              />
            </label>
            <label>
              <span>Country or region</span>
              <input
                value={country}
                onChange={(event) => setCountry(event.target.value)}
                placeholder="Country"
              />
            </label>
          </div>
          <div className="profile-actions">
            <Button tone="primary" compact disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </form>
      </section>

      <section className="settings-group">
        <header>
          <h2>Appearance</h2>
        </header>
        <div className="settings-card settings-rows">
          <div className="setting-row">
            <span>
              <strong>Theme</strong>
              <small>Follow your system or choose a fixed appearance.</small>
            </span>
            <div className="segmented-control" role="radiogroup" aria-label="Theme">
              {(['system', 'light', 'dark'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  role="radio"
                  aria-checked={vault.preferences.colorMode === mode}
                  className={vault.preferences.colorMode === mode ? 'active' : ''}
                  onClick={() => void updatePreference({ colorMode: mode })}
                >
                  {mode[0].toUpperCase() + mode.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <div className="setting-row">
            <span>
              <strong>Mask sensitive values</strong>
              <small>Hide values until you reveal or copy them.</small>
            </span>
            <Toggle
              checked={vault.preferences.maskSensitiveValues}
              onChange={(checked) => void updatePreference({ maskSensitiveValues: checked })}
              label="Mask sensitive values"
            />
          </div>
        </div>
      </section>

      <section className="settings-group">
        <header>
          <h2>Quick Access & widgets</h2>
        </header>
        <div className="settings-card settings-rows">
          <div className="setting-row">
            <span>
              <strong>Quick Access</strong>
              <small>
                Open from the tray or press {window.idVault.platform.isMac ? '⌘' : 'Ctrl'} ⇧ Space.
              </small>
            </span>
            <Button compact icon={<PanelTopOpen size={15} />} onClick={() => void window.idVault.vault.showWidget()}>
              Open
            </Button>
          </div>
          <div className="setting-row">
            <span>
              <strong>Keep Quick Access above other windows</strong>
              <small>Useful while filling in forms.</small>
            </span>
            <Toggle
              checked={vault.preferences.widgetAlwaysOnTop}
              onChange={(checked) => void updatePreference({ widgetAlwaysOnTop: checked })}
              label="Keep Quick Access above other windows"
            />
          </div>
          {window.idVault.platform.platform !== 'linux' && (
            <div className="setting-row">
              <span>
                <strong>Open at login</strong>
                <small>Keep ID Vault ready after sign-in.</small>
              </span>
              <Toggle
                checked={vault.preferences.launchAtLogin}
                onChange={(checked) => void updatePreference({ launchAtLogin: checked })}
                label="Open ID Vault at login"
              />
            </div>
          )}
          {window.idVault.platform.isMac && (
            <div className="setting-row">
              <span>
                <strong>Share selected items with the macOS widget</strong>
                <small>Only labels, masked values, document titles, and types are shared.</small>
              </span>
              <Toggle
                checked={vault.preferences.systemWidgetEnabled}
                onChange={(checked) => void updatePreference({ systemWidgetEnabled: checked })}
                label="Share selected items with the macOS widget"
              />
            </div>
          )}
        </div>
      </section>

      <section className="settings-group">
        <header>
          <h2>Backup</h2>
        </header>
        <div className="settings-card backup-row">
          <span>
            <strong>Encrypted ID Vault archive</strong>
            <small>Move or back up everything in one password-protected file.</small>
          </span>
          <div>
            <Button icon={<ArrowDownToLine size={15} />} onClick={onImport}>
              Import
            </Button>
            <Button tone="primary" icon={<ArrowUpFromLine size={15} />} onClick={onExport}>
              Export
            </Button>
          </div>
        </div>
      </section>

      <p className="security-note">
        <LockKeyhole size={14} /> Encrypted locally. Nothing leaves this device unless you export it.
      </p>
    </div>
  )
}
