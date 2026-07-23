const { resolve } = require('node:path')
const { prePackage, postPackage, preMake } = require('./scripts/forge-hooks.cjs')

const root = __dirname
const icon = resolve(root, 'resources', 'icon')
const linuxIcon = resolve(root, 'resources', 'icon.png')
const packageRoots = ['out', 'node_modules', 'package.json']
const packageIgnores = [
  /^node_modules\/\.bin(?:\/|$)/,
  /^node_modules\/\.package-lock\.json$/,
  /^node_modules\/\.vite(?:[-/]|$)/,
  /^node_modules\/\.cache(?:\/|$)/,
  /(?:^|\/)node_gyp_bins(?:\/|$)/,
  /\.(?:o|obj)$/
]

module.exports = {
  outDir: 'release',
  packagerConfig: {
    name: 'ID Vault',
    executableName: 'ID Vault',
    buildVersion: '2',
    appBundleId: 'com.idvault.desktop',
    appCategoryType: 'public.app-category.productivity',
    icon,
    asar: true,
    overwrite: true,
    protocols: [{ name: 'ID Vault', schemes: ['idvault'] }],
    ignore: (file) => {
      const normalized = file.replaceAll('\\', '/')
      const relative = normalized.startsWith(root.replaceAll('\\', '/'))
        ? normalized.slice(root.length).replace(/^\/+/, '')
        : normalized.replace(/^\/+/, '')
      if (!relative) return false
      if (packageIgnores.some((pattern) => pattern.test(relative))) return true
      return !packageRoots.some(
        (entry) => relative === entry || relative.startsWith(`${entry}/`)
      )
    }
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-dmg',
      platforms: ['darwin'],
      config: { icon: resolve(root, 'resources', 'icon.icns'), format: 'ULFO' }
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin']
    },
    {
      name: '@electron-forge/maker-squirrel',
      platforms: ['win32'],
      config: {
        name: 'IDVault',
        setupExe: 'ID-Vault-Setup.exe',
        setupIcon: resolve(root, 'resources', 'icon.ico')
      }
    },
    {
      name: '@electron-forge/maker-deb',
      platforms: ['linux'],
      config: {
        options: {
          name: 'id-vault',
          productName: 'ID Vault',
          genericName: 'Identity Vault',
          categories: ['Utility'],
          section: 'utils',
          icon: linuxIcon,
          mimeType: ['x-scheme-handler/idvault']
        }
      }
    },
    {
      name: '@electron-forge/maker-rpm',
      platforms: ['linux'],
      config: {
        options: {
          name: 'id-vault',
          productName: 'ID Vault',
          genericName: 'Identity Vault',
          categories: ['Utility'],
          icon: linuxIcon,
          mimeType: ['x-scheme-handler/idvault']
        }
      }
    }
  ],
  hooks: { prePackage, postPackage, preMake }
}
