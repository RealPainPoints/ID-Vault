const { execFileSync } = require('node:child_process')
const { chmod, copyFile, cp, mkdir, readdir, rm, stat } = require('node:fs/promises')
const { basename, dirname, join, resolve, sep } = require('node:path')
const { sign } = require('@electron/osx-sign')

const root = resolve(__dirname, '..')
const nativeRoot = join(root, 'native', 'dist')
const widgetSource = join(nativeRoot, 'IDVaultWidget.appex')
const bridgeSource = join(nativeRoot, 'IDVaultWidgetBridge')
const hostEntitlements = join(root, 'resources', 'entitlements.mac.plist')
const widgetEntitlements = join(root, 'native', 'macos', 'IDVaultWidget.entitlements')
const bridgeEntitlements = join(root, 'native', 'macos', 'WidgetBridge.entitlements')

function run(command, args, cwd = root) {
  execFileSync(command, args, { cwd, stdio: 'inherit' })
}

function runQuiet(command, args, cwd = root) {
  try {
    execFileSync(command, args, { cwd, stdio: 'pipe', maxBuffer: 10 * 1024 * 1024 })
  } catch (error) {
    if (error.stdout) process.stdout.write(error.stdout)
    if (error.stderr) process.stderr.write(error.stderr)
    throw error
  }
}

function isReleaseBuild() {
  return process.env.ID_VAULT_RELEASE === '1'
}

function macIdentity(required) {
  const configured = process.env.MAC_SIGN_IDENTITY?.trim()
  if (configured) return { identity: configured, adHoc: configured === '-' }
  try {
    const identities = execFileSync(
      '/usr/bin/security',
      ['find-identity', '-v', '-p', 'codesigning'],
      { encoding: 'utf8' }
    )
    const match = identities.match(/"(Developer ID Application:[^"]+)"/)
    if (match) return { identity: match[1], adHoc: false }
  } catch {}
  if (required) throw new Error('A Developer ID Application identity is required for release builds.')
  return { identity: '-', adHoc: true }
}

async function appBundle(outputPath) {
  if (outputPath.endsWith('.app')) return outputPath
  const entries = await readdir(outputPath, { withFileTypes: true })
  const app = entries.find((entry) => entry.isDirectory() && entry.name.endsWith('.app'))
  if (!app) throw new Error(`No macOS app bundle found in ${outputPath}`)
  return join(outputPath, app.name)
}

async function embedWidget(appPath) {
  const widgetTarget = join(appPath, 'Contents', 'PlugIns', basename(widgetSource))
  const bridgeTarget = join(appPath, 'Contents', 'MacOS', basename(bridgeSource))
  await Promise.all([stat(widgetSource), stat(bridgeSource)])
  await mkdir(dirname(widgetTarget), { recursive: true })
  await rm(widgetTarget, { recursive: true, force: true })
  await cp(widgetSource, widgetTarget, { recursive: true, force: true })
  await copyFile(bridgeSource, bridgeTarget)
  await chmod(bridgeTarget, 0o755)
  return { widgetTarget, bridgeTarget }
}

async function signMacApp(appPath, widgetTarget, bridgeTarget, release) {
  const { identity, adHoc } = macIdentity(release)
  if (release && adHoc) throw new Error('Ad-hoc signing is not allowed for release builds.')
  if (adHoc) {
    console.warn('No Developer ID identity found; creating an ad-hoc development build.')
  } else {
    console.log(`Signing with ${identity}`)
  }
  const exact = (left, right) => resolve(left) === resolve(right)
  const widgetPrefix = `${resolve(widgetTarget)}${sep}`
  await sign({
    app: appPath,
    platform: 'darwin',
    identity,
    identityValidation: !adHoc,
    preAutoEntitlements: false,
    preEmbedProvisioningProfile: false,
    binaries: [widgetTarget],
    ignore: (file) => {
      const resolved = resolve(file)
      return resolved.startsWith(widgetPrefix) || /\.(asar|bin|dat|pak)$/i.test(resolved)
    },
    optionsForFile: (file) => {
      const base = { hardenedRuntime: true, ...(adHoc ? { timestamp: 'none' } : {}) }
      if (exact(file, appPath)) return { ...base, entitlements: hostEntitlements }
      if (exact(file, widgetTarget)) return { ...base, entitlements: widgetEntitlements }
      if (exact(file, bridgeTarget)) return { ...base, entitlements: bridgeEntitlements }
      return base
    }
  })
  return !adHoc
}

function notarizationCredentials() {
  const keychainProfile = process.env.MAC_NOTARY_KEYCHAIN_PROFILE?.trim()
  const appleId = process.env.APPLE_ID?.trim()
  const appleIdPassword = (process.env.APPLE_ID_PASSWORD ?? process.env.APPLE_PASSWORD)?.trim()
  const teamId = process.env.APPLE_TEAM_ID?.trim()
  const appleApiKey = process.env.APPLE_API_KEY?.trim()
  const appleApiKeyId = process.env.APPLE_API_KEY_ID?.trim()
  const appleApiIssuer = process.env.APPLE_API_ISSUER?.trim()
  if (keychainProfile) return { keychainProfile }
  if (appleId && appleIdPassword && teamId) return { appleId, appleIdPassword, teamId }
  if (appleApiKey && appleApiKeyId) {
    return { appleApiKey, appleApiKeyId, ...(appleApiIssuer ? { appleApiIssuer } : {}) }
  }
  return undefined
}

function validateMacRelease() {
  const { adHoc } = macIdentity(true)
  if (adHoc) throw new Error('Ad-hoc signing is not allowed for release builds.')
  if (!notarizationCredentials()) {
    throw new Error('Complete Apple notarization credentials are required for release builds.')
  }
}

async function notarizeMacApp(appPath, required) {
  const credentials = notarizationCredentials()
  if (!credentials) {
    if (required) {
      throw new Error('Complete Apple notarization credentials are required for release builds.')
    }
    console.warn('Notarization skipped. Use npm run make:release for distributable macOS artifacts.')
    return false
  }
  const { notarize } = await import('@electron/notarize')
  await notarize({ appPath, ...credentials })
  return true
}

async function prePackage(_config, platform) {
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  if (platform === 'darwin' && isReleaseBuild()) validateMacRelease()
  if (platform === 'darwin') run(npm, ['run', 'build:native'])
  run(npm, ['run', 'build:app'])
  if (platform === 'darwin') await Promise.all([stat(widgetSource), stat(bridgeSource)])
}

async function postPackage(_config, result) {
  if (result.platform !== 'darwin') return
  const release = isReleaseBuild()
  for (const outputPath of result.outputPaths) {
    const appPath = await appBundle(outputPath)
    const { widgetTarget, bridgeTarget } = await embedWidget(appPath)
    const signedForDistribution = await signMacApp(appPath, widgetTarget, bridgeTarget, release)
    if (signedForDistribution) await notarizeMacApp(appPath, release)
  }
}

function nativeAddonLoads(binaryPath) {
  try {
    require(binaryPath)
    return true
  } catch {
    return false
  }
}

async function preMake() {
  if (process.platform !== 'darwin') return
  const nodeGyp = join(root, 'node_modules', '.bin', 'node-gyp')
  const dependencies = [
    ['macos-alias', 'volume.node'],
    ['fs-xattr', 'xattr.node']
  ]
  for (const [name, binary] of dependencies) {
    const dependencyRoot = join(root, 'node_modules', name)
    const binaryPath = join(dependencyRoot, 'build', 'Release', binary)
    if (!nativeAddonLoads(binaryPath)) {
      console.log(`Preparing macOS packaging helper: ${name}`)
      runQuiet(nodeGyp, ['rebuild'], dependencyRoot)
      if (!nativeAddonLoads(binaryPath)) {
        throw new Error(`Failed to build ${name} for the current Node.js runtime.`)
      }
    }
  }
}

module.exports = { prePackage, postPackage, preMake }
