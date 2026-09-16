export type DesktopEntry = {
  name: string
  kind: 'folder' | 'shortcut' | 'file'
  extension: string
  fullPath: string
  iconDataUrl?: string
  resolvedPath?: string
}

export type DesktopCategoryId =
  | 'creative'
  | 'dev'
  | 'temp'
  | 'games'
  | 'projects'
  | 'downloads'

export type DesktopCategory = {
  id: DesktopCategoryId
  label: string
  icon: string
  anchor: string
  summary: string
  entries: DesktopEntry[]
  count: number
  highlights: string[]
}

type CategoryMeta = {
  id: DesktopCategoryId
  label: string
  icon: string
  anchor: string
}

export const categoryOrder: CategoryMeta[] = [
  { id: 'creative', label: '创作', icon: '✦', anchor: '左上区域' },
  { id: 'dev', label: '开发', icon: '⌘', anchor: '中上区域' },
  { id: 'temp', label: '临时', icon: '○', anchor: '左下区域' },
  { id: 'games', label: '游戏', icon: '◈', anchor: '中下区域' },
  { id: 'projects', label: '项目', icon: '■', anchor: '右上区域' },
  { id: 'downloads', label: '下载', icon: '↓', anchor: '右下区域' },
]

export const fallbackDesktopSnapshot: DesktopEntry[] = [
  { name: 'Adobe After Effects 自动保存', kind: 'folder', extension: '', fullPath: 'C:\\Desktop\\Adobe After Effects 自动保存' },
  { name: 'AE', kind: 'folder', extension: '', fullPath: 'C:\\Desktop\\AE' },
  { name: 'AI', kind: 'folder', extension: '', fullPath: 'C:\\Desktop\\AI' },
  { name: 'gpt配置备份', kind: 'folder', extension: '', fullPath: 'C:\\Desktop\\gpt配置备份' },
  { name: 'image废案', kind: 'folder', extension: '', fullPath: 'C:\\Desktop\\image废案' },
  { name: 'Pixiv', kind: 'folder', extension: '', fullPath: 'C:\\Desktop\\Pixiv' },
  { name: 'pngs', kind: 'folder', extension: '', fullPath: 'C:\\Desktop\\pngs' },
  { name: 'PS', kind: 'folder', extension: '', fullPath: 'C:\\Desktop\\PS' },
  { name: 'skill', kind: 'folder', extension: '', fullPath: 'C:\\Desktop\\skill' },
  { name: 'stop-slop', kind: 'folder', extension: '', fullPath: 'C:\\Desktop\\stop-slop' },
  { name: 'txts', kind: 'folder', extension: '', fullPath: 'C:\\Desktop\\txts' },
  { name: 'Words', kind: 'folder', extension: '', fullPath: 'C:\\Desktop\\Words' },
  { name: 'WSL Linux', kind: 'folder', extension: '', fullPath: 'C:\\Desktop\\WSL Linux' },
  { name: '杂文件', kind: 'folder', extension: '', fullPath: 'C:\\Desktop\\杂文件' },
  { name: '知网论文', kind: 'folder', extension: '', fullPath: 'C:\\Desktop\\知网论文' },
  { name: '第一次划分及其附属文件', kind: 'folder', extension: '', fullPath: 'C:\\Desktop\\第一次划分及其附属文件' },
  { name: '视频导出点', kind: 'folder', extension: '', fullPath: 'C:\\Desktop\\视频导出点' },
  { name: '音频导出点', kind: 'folder', extension: '', fullPath: 'C:\\Desktop\\音频导出点' },
  { name: '1修.psd', kind: 'file', extension: '.psd', fullPath: 'C:\\Desktop\\1修.psd' },
  { name: 'Adobe Acrobat.lnk', kind: 'shortcut', extension: '.lnk', fullPath: 'C:\\Desktop\\Adobe Acrobat.lnk' },
  { name: 'Adobe After Effects 2025.lnk', kind: 'shortcut', extension: '.lnk', fullPath: 'C:\\Desktop\\Adobe After Effects 2025.lnk' },
  { name: 'Adobe Illustrator.lnk', kind: 'shortcut', extension: '.lnk', fullPath: 'C:\\Desktop\\Adobe Illustrator.lnk' },
  { name: 'Adobe Photoshop 2025.lnk', kind: 'shortcut', extension: '.lnk', fullPath: 'C:\\Desktop\\Adobe Photoshop 2025.lnk' },
  { name: 'Adobe Premiere Pro 2025.lnk', kind: 'shortcut', extension: '.lnk', fullPath: 'C:\\Desktop\\Adobe Premiere Pro 2025.lnk' },
  { name: 'CC Switch.lnk', kind: 'shortcut', extension: '.lnk', fullPath: 'C:\\Desktop\\CC Switch.lnk' },
  { name: 'Codex.lnk', kind: 'shortcut', extension: '.lnk', fullPath: 'C:\\Desktop\\Codex.lnk' },
  { name: 'Everything.lnk', kind: 'shortcut', extension: '.lnk', fullPath: 'C:\\Desktop\\Everything.lnk' },
  { name: 'FSP.txt', kind: 'file', extension: '.txt', fullPath: 'C:\\Desktop\\FSP.txt' },
  { name: 'Hermes.lnk', kind: 'shortcut', extension: '.lnk', fullPath: 'C:\\Desktop\\Hermes.lnk' },
  { name: 'Motrix.lnk', kind: 'shortcut', extension: '.lnk', fullPath: 'C:\\Desktop\\Motrix.lnk' },
  { name: 'newapi.txt', kind: 'file', extension: '.txt', fullPath: 'C:\\Desktop\\newapi.txt' },
  { name: 'OBS Studio.url', kind: 'shortcut', extension: '.url', fullPath: 'C:\\Desktop\\OBS Studio.url' },
  { name: 'Obsidian.lnk', kind: 'shortcut', extension: '.lnk', fullPath: 'C:\\Desktop\\Obsidian.lnk' },
  { name: 'ocr_result.txt', kind: 'file', extension: '.txt', fullPath: 'C:\\Desktop\\ocr_result.txt' },
  { name: 'Oopz.lnk', kind: 'shortcut', extension: '.lnk', fullPath: 'C:\\Desktop\\Oopz.lnk' },
  { name: 'Origin 2024.lnk', kind: 'shortcut', extension: '.lnk', fullPath: 'C:\\Desktop\\Origin 2024.lnk' },
  { name: 'SearXNG.txt', kind: 'file', extension: '.txt', fullPath: 'C:\\Desktop\\SearXNG.txt' },
  { name: 'Snipaste_2026-05-16_12-12-17.png', kind: 'file', extension: '.png', fullPath: 'C:\\Desktop\\Snipaste_2026-05-16_12-12-17.png' },
  { name: 'Steam.lnk', kind: 'shortcut', extension: '.lnk', fullPath: 'C:\\Desktop\\Steam.lnk' },
  { name: 'sync-hermes-to-onedrive.bat', kind: 'file', extension: '.bat', fullPath: 'C:\\Desktop\\sync-hermes-to-onedrive.bat' },
  { name: 'Ubisoft Connect.lnk', kind: 'shortcut', extension: '.lnk', fullPath: 'C:\\Desktop\\Ubisoft Connect.lnk' },
  { name: 'Visual Studio Code.lnk', kind: 'shortcut', extension: '.lnk', fullPath: 'C:\\Desktop\\Visual Studio Code.lnk' },
  { name: 'WeGame.lnk', kind: 'shortcut', extension: '.lnk', fullPath: 'C:\\Desktop\\WeGame.lnk' },
  { name: 'WinRAR.lnk', kind: 'shortcut', extension: '.lnk', fullPath: 'C:\\Desktop\\WinRAR.lnk' },
  { name: '剪映专业版.lnk', kind: 'shortcut', extension: '.lnk', fullPath: 'C:\\Desktop\\剪映专业版.lnk' },
  { name: '微信开发者工具.lnk', kind: 'shortcut', extension: '.lnk', fullPath: 'C:\\Desktop\\微信开发者工具.lnk' },
  { name: '新建 Microsoft Word 文档.docx', kind: 'file', extension: '.docx', fullPath: 'C:\\Desktop\\新建 Microsoft Word 文档.docx' },
  { name: '模板.txt', kind: 'file', extension: '.txt', fullPath: 'C:\\Desktop\\模板.txt' },
  { name: '海报1.ai', kind: 'file', extension: '.ai', fullPath: 'C:\\Desktop\\海报1.ai' },
  { name: '无畏契约.lnk', kind: 'shortcut', extension: '.lnk', fullPath: 'C:\\Desktop\\无畏契约.lnk' },
  { name: '百度网盘.lnk', kind: 'shortcut', extension: '.lnk', fullPath: 'C:\\Desktop\\百度网盘.lnk' },
  { name: '知网研学.lnk', kind: 'shortcut', extension: '.lnk', fullPath: 'C:\\Desktop\\知网研学.lnk' },
  { name: '网易云音乐.lnk', kind: 'shortcut', extension: '.lnk', fullPath: 'C:\\Desktop\\网易云音乐.lnk' },
  { name: '迅雷.lnk', kind: 'shortcut', extension: '.lnk', fullPath: 'C:\\Desktop\\迅雷.lnk' },
]

const creativeKeywords = ['adobe', 'photoshop', 'illustrator', 'premiere', 'after effects', 'acrobat', 'pixiv', '剪映', '海报']
const devKeywords = ['code', 'codex', 'obsidian', 'everything', 'hermes', 'searxng', 'wsl', '微信开发者工具', 'gpt', 'skill', 'txts']
const gameKeywords = ['steam', 'wegame', 'origin', 'ubisoft', 'unturned', 'oopz', '无畏契约', '少女前线', '缺氧']
const downloadKeywords = ['motrix', 'idm', '百度网盘', '迅雷', '网盘', '.zip', '.rar', '.7z', '.gz', '.msi']

export function normalizeEntryName(name: string) {
  return name.replace(/\.(lnk|url)$/i, '')
}

export function getCategoryMeta(categoryId: DesktopCategoryId) {
  return categoryOrder.find((category) => category.id === categoryId)
}

function includesKeyword(name: string, keywords: string[]) {
  const normalized = name.toLowerCase()
  return keywords.some((keyword) => normalized.includes(keyword.toLowerCase()))
}

function isCreativeEntry(entry: DesktopEntry) {
  return (
    includesKeyword(entry.name, creativeKeywords) ||
    ['.psd', '.ai', '.png', '.jpg', '.jpeg', '.mp4'].includes(entry.extension) ||
    ['AE', 'AI', 'PS', 'Pixiv', 'pngs', '视频导出点', '音频导出点'].includes(entry.name)
  )
}

function isDevEntry(entry: DesktopEntry) {
  return (
    includesKeyword(entry.name, devKeywords) ||
    ['.bat', '.html', '.py', '.js', '.ts', '.tsx', '.md'].includes(entry.extension) ||
    ['gpt配置备份', 'stop-slop', 'Words', 'skill', 'WSL Linux'].includes(entry.name)
  )
}

function isGameEntry(entry: DesktopEntry) {
  return entry.kind === 'shortcut' && includesKeyword(entry.name, gameKeywords)
}

function isDownloadEntry(entry: DesktopEntry) {
  return (
    includesKeyword(entry.name, downloadKeywords) ||
    ['.zip', '.rar', '.7z', '.gz', '.msi'].includes(entry.extension)
  )
}

function isProjectEntry(entry: DesktopEntry) {
  return (
    entry.kind === 'folder' ||
    ['.doc', '.docx', '.pdf', '.ppt', '.pptx', '.xls', '.xlsx'].includes(entry.extension) ||
    ['第一次划分及其附属文件', '知网论文', 'Wos论文'].includes(entry.name)
  )
}

function detectCategory(entry: DesktopEntry): DesktopCategoryId {
  if (isGameEntry(entry)) return 'games'
  if (isCreativeEntry(entry)) return 'creative'
  if (isDevEntry(entry)) return 'dev'
  if (isDownloadEntry(entry)) return 'downloads'
  if (isProjectEntry(entry)) return 'projects'
  return 'temp'
}

function buildSummary(category: CategoryMeta, entries: DesktopEntry[]) {
  const head = entries.slice(0, 3).map((entry) => normalizeEntryName(entry.name))
  const preview = head.length ? head.join('、') : '当前为空'

  switch (category.id) {
    case 'creative':
      return `创作分组收纳了 ${entries.length} 项，当前视觉焦点主要落在 ${preview}。`
    case 'dev':
      return `开发分组承接了 ${entries.length} 项，当前高频入口主要是 ${preview}。`
    case 'temp':
      return `待整理分组里还有 ${entries.length} 项，建议优先观察或改派 ${preview}。`
    case 'games':
      return `游戏分组当前有 ${entries.length} 项，常驻入口主要是 ${preview}。`
    case 'projects':
      return `项目分组当前挂了 ${entries.length} 项，最近最醒目的内容是 ${preview}。`
    case 'downloads':
      return `下载分组当前容纳了 ${entries.length} 项，主要聚焦在 ${preview}。`
  }
}

export function buildDesktopCategories(
  entries: DesktopEntry[] = fallbackDesktopSnapshot,
  manualOverrides: Partial<Record<string, DesktopCategoryId>> = {},
): DesktopCategory[] {
  const buckets = new Map<DesktopCategoryId, DesktopEntry[]>()

  for (const category of categoryOrder) {
    buckets.set(category.id, [])
  }

  for (const entry of entries) {
    const overriddenCategory = manualOverrides[entry.fullPath]
    const categoryId = overriddenCategory ?? detectCategory(entry)
    buckets.get(categoryId)?.push(entry)
  }

  return categoryOrder.map((category) => {
    const groupedEntries = (buckets.get(category.id) ?? []).sort((left, right) =>
      normalizeEntryName(left.name).localeCompare(normalizeEntryName(right.name), 'zh-CN'),
    )

    return {
      ...category,
      entries: groupedEntries,
      count: groupedEntries.length,
      highlights: groupedEntries.slice(0, 3).map((entry) => normalizeEntryName(entry.name)),
      summary: buildSummary(category, groupedEntries),
    }
  })
}

export function buildDesktopStats(categories: DesktopCategory[], entries: DesktopEntry[]) {
  const creative = categories.find((category) => category.id === 'creative')
  const temp = categories.find((category) => category.id === 'temp')
  const projects = categories.find((category) => category.id === 'projects')

  return [
    { label: '桌面总量', value: `${entries.length} 个入口` },
    { label: '待整理', value: `${temp?.count ?? 0} 项待观察入口` },
    { label: '创作焦点', value: creative?.highlights.join(' / ') || '当前为空' },
    { label: '项目分组', value: `${projects?.count ?? 0} 个项目或资料入口` },
  ]
}

export function buildDropZones(categories: DesktopCategory[]) {
  return categories.map((category) => `${category.label}归位`)
}
