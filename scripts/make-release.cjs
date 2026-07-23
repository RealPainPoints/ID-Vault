const { spawnSync } = require('node:child_process')
const { join, resolve } = require('node:path')

if (process.platform !== 'darwin') {
  throw new Error('The verified release flow currently supports macOS only.')
}

const executable = join(
  resolve(__dirname, '..'),
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'electron-forge.cmd' : 'electron-forge'
)
const result = spawnSync(executable, ['make', ...process.argv.slice(2)], {
  env: { ...process.env, ID_VAULT_RELEASE: '1' },
  stdio: 'inherit'
})

if (result.error) throw result.error
process.exit(result.status ?? 1)
