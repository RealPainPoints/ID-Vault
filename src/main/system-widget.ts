import { app } from 'electron'
import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import type { VaultState } from '../shared/types'
import { createSystemWidgetSnapshot } from './system-widget-snapshot'

export class SystemWidgetService {
  private queue: Promise<void> = Promise.resolve()

  publish(state: VaultState): Promise<void> {
    if (process.platform !== 'darwin') return Promise.resolve()
    const payload = Buffer.from(JSON.stringify(createSystemWidgetSnapshot(state)))
    const task = this.queue.then(() => this.invokeBridge(payload))
    this.queue = task.catch(() => undefined)
    return task
  }

  flush(): Promise<void> {
    return this.queue
  }

  private bridgePath(): string {
    return app.isPackaged
      ? join(dirname(process.execPath), 'IDVaultWidgetBridge')
      : join(app.getAppPath(), 'native', 'dist', 'IDVaultWidgetBridge')
  }

  private invokeBridge(payload: Buffer): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.bridgePath(), [], {
        stdio: ['pipe', 'ignore', 'pipe'],
        windowsHide: true
      })
      let stderr = ''
      const timeout = setTimeout(() => child.kill(), 10_000)
      child.stderr.on('data', (chunk: Buffer) => {
        if (stderr.length < 4096) stderr += chunk.toString('utf8').slice(0, 4096 - stderr.length)
      })
      child.once('error', (error) => {
        clearTimeout(timeout)
        reject(error)
      })
      child.once('close', (code) => {
        clearTimeout(timeout)
        if (code === 0) resolve()
        else reject(new Error(stderr.trim() || 'The macOS widget could not be updated.'))
      })
      child.stdin.end(payload)
    })
  }
}
