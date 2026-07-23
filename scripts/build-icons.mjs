import { copyFile, mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const resources = join(root, 'resources')
const iconSource = join(resources, 'icon.svg')
const logoSource = join(resources, 'logo.svg')
const iconPng = join(resources, 'icon.png')
const temporaryDirectory = await mkdtemp(join(tmpdir(), 'id-vault-icons-'))
const iconset = join(temporaryDirectory, 'ID Vault.iconset')
await mkdir(iconset)

const renderSvg = (source, size, target) =>
  sharp(source, { density: 384 }).resize(size, size).png().toFile(target)

const renderIcon = (size, target) =>
  sharp(iconPng)
    .resize(size, size, { fit: 'fill', kernel: sharp.kernel.lanczos3 })
    .png()
    .toFile(target)

const run = (command, args) => {
  const result = spawnSync(command, args, { stdio: 'inherit' })
  if (result.error) throw result.error
  if (result.status) process.exit(result.status)
}

try {
  await renderSvg(iconSource, 1024, iconPng)

  await Promise.all([
    renderIcon(16, join(iconset, 'icon_16x16.png')),
    renderIcon(32, join(iconset, 'icon_16x16@2x.png')),
    renderIcon(32, join(iconset, 'icon_32x32.png')),
    renderIcon(64, join(iconset, 'icon_32x32@2x.png')),
    renderIcon(128, join(iconset, 'icon_128x128.png')),
    renderIcon(256, join(iconset, 'icon_128x128@2x.png')),
    renderIcon(256, join(iconset, 'icon_256x256.png')),
    renderIcon(512, join(iconset, 'icon_256x256@2x.png')),
    renderIcon(512, join(iconset, 'icon_512x512.png')),
    renderIcon(1024, join(iconset, 'icon_512x512@2x.png'))
  ])

  run('/usr/bin/iconutil', ['-c', 'icns', iconset, '-o', join(resources, 'icon.icns')])
  run('magick', [
    iconPng,
    '-define',
    'icon:auto-resize=256,128,64,48,32,16',
    join(resources, 'icon.ico')
  ])

  const rendererAssets = join(root, 'src', 'renderer', 'src', 'assets')
  await mkdir(rendererAssets, { recursive: true })
  await copyFile(logoSource, join(rendererAssets, 'logo.svg'))

  const websitePublic = resolve(root, '..', 'website', 'public')
  await mkdir(websitePublic, { recursive: true })
  await Promise.all([
    copyFile(logoSource, join(websitePublic, 'logo.svg')),
    copyFile(iconSource, join(websitePublic, 'app-icon.svg')),
    copyFile(iconPng, join(websitePublic, 'app-icon.png')),
    renderIcon(128, join(websitePublic, 'favicon.png'))
  ])
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true })
}
