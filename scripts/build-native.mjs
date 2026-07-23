import { execFileSync } from 'node:child_process'
import { chmodSync, cpSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

if (process.platform === 'darwin') {
  const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  const sourceRoot = join(projectRoot, 'native', 'macos')
  const outputRoot = join(projectRoot, 'native', 'dist')
  const buildRoot = join(outputRoot, '.build')
  const xcodeBuildRoot = join(outputRoot, '.xcode-build')
  const extensionRoot = join(outputRoot, 'IDVaultWidget.appex')
  const bridgeExecutable = join(outputRoot, 'IDVaultWidgetBridge')
  const architectures = ['arm64', 'x86_64']

  rmSync(outputRoot, { recursive: true, force: true })
  mkdirSync(buildRoot, { recursive: true })
  mkdirSync(xcodeBuildRoot, { recursive: true })

  execFileSync('/usr/bin/xcodebuild', [
    '-quiet',
    '-project',
    join(sourceRoot, 'IDVaultNative.xcodeproj'),
    '-target',
    'IDVaultWidget',
    '-configuration',
    'Release',
    '-sdk',
    'macosx',
    `CONFIGURATION_BUILD_DIR=${xcodeBuildRoot}`,
    `OBJROOT=${join(xcodeBuildRoot, 'obj')}`,
    `SYMROOT=${xcodeBuildRoot}`,
    `DSTROOT=${join(xcodeBuildRoot, 'dst')}`,
    'ARCHS=arm64 x86_64',
    'ONLY_ACTIVE_ARCH=NO',
    'CODE_SIGNING_ALLOWED=NO',
    'CODE_SIGNING_REQUIRED=NO',
    'build'
  ], { stdio: 'inherit' })
  cpSync(join(xcodeBuildRoot, 'IDVaultWidget.appex'), extensionRoot, { recursive: true })

  const compileBridge = (output, architecture) => {
    const args = [
      '--sdk',
      'macosx',
      'swiftc',
      '-O',
      '-target',
      `${architecture}-apple-macos14.0`,
      '-module-name',
      'IDVaultWidgetBridge',
      '-framework',
      'Foundation',
      '-framework',
      'WidgetKit'
    ]
    args.push(join(sourceRoot, 'WidgetBridge.swift'), '-o', output)
    execFileSync('/usr/bin/xcrun', args, { stdio: 'inherit' })
  }

  const bridgeSlices = architectures.map((architecture) => {
    const output = join(buildRoot, `IDVaultWidgetBridge-${architecture}`)
    compileBridge(output, architecture)
    return output
  })

  execFileSync('/usr/bin/lipo', ['-create', ...bridgeSlices, '-output', bridgeExecutable])
  chmodSync(bridgeExecutable, 0o755)

  execFileSync('/usr/bin/codesign', [
    '--force',
    '--sign',
    '-',
    '--timestamp=none',
    '--entitlements',
    join(sourceRoot, 'IDVaultWidget.entitlements'),
    '--generate-entitlement-der',
    extensionRoot
  ])
  execFileSync('/usr/bin/codesign', [
    '--force',
    '--sign',
    '-',
    '--timestamp=none',
    '--entitlements',
    join(sourceRoot, 'WidgetBridge.entitlements'),
    '--generate-entitlement-der',
    bridgeExecutable
  ])
  rmSync(buildRoot, { recursive: true, force: true })
  rmSync(xcodeBuildRoot, { recursive: true, force: true })
  rmSync(join(sourceRoot, 'build'), { recursive: true, force: true })
}
