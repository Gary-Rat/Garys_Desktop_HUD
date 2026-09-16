import { Fragment, useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type WheelEvent } from 'react'
import {
  buildDesktopCategories,
  fallbackDesktopSnapshot,
  getCategoryMeta,
  normalizeEntryName,
  type DesktopCategory,
  type DesktopCategoryId,
  type DesktopEntry,
} from './desktopData'
import Aurora from './components/Aurora'
import desktopAssistantLogo from './assets/desktop-assistant-logo.png'
import './App.css'

type TransparencyPreset = 'focus' | 'balanced' | 'ghost'
type ScheduleStatus = 'todo' | 'doing' | 'done'
type ScheduleViewMode = 'timeline' | 'list'
type HopeCategory = 'feature' | 'experience' | 'fix' | 'spark'
type TranslationTarget = 'auto' | 'zh' | 'en'

type ManualOverrides = Partial<Record<string, DesktopCategoryId>>
type PinnedOrders = Partial<Record<DesktopCategoryId, string[]>>
type CategoryLayouts = Partial<Record<DesktopCategoryId, string[]>>
type ScheduleItem = {
  id: string
  title: string
  time: string
  status: ScheduleStatus
}
type RunningWindow = {
  handle: string
  processId: number
  processName: string
  title: string
  isTopmost: boolean
}
type PinnedWindowPreference = {
  handle: string
  processId: number
  processName: string
  title: string
}
type HopeItem = {
  id: string
  category: HopeCategory
  text: string
  createdAt: number
}
type EntryMenuPosition = {
  x: number
  y: number
}

type StoredPreferences = {
  agendaReminderEnabled?: boolean
  agendaViewMode?: ScheduleViewMode
  agenda?: ScheduleItem[]
  categoryLayouts?: CategoryLayouts
  customSourcePaths?: string[]
  hopeItems?: HopeItem[]
  selectedHopeIds?: string[]
  manualOverrides?: ManualOverrides
  pinnedOrders?: PinnedOrders
  pinnedWindows?: PinnedWindowPreference[]
  preset?: TransparencyPreset
  selectedCategoryId?: DesktopCategoryId | 'all'
  silentMode?: boolean
  transparency?: number
}

const presetValues: Record<TransparencyPreset, number> = {
  focus: 82,
  balanced: 66,
  ghost: 44,
}

const preferencesStorageKey = 'desktop-hud:preferences'
const hopeCategories = [
  { id: 'feature', label: '功能' },
  { id: 'experience', label: '体验' },
  { id: 'fix', label: '修复' },
  { id: 'spark', label: '灵感' },
] satisfies Array<{ id: HopeCategory; label: string }>
const hopeCategoryLabels: Record<HopeCategory, string> = {
  feature: '功能',
  experience: '体验',
  fix: '修复',
  spark: '灵感',
}
const translationTargets = [
  { id: 'auto', label: '自动' },
  { id: 'zh', label: '中文' },
  { id: 'en', label: '英文' },
] satisfies Array<{ id: TranslationTarget; label: string }>

function loadStoredPreferences(): StoredPreferences {
  if (typeof window === 'undefined') {
    return {}
  }

  try {
    const raw = window.localStorage.getItem(preferencesStorageKey)
    return raw ? (JSON.parse(raw) as StoredPreferences) : {}
  } catch {
    return {}
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function sanitizeAgenda(items: ScheduleItem[] | undefined) {
  if (!items) {
    return []
  }

  return items
    .map((item) => ({
      id: item.id,
      title: item.title.trim(),
      time: item.time.trim(),
      status: item.status,
    }))
    .filter((item) => item.title.length > 0)
}

function sanitizeHopeItems(items: HopeItem[] | undefined) {
  if (!items) {
    return []
  }

  const categoryIds = new Set<HopeCategory>(hopeCategories.map((category) => category.id))

  return items
    .map((item) => ({
      id: typeof item.id === 'string' ? item.id : `hope-${Date.now()}`,
      category: categoryIds.has(item.category) ? item.category : 'spark',
      text: typeof item.text === 'string' ? item.text.trim() : '',
      createdAt: typeof item.createdAt === 'number' ? item.createdAt : Date.now(),
    }))
    .filter((item) => item.text.length > 0)
}

function sanitizeSelectedHopeIds(ids: string[] | undefined, items: HopeItem[]) {
  if (!ids) {
    return items.slice(-3).map((item) => item.id)
  }

  const itemIds = new Set(items.map((item) => item.id))
  return ids.filter((id) => itemIds.has(id))
}

function isFocusWindow(date: Date) {
  const minutes = date.getHours() * 60 + date.getMinutes()
  return (minutes >= 9 * 60 && minutes < 12 * 60) || (minutes >= 14 * 60 && minutes < 18 * 60)
}

function formatClockLabel(date: Date) {
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}

function createDefaultAgenda() {
  return [
    { id: 'agenda-1', title: '整理临时入口', time: '10:00', status: 'todo' },
    { id: 'agenda-2', title: '处理创作分组素材', time: '14:30', status: 'doing' },
    { id: 'agenda-3', title: '清一下下载区', time: '20:00', status: 'todo' },
  ] satisfies ScheduleItem[]
}

function formatTodayLabel(date: Date) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  }).format(date)
}

function normalizeAgendaTime(value: string) {
  const trimmed = value.trim()
  if (!trimmed) {
    return '待定'
  }

  const compactDigits = trimmed.replace(/\s+/g, '')
  if (/^\d{4}$/.test(compactDigits)) {
    return `${compactDigits.slice(0, 2)}:${compactDigits.slice(2)}`
  }

  return trimmed
}

function parseAgendaMinutes(value: string) {
  const match = value.trim().match(/^([01]?\d|2[0-3])[:锛歖.]?([0-5]\d)$/)
  if (!match) {
    return null
  }

  return Number(match[1]) * 60 + Number(match[2])
}

function formatMinutesLabel(minutes: number) {
  const normalized = ((minutes % 1440) + 1440) % 1440
  const hours = Math.floor(normalized / 60)
  const minute = normalized % 60
  return `${String(hours).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

function getDefaultAgendaDraftTime(date = new Date()) {
  const minutes = date.getHours() * 60 + date.getMinutes()
  return formatMinutesLabel(Math.ceil((minutes + 1) / 15) * 15)
}

function getTodayKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`
}

function sanitizePinnedWindows(items: PinnedWindowPreference[] | undefined) {
  if (!items) {
    return []
  }

  const seen = new Set<string>()
  return items
    .map((item) => ({
      handle: String(item.handle ?? '').trim(),
      processId: Number(item.processId) || 0,
      processName: String(item.processName ?? '').trim(),
      title: String(item.title ?? '').trim(),
    }))
    .filter((item) => {
      if (!item.handle || seen.has(item.handle)) {
        return false
      }

      seen.add(item.handle)
      return true
    })
}

function matchesSearch(entry: DesktopEntry, query: string) {
  if (!query.trim()) {
    return true
  }

  const keyword = query.trim().toLowerCase()
  return (
    entry.name.toLowerCase().includes(keyword) ||
    normalizeEntryName(entry.name).toLowerCase().includes(keyword) ||
    entry.extension.toLowerCase().includes(keyword)
  )
}

function getEntryGlyph(entry: DesktopEntry) {
  if (entry.kind === 'shortcut') {
    return 'App'
  }

  if (entry.kind === 'folder') {
    return 'Dir'
  }

  const extension = entry.extension.replace('.', '').slice(0, 3)
  return extension ? extension.toUpperCase() : 'File'
}

// ---- Subgroup section types and helpers ----

type EntrySectionId = 'primary' | 'folders' | 'archives' | 'text-notes' | 'documents' | 'media' | 'scripts' | 'other'

type EntrySectionMeta = {
  id: EntrySectionId
  label: string
  icon: string
}

type EntrySection = {
  meta: EntrySectionMeta
  entries: DesktopEntry[]
}

const entrySectionOrder: EntrySectionMeta[] = [
  { id: 'primary', label: '主要启动', icon: '▶' },
  { id: 'folders', label: '文件夹', icon: '📁' },
  { id: 'archives', label: '压缩包', icon: '📦' },
  { id: 'text-notes', label: '文本 / 笔记', icon: '📝' },
  { id: 'documents', label: '文档资料', icon: '📄' },
  { id: 'media', label: '素材 / 媒体', icon: '🎨' },
  { id: 'scripts', label: '脚本 / 工具', icon: '⚙' },
  { id: 'other', label: '其他文件', icon: '·' },
]

const archiveExtensions = new Set(['.zip', '.rar', '.7z', '.gz'])
const textNoteExtensions = new Set(['.txt', '.md'])
const documentExtensions = new Set(['.doc', '.docx', '.pdf', '.ppt', '.pptx', '.xls', '.xlsx'])
const mediaExtensions = new Set(['.png', '.jpg', '.jpeg', '.psd', '.ai', '.mp4'])
const scriptExtensions = new Set(['.bat', '.html', '.py', '.js', '.ts', '.tsx'])

function getEntrySectionId(entry: DesktopEntry): EntrySectionId {
  if (entry.kind === 'shortcut') {
    return 'primary'
  }

  if (entry.kind === 'folder') {
    return 'folders'
  }

  const ext = entry.extension.toLowerCase()
  if (archiveExtensions.has(ext)) return 'archives'
  if (textNoteExtensions.has(ext)) return 'text-notes'
  if (documentExtensions.has(ext)) return 'documents'
  if (mediaExtensions.has(ext)) return 'media'
  if (scriptExtensions.has(ext)) return 'scripts'

  return 'other'
}

function buildEntrySections(entries: DesktopEntry[]): EntrySection[] {
  const sections: EntrySection[] = []

  for (const meta of entrySectionOrder) {
    const sectionEntries = entries.filter((entry) => getEntrySectionId(entry) === meta.id)
    if (sectionEntries.length > 0) {
      sections.push({ meta, entries: sectionEntries })
    }
  }

  return sections
}

function getEntryRank(entry: DesktopEntry, keyword = '') {
  const name = normalizeEntryName(entry.name).toLowerCase()
  const query = keyword.trim().toLowerCase()

  let score = 0

  if (entry.kind === 'shortcut') score += 40
  if (entry.kind === 'folder') score += 24
  if (entry.kind === 'file') score += 12
  if (query) {
    if (name === query) score += 60
    if (name.startsWith(query)) score += 28
    if (name.includes(query)) score += 14
    if (entry.extension.toLowerCase().includes(query)) score += 8
  }

  return score
}

function sortEntriesForHud(entries: DesktopEntry[], keyword = '') {
  return [...entries].sort((left, right) => {
    const scoreGap = getEntryRank(right, keyword) - getEntryRank(left, keyword)
    if (scoreGap !== 0) {
      return scoreGap
    }

    return normalizeEntryName(left.name).localeCompare(normalizeEntryName(right.name), 'zh-CN')
  })
}

function sanitizePinnedOrders(pinnedOrders: PinnedOrders, categories: DesktopCategory[]) {
  const categoryPaths = new Map<DesktopCategoryId, Set<string>>()
  for (const category of categories) {
    categoryPaths.set(
      category.id,
      new Set(category.entries.map((entry) => entry.fullPath)),
    )
  }

  return Object.entries(pinnedOrders).reduce<PinnedOrders>((next, [categoryId, entryPaths]) => {
    const typedCategoryId = categoryId as DesktopCategoryId
    const validPaths = categoryPaths.get(typedCategoryId)
    if (!validPaths || !entryPaths) {
      return next
    }

    const filtered = entryPaths.filter((entryPath, index) => {
      return entryPaths.indexOf(entryPath) === index && validPaths.has(entryPath)
    })

    if (filtered.length > 0) {
      next[typedCategoryId] = filtered
    }

    return next
  }, {})
}

function sortEntriesWithPinnedOrder(entries: DesktopEntry[], pinnedOrder: string[]) {
  const pinnedIndexMap = new Map(pinnedOrder.map((entryPath, index) => [entryPath, index]))

  return [...entries].sort((left, right) => {
    const leftPinnedIndex = pinnedIndexMap.get(left.fullPath)
    const rightPinnedIndex = pinnedIndexMap.get(right.fullPath)

    if (leftPinnedIndex !== undefined && rightPinnedIndex !== undefined) {
      return leftPinnedIndex - rightPinnedIndex
    }

    if (leftPinnedIndex !== undefined) {
      return -1
    }

    if (rightPinnedIndex !== undefined) {
      return 1
    }

    return normalizeEntryName(left.name).localeCompare(normalizeEntryName(right.name), 'zh-CN')
  })
}

function sanitizeCategoryLayouts(categoryLayouts: CategoryLayouts, categories: DesktopCategory[]) {
  const categoryPaths = new Map<DesktopCategoryId, Set<string>>()
  for (const category of categories) {
    categoryPaths.set(
      category.id,
      new Set(category.entries.map((entry) => entry.fullPath)),
    )
  }

  return Object.entries(categoryLayouts).reduce<CategoryLayouts>((next, [categoryId, entryPaths]) => {
    const typedCategoryId = categoryId as DesktopCategoryId
    const validPaths = categoryPaths.get(typedCategoryId)
    if (!validPaths || !entryPaths) {
      return next
    }

    const filtered = entryPaths.filter((entryPath, index) => {
      return entryPaths.indexOf(entryPath) === index && validPaths.has(entryPath)
    })

    if (filtered.length > 0) {
      next[typedCategoryId] = filtered
    }

    return next
  }, {})
}

function sortEntriesWithCategoryLayout(
  entries: DesktopEntry[],
  pinnedOrder: string[],
  layoutOrder: string[],
) {
  if (layoutOrder.length === 0) {
    return sortEntriesWithPinnedOrder(entries, pinnedOrder)
  }

  const layoutIndexMap = new Map(layoutOrder.map((entryPath, index) => [entryPath, index]))

  return [...entries].sort((left, right) => {
    const leftLayoutIndex = layoutIndexMap.get(left.fullPath)
    const rightLayoutIndex = layoutIndexMap.get(right.fullPath)

    if (leftLayoutIndex !== undefined && rightLayoutIndex !== undefined) {
      return leftLayoutIndex - rightLayoutIndex
    }

    if (leftLayoutIndex !== undefined) {
      return -1
    }

    if (rightLayoutIndex !== undefined) {
      return 1
    }

    return normalizeEntryName(left.name).localeCompare(normalizeEntryName(right.name), 'zh-CN')
  })
}

function App() {
  const suppressPresentationSyncRef = useRef(false)
  const lastPresentationPayloadRef = useRef('')
  const scrollHideTimerRef = useRef<number | null>(null)
  const categorySwitchTimerRef = useRef<number | null>(null)
  const notifiedAgendaKeysRef = useRef<Set<string>>(new Set())
  const scheduleTimelineRef = useRef<HTMLDivElement | null>(null)
  const agendaTitleInputRef = useRef<HTMLInputElement | null>(null)
  const hopeIdeaInputRef = useRef<HTMLInputElement | null>(null)
  const storedPreferences = useMemo(() => loadStoredPreferences(), [])
  const storedHopeItems = useMemo(() => sanitizeHopeItems(storedPreferences.hopeItems), [storedPreferences])
  const isDesktopRuntime = typeof window !== 'undefined' && Boolean(window.desktopHud)

  const [preset, setPreset] = useState<TransparencyPreset>(storedPreferences.preset ?? 'balanced')
  const [transparency, setTransparency] = useState<number>(storedPreferences.transparency ?? 66)
  const [silentMode, setSilentMode] = useState(storedPreferences.silentMode ?? true)
  const [agendaReminderEnabled, setAgendaReminderEnabled] = useState(
    storedPreferences.agendaReminderEnabled ?? true,
  )
  const [agendaViewMode, setAgendaViewMode] = useState<ScheduleViewMode>(
    storedPreferences.agendaViewMode === 'list' ? 'list' : 'timeline',
  )
  const [importPanelOpen, setImportPanelOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [translateOpen, setTranslateOpen] = useState(false)
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [isScrolling, setIsScrolling] = useState(false)
  const [contentHudVisible, setContentHudVisible] = useState(true)
  const [hudHidden, setHudHidden] = useState(false)
  const [agendaItems, setAgendaItems] = useState<ScheduleItem[]>(
    sanitizeAgenda(storedPreferences.agenda).length > 0
      ? sanitizeAgenda(storedPreferences.agenda)
      : createDefaultAgenda(),
  )
  const [agendaDraftTitle, setAgendaDraftTitle] = useState('')
  const [agendaDraftTime, setAgendaDraftTime] = useState(() => getDefaultAgendaDraftTime())
  const [hopeItems, setHopeItems] = useState<HopeItem[]>(storedHopeItems)
  const [selectedHopeIds, setSelectedHopeIds] = useState<string[]>(
    sanitizeSelectedHopeIds(storedPreferences.selectedHopeIds, storedHopeItems),
  )
  const [hopeDraftText, setHopeDraftText] = useState('')
  const [hopeDraftCategory, setHopeDraftCategory] = useState<HopeCategory>('spark')
  const [hopeAiOutput, setHopeAiOutput] = useState('')
  const [hopeAiMessage, setHopeAiMessage] = useState('')
  const [hopeSummarizing, setHopeSummarizing] = useState(false)
  const [deepSeekKeyDraft, setDeepSeekKeyDraft] = useState('')
  const [deepSeekSaving, setDeepSeekSaving] = useState(false)
  const [hasDeepSeekApiKey, setHasDeepSeekApiKey] = useState(false)
  const [translationSource, setTranslationSource] = useState('')
  const [translationTarget, setTranslationTarget] = useState<TranslationTarget>('auto')
  const [translationOutput, setTranslationOutput] = useState('')
  const [translationMessage, setTranslationMessage] = useState('')
  const [translationLoading, setTranslationLoading] = useState(false)
  const [currentTime, setCurrentTime] = useState(() => new Date())
  const [customSourcePaths, setCustomSourcePaths] = useState<string[]>(
    storedPreferences.customSourcePaths ?? [],
  )
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategoryId, setSelectedCategoryId] = useState<DesktopCategoryId | 'all'>(
    storedPreferences.selectedCategoryId ?? 'all',
  )
  const [manualOverrides, setManualOverrides] = useState<ManualOverrides>(
    storedPreferences.manualOverrides ?? {},
  )
  const [pinnedOrders, setPinnedOrders] = useState<PinnedOrders>(storedPreferences.pinnedOrders ?? {})
  const [categoryLayouts, setCategoryLayouts] = useState<CategoryLayouts>(
    storedPreferences.categoryLayouts ?? {},
  )
  const [contextEntryPath, setContextEntryPath] = useState<string | null>(null)
  const [entryMenuPosition, setEntryMenuPosition] = useState<EntryMenuPosition | null>(null)
  const [categoryPanelEntryPath, setCategoryPanelEntryPath] = useState<string | null>(null)
  const [peekEntryPath, setPeekEntryPath] = useState<string | null>(null)
  const [draggingPinnedEntryPath, setDraggingPinnedEntryPath] = useState<string | null>(null)
  const [desktopEntries, setDesktopEntries] = useState<DesktopEntry[]>(fallbackDesktopSnapshot)
  const [desktopPath, setDesktopPath] = useState('桌面')
  const [desktopSource, setDesktopSource] = useState<'live' | 'fallback'>('fallback')
  const [loadedSourcePaths, setLoadedSourcePaths] = useState<string[]>([])
  const [desktopSnapshotReady, setDesktopSnapshotReady] = useState(!isDesktopRuntime)
  const [launchAtStartupEnabled, setLaunchAtStartupEnabled] = useState(false)
  const [launchAtStartupSupported, setLaunchAtStartupSupported] = useState(false)
  const [runningWindows, setRunningWindows] = useState<RunningWindow[]>([])
  const [pinnedWindows, setPinnedWindows] = useState<PinnedWindowPreference[]>(
    sanitizePinnedWindows(storedPreferences.pinnedWindows),
  )
  const [runningWindowsLoading, setRunningWindowsLoading] = useState(false)
  const [statusMessage, setStatusMessage] = useState(
    '搜索现在会直接从全部桌面入口检索；未搜索时，主区只保留一个高频分组窗口。',
  )
  const [desktopIconsVisible, setDesktopIconsVisible] = useState<boolean | null>(null)

  const categories = useMemo(
    () => buildDesktopCategories(desktopEntries, manualOverrides),
    [desktopEntries, manualOverrides],
  )
  const rankedCategories = useMemo(
    () =>
      [...categories].sort((left, right) => {
        if (right.count !== left.count) {
          return right.count - left.count
        }

        return left.label.localeCompare(right.label, 'zh-CN')
      }),
    [categories],
  )
  const activeCategoryId = useMemo<DesktopCategoryId | null>(() => {
    if (selectedCategoryId !== 'all') {
      return selectedCategoryId
    }

    return rankedCategories[0]?.id ?? null
  }, [rankedCategories, selectedCategoryId])
  const activeCategory = useMemo(
    () => categories.find((category) => category.id === activeCategoryId) ?? rankedCategories[0] ?? null,
    [activeCategoryId, categories, rankedCategories],
  )
  const sanitizedPinnedOrders = useMemo(
    () => sanitizePinnedOrders(pinnedOrders, categories),
    [categories, pinnedOrders],
  )
  const sanitizedCategoryLayouts = useMemo(
    () => sanitizeCategoryLayouts(categoryLayouts, categories),
    [categories, categoryLayouts],
  )
  const activePinnedOrder = activeCategory ? sanitizedPinnedOrders[activeCategory.id] ?? [] : []
  const activeCategoryLayout = activeCategory ? sanitizedCategoryLayouts[activeCategory.id] ?? [] : []
  const searchResults = useMemo(
    () =>
      sortEntriesForHud(
        desktopEntries.filter((entry) => matchesSearch(entry, searchQuery)),
        searchQuery,
      ),
    [desktopEntries, searchQuery],
  )
  const displayEntries = useMemo(() => {
    if (searchQuery.trim()) {
      return searchResults
    }

    if (!activeCategory) {
      return []
    }

    return sortEntriesWithCategoryLayout(activeCategory.entries, activePinnedOrder, activeCategoryLayout)
  }, [activeCategory, activeCategoryLayout, activePinnedOrder, searchQuery, searchResults])
  const displayEntrySections = useMemo(
    () => buildEntrySections(displayEntries),
    [displayEntries],
  )
  const peekEntry = useMemo(
    () => desktopEntries.find((entry) => entry.fullPath === peekEntryPath) ?? null,
    [desktopEntries, peekEntryPath],
  )
  const categoryByEntryPath = useMemo(() => {
    const next = new Map<string, DesktopCategory>()

    for (const category of categories) {
      for (const entry of category.entries) {
        next.set(entry.fullPath, category)
      }
    }

    return next
  }, [categories])
  const contextEntry = useMemo(
    () => desktopEntries.find((entry) => entry.fullPath === contextEntryPath) ?? null,
    [contextEntryPath, desktopEntries],
  )
  const contextCategory = contextEntry ? categoryByEntryPath.get(contextEntry.fullPath) ?? null : null
  const contextManualCategoryId = contextEntry ? manualOverrides[contextEntry.fullPath] : undefined
  const contextEntryPinned =
    contextEntry && contextCategory
      ? (sanitizedPinnedOrders[contextCategory.id] ?? []).includes(contextEntry.fullPath)
      : false
  const peekCategory = peekEntry ? categoryByEntryPath.get(peekEntry.fullPath) ?? null : null
  const canvasTitle = searchQuery.trim() ? '搜索结果' : activeCategory?.label ?? '桌面入口'
  const todayLabel = useMemo(() => formatTodayLabel(new Date()), [])
  const sortedAgendaItems = useMemo(
    () =>
      [...agendaItems].sort((left, right) => {
        if (left.status === 'done' && right.status !== 'done') {
          return 1
        }

        if (left.status !== 'done' && right.status === 'done') {
          return -1
        }

        return left.time.localeCompare(right.time, 'zh-CN')
      }),
    [agendaItems],
  )
  const nextAgendaItem = useMemo(
    () => sortedAgendaItems.find((item) => item.status !== 'done') ?? null,
    [sortedAgendaItems],
  )
  const completedAgendaCount = useMemo(
    () => agendaItems.filter((item) => item.status === 'done').length,
    [agendaItems],
  )
  const selectedHopeItems = useMemo(
    () => hopeItems.filter((item) => selectedHopeIds.includes(item.id)),
    [hopeItems, selectedHopeIds],
  )
  const focusWindowActive = useMemo(() => isFocusWindow(currentTime), [currentTime])
  const clockLabel = useMemo(() => formatClockLabel(currentTime), [currentTime])
  const currentMinutes = currentTime.getHours() * 60 + currentTime.getMinutes()
  const timelineStart = 0
  const timelineEnd = 24 * 60
  const timelineSpan = timelineEnd - timelineStart
  const timelineSlots = useMemo(
    () =>
      Array.from({ length: 25 }, (_item, index) => ({
        minutes: timelineStart + index * 60,
        label: formatMinutesLabel(timelineStart + index * 60),
      })),
    [],
  )
  const agendaTimelineItems = useMemo(
    () => {
      const laneMinutes: number[] = []
      return sortedAgendaItems
        .map((item) => {
          const minutes = parseAgendaMinutes(item.time)
          if (minutes === null) {
            return null
          }

          const laneIndex = laneMinutes.findIndex((laneMinute) => minutes - laneMinute >= 40)
          const lane = laneIndex === -1 ? laneMinutes.length : laneIndex
          laneMinutes[lane] = minutes

          return {
            item,
            minutes,
            lane,
            left: `${clamp(((minutes - timelineStart) / timelineSpan) * 100, 0, 100)}%`,
            top: `${34 + lane * 22}px`,
          }
        })
        .filter((item): item is { item: ScheduleItem; minutes: number; lane: number; left: string; top: string } =>
          Boolean(item),
        )
    },
    [sortedAgendaItems],
  )
  const agendaListSections = useMemo(
    () =>
      Array.from({ length: 24 }, (_item, hour) => ({
        hour,
        label: `${String(hour).padStart(2, '0')}:00`,
        items: sortedAgendaItems.filter((item) => {
          const minutes = parseAgendaMinutes(item.time)
          return minutes !== null && Math.floor(minutes / 60) === hour
        }),
      })),
    [sortedAgendaItems],
  )
  const timelineNowLeft = `${clamp(((currentMinutes - timelineStart) / timelineSpan) * 100, 0, 100)}%`
  const agendaDraftMinutes = parseAgendaMinutes(agendaDraftTime) ?? currentMinutes
  const agendaDraftHour = Math.floor(agendaDraftMinutes / 60)
  const agendaDraftMinute = agendaDraftMinutes % 60
  const agendaHourOptions = useMemo(() => Array.from({ length: 24 }, (_item, index) => index), [])
  const agendaMinuteOptions = useMemo(() => Array.from({ length: 12 }, (_item, index) => index * 5), [])
  const pinnedWindowHandles = useMemo(() => new Set(pinnedWindows.map((windowItem) => windowItem.handle)), [
    pinnedWindows,
  ])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    if (!desktopSnapshotReady) {
      return
    }

    const nextPreferences: StoredPreferences = {
      agendaReminderEnabled,
      agendaViewMode,
      agenda: sanitizeAgenda(agendaItems),
      categoryLayouts: sanitizedCategoryLayouts,
      customSourcePaths,
      hopeItems: sanitizeHopeItems(hopeItems),
      selectedHopeIds: sanitizeSelectedHopeIds(selectedHopeIds, hopeItems),
      manualOverrides,
      pinnedOrders: sanitizedPinnedOrders,
      pinnedWindows: sanitizePinnedWindows(pinnedWindows),
      preset,
      selectedCategoryId,
      silentMode,
      transparency,
    }

    window.localStorage.setItem(preferencesStorageKey, JSON.stringify(nextPreferences))
  }, [
    agendaReminderEnabled,
    agendaViewMode,
    agendaItems,
    sanitizedCategoryLayouts,
    customSourcePaths,
    hopeItems,
    selectedHopeIds,
    manualOverrides,
    sanitizedPinnedOrders,
    pinnedWindows,
    preset,
    selectedCategoryId,
    silentMode,
    transparency,
    desktopSnapshotReady,
  ])

  useEffect(() => {
    const timer = window.setInterval(() => {
      setCurrentTime(new Date())
    }, 15_000)

    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!agendaReminderEnabled) {
      return
    }

    const todayKey = getTodayKey(currentTime)
    const nowMinutes = currentTime.getHours() * 60 + currentTime.getMinutes()

    for (const item of agendaItems) {
      if (item.status === 'done') {
        continue
      }

      const agendaMinutes = parseAgendaMinutes(item.time)
      if (agendaMinutes === null || agendaMinutes > nowMinutes) {
        continue
      }

      const noticeKey = `${todayKey}:${item.id}:${item.time}`
      if (notifiedAgendaKeysRef.current.has(noticeKey)) {
        continue
      }

      notifiedAgendaKeysRef.current.add(noticeKey)
      void playAgendaReminder(item)
    }
  }, [agendaItems, agendaReminderEnabled, currentTime])

  useEffect(() => {
    if (!isDesktopRuntime) {
      return
    }

    let cancelled = false

    async function loadDeepSeekSettings() {
      const result = await window.desktopHud?.getDeepSeekSettings?.()
      if (!cancelled && result?.ok) {
        setHasDeepSeekApiKey(result.hasApiKey)
      }
    }

    void loadDeepSeekSettings()

    return () => {
      cancelled = true
    }
  }, [isDesktopRuntime])

  useEffect(() => {
    if (!isDesktopRuntime || !settingsOpen) {
      return
    }

    void handleRefreshRunningWindows()
  }, [isDesktopRuntime, settingsOpen])

  useEffect(() => {
    if (!desktopSnapshotReady) {
      return
    }

    setPinnedOrders((current) => {
      const next = sanitizePinnedOrders(current, categories)
      return JSON.stringify(next) === JSON.stringify(current) ? current : next
    })
  }, [categories, desktopSnapshotReady])

  useEffect(() => {
    if (!desktopSnapshotReady) {
      return
    }

    setCategoryLayouts((current) => {
      const next = sanitizeCategoryLayouts(current, categories)
      return JSON.stringify(next) === JSON.stringify(current) ? current : next
    })
  }, [categories, desktopSnapshotReady])

  useEffect(() => {
    let cancelled = false

    async function loadDesktopEntries() {
      try {
        const result = await window.desktopHud?.getDesktopSnapshot?.(customSourcePaths)
        if (!cancelled && result?.entries?.length) {
          setDesktopEntries(result.entries)
          setDesktopPath(result.desktopPath)
          setLoadedSourcePaths(result.sourcePaths ?? [result.desktopPath])
          setDesktopSource('live')
          setDesktopSnapshotReady(true)
          setStatusMessage('当前结构会优先显示单分组主窗口，搜索独立于分组。')
        }
      } catch {
        if (!cancelled) {
          setDesktopSource('fallback')
          setDesktopSnapshotReady(true)
          setStatusMessage('当前使用演示数据，但搜索、右键动作和单分组画布都可以先体验。')
        }
      } finally {
        if (!cancelled) {
          setDesktopSnapshotReady(true)
        }
      }
    }

    void loadDesktopEntries()

    return () => {
      cancelled = true
    }
  }, [customSourcePaths])

  useEffect(() => {
    document.body.dataset.runtime = isDesktopRuntime ? 'desktop' : 'web'

    return () => {
      delete document.body.dataset.runtime
    }
  }, [isDesktopRuntime])

  useEffect(() => {
    if (!isDesktopRuntime) {
      return
    }

    const payload = JSON.stringify({
      hudHidden,
      hideSystemDesktopIcons: false,
    })

    if (suppressPresentationSyncRef.current) {
      suppressPresentationSyncRef.current = false
      lastPresentationPayloadRef.current = payload
      return
    }

    if (lastPresentationPayloadRef.current === payload) {
      return
    }

    lastPresentationPayloadRef.current = payload

    void window.desktopHud?.setWindowPresentation?.({
      hudHidden,
      hideSystemDesktopIcons: false,
    })
  }, [hudHidden, isDesktopRuntime])

  useEffect(() => {
    if (!isDesktopRuntime) {
      return
    }

    const unsubscribe = window.desktopHud?.onPresentationCommand?.((input) => {
      suppressPresentationSyncRef.current = true
      setHudHidden(input.hudHidden)
    })

    return () => {
      unsubscribe?.()
    }
  }, [isDesktopRuntime])

  useEffect(() => {
    if (!isDesktopRuntime) {
      return
    }

    let cancelled = false

    async function syncDesktopIconsState() {
      const result = await window.desktopHud?.getDesktopIconsVisibility?.()
      if (!cancelled && result?.ok) {
        setDesktopIconsVisible(result.visible)
      }
    }

    void syncDesktopIconsState()
    return () => {
      cancelled = true
    }
  }, [isDesktopRuntime])

  useEffect(() => {
    if (!isDesktopRuntime) {
      return
    }

    let cancelled = false

    async function syncLaunchAtStartupState() {
      const result = await window.desktopHud?.getLaunchAtStartup?.()
      if (!cancelled && result) {
        setLaunchAtStartupEnabled(result.enabled)
        setLaunchAtStartupSupported(result.supported)
      }
    }

    void syncLaunchAtStartupState()

    return () => {
      cancelled = true
    }
  }, [isDesktopRuntime])

  useEffect(() => {
    return () => {
      if (scrollHideTimerRef.current !== null) {
        window.clearTimeout(scrollHideTimerRef.current)
      }

      if (categorySwitchTimerRef.current !== null) {
        window.clearTimeout(categorySwitchTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    function handleGlobalDismiss() {
      setContextEntryPath(null)
      setEntryMenuPosition(null)
      setCategoryPanelEntryPath(null)
      setImportPanelOpen(false)
      setSettingsOpen(false)
      setScheduleOpen(false)
      setTranslateOpen(false)
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setContextEntryPath(null)
        setEntryMenuPosition(null)
        setCategoryPanelEntryPath(null)
        setPeekEntryPath(null)
        setImportPanelOpen(false)
        setSettingsOpen(false)
        setScheduleOpen(false)
        setTranslateOpen(false)
      }
    }

    window.addEventListener('pointerdown', handleGlobalDismiss)
    window.addEventListener('keydown', handleEscape)

    return () => {
      window.removeEventListener('pointerdown', handleGlobalDismiss)
      window.removeEventListener('keydown', handleEscape)
    }
  }, [])

  const overlayStyle = useMemo(() => {
    const panelAlpha = clamp(Math.pow(transparency / 100, 0.74), 0, 1)
    const hudPanelAlpha = Math.min(1, 0.22 + panelAlpha * 1.2)
    const hudLineAlpha = Math.min(1, 0.2 + panelAlpha * 0.84)
    const hudGlowAlpha = Math.min(0.84, 0.16 + panelAlpha * 0.5)
    const chipAlpha = Math.min(0.96, 0.16 + panelAlpha * 0.8)
    const textAlpha = Math.min(1, 0.18 + panelAlpha * 0.82)
    const mutedAlpha = Math.min(0.98, 0.1 + panelAlpha * 0.76)

    return {
      '--hud-panel-alpha': hudPanelAlpha.toFixed(2),
      '--hud-line-alpha': hudLineAlpha.toFixed(2),
      '--hud-glow-alpha': hudGlowAlpha.toFixed(2),
      '--chip-alpha': chipAlpha.toFixed(2),
      '--text-alpha': (silentMode ? textAlpha - 0.04 : textAlpha).toFixed(2),
      '--muted-alpha': (silentMode ? mutedAlpha - 0.04 : mutedAlpha).toFixed(2),
    } as CSSProperties
  }, [silentMode, transparency])

  function handlePresetChange(nextPreset: TransparencyPreset) {
    setPreset(nextPreset)
    setTransparency(presetValues[nextPreset])
  }

  function handleCategorySelection(categoryId: DesktopCategoryId | 'all') {
    const isCurrentCategory =
      categoryId === 'all' ? selectedCategoryId === 'all' : activeCategory?.id === categoryId

    if (isCurrentCategory) {
      setContentHudVisible((current) => !current)
      return
    }

    if (categorySwitchTimerRef.current !== null) {
      window.clearTimeout(categorySwitchTimerRef.current)
      categorySwitchTimerRef.current = null
    }

    setContentHudVisible(false)
    categorySwitchTimerRef.current = window.setTimeout(() => {
      setSelectedCategoryId(categoryId)
      setContentHudVisible(true)
      categorySwitchTimerRef.current = null
    }, 180)
  }

  async function playAgendaReminder(item: ScheduleItem) {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'default') {
        await Notification.requestPermission().catch(() => undefined)
      }

      if (Notification.permission === 'granted') {
        new Notification('日程提醒', {
          body: `${item.time} ${item.title}`,
          silent: false,
        })
      }
    }

    try {
      const audioHost = window as typeof window & { webkitAudioContext?: typeof AudioContext }
      const AudioContextCtor = window.AudioContext ?? audioHost.webkitAudioContext
      if (!AudioContextCtor) {
        return
      }

      const audioContext = new AudioContextCtor()
      const gain = audioContext.createGain()
      gain.gain.setValueAtTime(0.001, audioContext.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.16, audioContext.currentTime + 0.03)
      gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 1.1)
      gain.connect(audioContext.destination)

      for (const [index, frequency] of [660, 880, 660].entries()) {
        const oscillator = audioContext.createOscillator()
        oscillator.type = 'sine'
        oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime)
        oscillator.connect(gain)
        oscillator.start(audioContext.currentTime + index * 0.24)
        oscillator.stop(audioContext.currentTime + index * 0.24 + 0.18)
      }

      window.setTimeout(() => {
        void audioContext.close()
      }, 1300)
    } catch {
      // Some systems block autoplay-style audio; notification still carries the reminder.
    }
  }

  async function handleRefreshRunningWindows() {
    if (!isDesktopRuntime) {
      return
    }

    setRunningWindowsLoading(true)
    try {
      const result = await window.desktopHud?.listRunningWindows?.()
      if (!result?.ok) {
        setStatusMessage(result?.message || '读取正在运行的窗口失败。')
        return
      }

      setRunningWindows(result.windows)
    } finally {
      setRunningWindowsLoading(false)
    }
  }

  async function handleTogglePinnedWindow(windowItem: RunningWindow) {
    if (!isDesktopRuntime) {
      return
    }

    const shouldPin = !pinnedWindowHandles.has(windowItem.handle)
    const result = await window.desktopHud?.setExternalWindowTopmost?.(windowItem.handle, shouldPin)
    if (!result?.ok) {
      setStatusMessage(result?.message || `${shouldPin ? '固定' : '取消固定'}窗口失败。`)
      return
    }

    if (shouldPin) {
      setPinnedWindows((current) =>
        sanitizePinnedWindows([
          ...current,
          {
            handle: windowItem.handle,
            processId: windowItem.processId,
            processName: windowItem.processName,
            title: windowItem.title,
          },
        ]),
      )
    } else {
      setPinnedWindows((current) => current.filter((item) => item.handle !== windowItem.handle))
    }

    setRunningWindows((current) =>
      current.map((item) => (item.handle === windowItem.handle ? { ...item, isTopmost: shouldPin } : item)),
    )
    setStatusMessage(`${windowItem.title || windowItem.processName} ${shouldPin ? '已固定在桌面上一层。' : '已取消层固定。'}`)
  }

  async function handleRemovePinnedWindow(windowItem: PinnedWindowPreference) {
    if (isDesktopRuntime) {
      await window.desktopHud?.setExternalWindowTopmost?.(windowItem.handle, false)
    }

    setPinnedWindows((current) => current.filter((item) => item.handle !== windowItem.handle))
    setRunningWindows((current) =>
      current.map((item) => (item.handle === windowItem.handle ? { ...item, isTopmost: false } : item)),
    )
  }

  function handleAgendaTimelineWheel(event: WheelEvent<HTMLDivElement>) {
    if (!scheduleTimelineRef.current) {
      return
    }

    if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) {
      return
    }

    event.preventDefault()
    scheduleTimelineRef.current.scrollLeft += event.deltaY
  }

  function handleAgendaStatusChange(itemId: string) {
    setAgendaItems((current) =>
      current.map((item) => {
        if (item.id !== itemId) {
          return item
        }

        if (item.status === 'todo') {
          return { ...item, status: 'doing' }
        }

        if (item.status === 'doing') {
          return { ...item, status: 'done' }
        }

        return { ...item, status: 'todo' }
      }),
    )
  }

  function handleAgendaRemove(itemId: string) {
    setAgendaItems((current) => current.filter((item) => item.id !== itemId))
  }

  function handleAgendaCreate() {
    const title = agendaDraftTitle.trim()
    if (!title) {
      setStatusMessage('先写一个日程标题，再添加进去。')
      agendaTitleInputRef.current?.focus()
      return false
    }

    setAgendaItems((current) => [
      ...current,
      {
        id: `agenda-${Date.now()}`,
        title,
        time: normalizeAgendaTime(agendaDraftTime),
        status: 'todo',
      },
    ])
    setAgendaDraftTitle('')
    setAgendaDraftTime(getDefaultAgendaDraftTime())
    setStatusMessage(`已添加日程：${title}`)
    setScheduleOpen(true)
    window.setTimeout(() => {
      agendaTitleInputRef.current?.focus()
    }, 0)
    return true
  }

  function setAgendaDraftTimeParts(nextHour: number, nextMinute: number) {
    setAgendaDraftTime(formatMinutesLabel(nextHour * 60 + nextMinute))
  }

  function handleAgendaTimeWheel(part: 'hour' | 'minute', event: WheelEvent<HTMLDivElement>) {
    event.preventDefault()
    const direction = event.deltaY > 0 || event.deltaX > 0 ? 1 : -1

    if (part === 'hour') {
      setAgendaDraftTimeParts((agendaDraftHour + direction + 24) % 24, agendaDraftMinute)
      return
    }

    const currentMinuteIndex = Math.max(
      0,
      agendaMinuteOptions.indexOf(Math.round(agendaDraftMinute / 5) * 5),
    )
    const nextMinute =
      agendaMinuteOptions[(currentMinuteIndex + direction + agendaMinuteOptions.length) % agendaMinuteOptions.length]
    setAgendaDraftTimeParts(agendaDraftHour, nextMinute)
  }

  function handleAgendaSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    handleAgendaCreate()
  }

  function handleHopeSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const text = hopeDraftText.trim()
    if (!text) {
      setHopeAiMessage('先写一条迭代想法。')
      hopeIdeaInputRef.current?.focus()
      return
    }

    const nextItem: HopeItem = {
      id: `hope-${Date.now()}`,
      category: hopeDraftCategory,
      text,
      createdAt: Date.now(),
    }

    setHopeItems((current) => [...current, nextItem])
    setSelectedHopeIds((current) => [...current, nextItem.id])
    setHopeDraftText('')
    setHopeAiMessage('已加入 Hope List。')
    window.setTimeout(() => {
      hopeIdeaInputRef.current?.focus()
    }, 0)
  }

  function handleHopeSelection(itemId: string) {
    setSelectedHopeIds((current) =>
      current.includes(itemId) ? current.filter((id) => id !== itemId) : [...current, itemId],
    )
  }

  function handleHopeRemove(itemId: string) {
    setHopeItems((current) => current.filter((item) => item.id !== itemId))
    setSelectedHopeIds((current) => current.filter((id) => id !== itemId))
  }

  async function handleSaveDeepSeekApiKey() {
    if (!isDesktopRuntime) {
      setHopeAiMessage('DeepSeek Key 需要在桌面端保存。')
      return
    }

    setDeepSeekSaving(true)
    try {
      const result = await window.desktopHud?.saveDeepSeekApiKey?.(deepSeekKeyDraft)
      if (!result?.ok) {
        setHopeAiMessage(result?.message || 'DeepSeek Key 保存失败。')
        return
      }

      setHasDeepSeekApiKey(result.hasApiKey)
      setDeepSeekKeyDraft('')
      setHopeAiMessage(result.hasApiKey ? 'DeepSeek API Key 已保存。' : 'DeepSeek API Key 已清空。')
    } finally {
      setDeepSeekSaving(false)
    }
  }

  async function handleHopeSummarize() {
    if (!isDesktopRuntime) {
      setHopeAiMessage('AI 总结需要在桌面端运行。')
      return
    }

    if (!hasDeepSeekApiKey) {
      setHopeAiMessage('请先在设置里保存 DeepSeek API Key。')
      setSettingsOpen(true)
      return
    }

    if (selectedHopeItems.length === 0) {
      setHopeAiMessage('先选择至少一条想法，再让 DeepSeek 总结。')
      return
    }

    setHopeSummarizing(true)
    setHopeAiMessage('DeepSeek 正在整理这些想法...')
    try {
      const result = await window.desktopHud?.summarizeHopeList?.(
        selectedHopeItems.map((item) => ({
          category: hopeCategoryLabels[item.category],
          text: item.text,
        })),
      )

      if (!result?.ok || !result.summary) {
        setHopeAiMessage(result?.message || 'DeepSeek 总结失败。')
        return
      }

      setHopeAiOutput(result.summary)
      setHopeAiMessage('已生成计划性提示词。')
    } finally {
      setHopeSummarizing(false)
    }
  }

  async function handleCopyHopeOutput() {
    if (!hopeAiOutput.trim()) {
      return
    }

    try {
      await navigator.clipboard.writeText(hopeAiOutput)
      setHopeAiMessage('已复制计划性提示词。')
    } catch {
      setHopeAiMessage('复制失败，可以手动选中文本复制。')
    }
  }

  async function handleTranslateSubmit(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault()
    const text = translationSource.trim()
    if (!text) {
      setTranslationMessage('先输入要翻译的内容。')
      return
    }

    if (!isDesktopRuntime) {
      setTranslationMessage('翻译需要在桌面端运行。')
      return
    }

    if (!hasDeepSeekApiKey) {
      setTranslationMessage('请先在设置里保存 DeepSeek API Key。')
      setSettingsOpen(true)
      setTranslateOpen(false)
      return
    }

    setTranslationLoading(true)
    setTranslationMessage('DeepSeek 正在翻译...')
    try {
      if (!window.desktopHud?.translateText) {
        setTranslationMessage('翻译接口还没有加载，请重启桌面端后再试。')
        return
      }

      const result = await window.desktopHud?.translateText?.({
        text,
        target: translationTarget,
      })

      if (!result?.ok || !result.translation) {
        setTranslationMessage(result?.message || 'DeepSeek 翻译失败。')
        return
      }

      setTranslationOutput(result.translation)
      setTranslationMessage('翻译完成。')
    } finally {
      setTranslationLoading(false)
    }
  }

  async function handleCopyTranslation() {
    if (!translationOutput.trim()) {
      return
    }

    try {
      await navigator.clipboard.writeText(translationOutput)
      setTranslationMessage('译文已复制。')
    } catch {
      setTranslationMessage('复制失败，可以手动选中文本复制。')
    }
  }

  async function handleOpenEntry(entry: DesktopEntry) {
    if (!isDesktopRuntime) {
      setStatusMessage(`网页端仅演示交互，${normalizeEntryName(entry.name)} 需要桌面端才能直接打开。`)
      return
    }

    const result = await window.desktopHud?.openEntry?.(entry.fullPath)
    if (result?.ok) {
      setStatusMessage(`已打开 ${normalizeEntryName(entry.name)}。`)
      return
    }

    setStatusMessage(result?.message || `打开 ${normalizeEntryName(entry.name)} 失败。`)
  }

  async function handleRevealEntry(entry: DesktopEntry) {
    if (!isDesktopRuntime) {
      setStatusMessage(`网页端仅演示交互，${normalizeEntryName(entry.name)} 需要桌面端才能定位。`)
      return
    }

    const result = await window.desktopHud?.revealEntry?.(entry.fullPath)
    if (result?.ok) {
      setStatusMessage(`已在资源管理器中定位 ${normalizeEntryName(entry.name)}。`)
      return
    }

    setStatusMessage(result?.message || `定位 ${normalizeEntryName(entry.name)} 失败。`)
  }

  function movePinnedEntryAcrossCategories(
    current: PinnedOrders,
    entryPath: string,
    nextCategoryId: DesktopCategoryId,
  ) {
    const next = Object.entries(current).reduce<PinnedOrders>((accumulator, [categoryId, entryPaths]) => {
      const filtered = (entryPaths ?? []).filter((path) => path !== entryPath)
      if (filtered.length > 0) {
        accumulator[categoryId as DesktopCategoryId] = filtered
      }
      return accumulator
    }, {})

    const targetOrder = next[nextCategoryId] ?? []
    next[nextCategoryId] = [...targetOrder, entryPath]
    return next
  }

  function handleTogglePinnedEntry(entry: DesktopEntry) {
    const category = categoryByEntryPath.get(entry.fullPath)
    if (!category) {
      return
    }

    setPinnedOrders((current) => {
      const categoryOrder = current[category.id] ?? []
      const isPinned = categoryOrder.includes(entry.fullPath)

      if (isPinned) {
        const nextCategoryOrder = categoryOrder.filter((entryPath) => entryPath !== entry.fullPath)
        return {
          ...current,
          [category.id]: nextCategoryOrder,
        }
      }

      return {
        ...current,
        [category.id]: [...categoryOrder, entry.fullPath],
      }
    })

    setCategoryLayouts((current) => {
      const next = { ...current }
      const categoryLayout = next[category.id] ?? []
      next[category.id] = categoryLayout.filter((entryPath) => entryPath !== entry.fullPath)
      return next
    })

    setContextEntryPath(null)
    setEntryMenuPosition(null)
    setStatusMessage(
      `${normalizeEntryName(entry.name)}${activePinnedOrder.includes(entry.fullPath) ? ' 已取消固定。' : ' 已固定到当前分组。'}`,
    )
  }

  function handlePinnedEntryDrop(targetEntryPath: string) {
    if (!activeCategory || !draggingPinnedEntryPath || draggingPinnedEntryPath === targetEntryPath) {
      return
    }

    setCategoryLayouts((current) => {
      const next = { ...current }
      const currentLayout = next[activeCategory.id]?.filter((entryPath) =>
        activeCategory.entries.some((entry) => entry.fullPath === entryPath),
      )
      const layoutSource =
        currentLayout && currentLayout.length > 0
          ? [...currentLayout]
          : displayEntries.map((entry) => entry.fullPath)

      const draggingIndex = layoutSource.indexOf(draggingPinnedEntryPath)
      const targetIndex = layoutSource.indexOf(targetEntryPath)

      if (draggingIndex === -1 || targetIndex === -1) {
        return current
      }

      layoutSource.splice(draggingIndex, 1)
      layoutSource.splice(targetIndex, 0, draggingPinnedEntryPath)
      next[activeCategory.id] = layoutSource
      return next
    })

    setDraggingPinnedEntryPath(null)
  }

  function handleAssignCategory(entry: DesktopEntry, categoryId: DesktopCategoryId) {
    const currentCategory = categoryByEntryPath.get(entry.fullPath)
    const isPinned = currentCategory
      ? (sanitizedPinnedOrders[currentCategory.id] ?? []).includes(entry.fullPath)
      : false

    setManualOverrides((current) => ({
      ...current,
      [entry.fullPath]: categoryId,
    }))
    if (isPinned) {
      setPinnedOrders((current) => movePinnedEntryAcrossCategories(current, entry.fullPath, categoryId))
    }
    setContextEntryPath(null)
    setEntryMenuPosition(null)
    setCategoryPanelEntryPath(null)
    setStatusMessage(`已将 ${normalizeEntryName(entry.name)} 手动归入“${getCategoryMeta(categoryId)?.label}”。`)
  }

  function clearManualCategory(entry: DesktopEntry) {
    setManualOverrides((current) => {
      const next = { ...current }
      delete next[entry.fullPath]
      return next
    })
    setContextEntryPath(null)
    setEntryMenuPosition(null)
    setCategoryPanelEntryPath(null)
    setStatusMessage(`已取消 ${normalizeEntryName(entry.name)} 的手动分类，恢复自动判断。`)
  }

  async function handleToggleDesktopContentVisibility() {
    if (!isDesktopRuntime) {
      return
    }

    const nextVisible = desktopIconsVisible === false
    const result = await window.desktopHud?.setDesktopIconsVisibility?.(nextVisible)
    if (!result?.ok) {
      setStatusMessage(result?.message || `${nextVisible ? '显示' : '隐藏'}桌面内容失败。`)
      return
    }

    setDesktopIconsVisible(result.visible)
    setStatusMessage(result.visible ? '已显示桌面内容。' : '已隐藏桌面内容。')
  }

  async function handleToggleLaunchAtStartup() {
    if (!isDesktopRuntime) {
      return
    }

    const result = await window.desktopHud?.setLaunchAtStartup?.(!launchAtStartupEnabled)
    if (!result) {
      return
    }

    setLaunchAtStartupEnabled(result.enabled)
    setLaunchAtStartupSupported(result.supported)
    setStatusMessage(
      result.ok
        ? result.enabled
          ? '已开启开机自启动。'
          : '已关闭开机自启动。'
        : result.message || '开机自启动设置失败。',
    )
  }

  async function handleSelectImportPath() {
    if (!isDesktopRuntime) {
      setStatusMessage('褰撳墠婕旂ず绔殏涓嶆敮鎸佽矾寰勫鍏ャ€?')
      return
    }

    const result = await window.desktopHud?.selectImportPath?.()
    if (!result?.ok || !result.path) {
      return
    }

    setCustomSourcePaths((current) => {
      if (current.includes(result.path as string)) {
        return current
      }

      return [...current, result.path as string]
    })
    setImportPanelOpen(true)
  }

  function handleRemoveImportPath(targetPath: string) {
    setCustomSourcePaths((current) => current.filter((entryPath) => entryPath !== targetPath))
  }

  function handleToggleHudVisibility() {
    setHudHidden((current) => !current)
  }

  function handleScheduleDeckToggle() {
    setScheduleOpen((current) => {
      const next = !current
      if (next) {
        setImportPanelOpen(false)
        setSettingsOpen(false)
        setTranslateOpen(false)
        window.setTimeout(() => {
          agendaTitleInputRef.current?.focus()
        }, 0)
      }
      return next
    })
  }

  function handleSettingsDeckToggle() {
    setSettingsOpen((current) => {
      const next = !current
      if (next) {
        setImportPanelOpen(false)
        setTranslateOpen(false)
        setScheduleOpen(false)
        setCategoryPanelEntryPath(null)
      }
      return next
    })
  }

  function handleShellScroll() {
    setIsScrolling(true)
    if (scrollHideTimerRef.current !== null) {
      window.clearTimeout(scrollHideTimerRef.current)
    }

    scrollHideTimerRef.current = window.setTimeout(() => {
      setIsScrolling(false)
      scrollHideTimerRef.current = null
    }, 720)
  }

  return (
    <main
      className={`hud-shell ${silentMode ? 'is-silent' : ''} ${isScrolling ? 'is-scrolling' : ''} ${
        hudHidden ? 'is-hud-hidden' : ''
      } ${
        isDesktopRuntime ? 'desktop-runtime' : 'web-runtime'
      }`}
      style={overlayStyle}
      onScroll={handleShellScroll}
    >
      <header className="top-bar glass">
        <div className="brand-block">
          <span className="brand-mark">
            <img src={desktopAssistantLogo} alt="" aria-hidden="true" />
          </span>
          <div>
            <strong>桌面助手</strong>
            <p>
              {desktopSource === 'live'
                ? `当前读取 ${desktopPath}`
                : '当前使用本地演示快照'}
            </p>
          </div>
        </div>

        <div className="search-block">
          <input
            aria-label="搜索桌面项目"
            placeholder="搜索应用、项目、临时文件"
            value={searchQuery}
            onChange={(event) => {
              setSearchQuery(event.target.value)
              setContentHudVisible(true)
            }}
          />
          <button
            type="button"
            onClick={() => {
              setSearchQuery('')
              setContentHudVisible(true)
            }}
          >
            清空搜索
          </button>
          <div
            className={`import-paths-trigger ${importPanelOpen ? 'is-open' : ''}`}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className={`layer-trigger action-button ${importPanelOpen ? 'active' : ''}`}
              onClick={() => setImportPanelOpen((current) => !current)}
            >
              <span>导入路径</span>
              {customSourcePaths.length > 0 ? <small>{customSourcePaths.length} 个路径</small> : null}
            </button>

            {importPanelOpen ? (
              <div className="import-paths-panel glass">
                <div className="import-paths-head">
                  <strong>导入路径</strong>
                  <span>{loadedSourcePaths.length || 1} 个来源</span>
                </div>
                <div className="import-paths-list">
                  {customSourcePaths.length > 0 ? (
                    customSourcePaths.map((entryPath) => (
                      <div key={entryPath} className="import-path-item">
                        <span title={entryPath}>{entryPath}</span>
                        <button type="button" onClick={() => handleRemoveImportPath(entryPath)}>
                          移除
                        </button>
                      </div>
                    ))
                  ) : (
                    <span className="import-path-empty">当前默认读取桌面，你也可以额外导入常用文件夹。</span>
                  )}
                </div>
                <button type="button" className="control-action" onClick={() => void handleSelectImportPath()}>
                  添加文件夹
                </button>
              </div>
            ) : null}
          </div>
          <button
            type="button"
            className={`layer-trigger action-button ${settingsOpen ? 'active' : ''}`}
            onClick={(event) => {
              event.stopPropagation()
              handleSettingsDeckToggle()
            }}
            aria-expanded={settingsOpen}
          >
            <span>设置</span>
          </button>
        </div>
      </header>

      <aside className={`side-rail glass ${settingsOpen ? 'is-hidden' : ''}`}>
        <div className="rail-title">分组</div>
        <nav>
          {rankedCategories.map((category) => {
            const active = activeCategory?.id === category.id
            return (
              <button
                key={category.id}
                type="button"
                className={`rail-item ${active ? 'is-active' : ''}`}
                onClick={() => handleCategorySelection(category.id)}
              >
                <span>{category.icon}</span>
                <em>
                  {category.label}
                  <small>{category.count}</small>
                </em>
              </button>
            )
          })}
        </nav>
      </aside>

      <section
        className={`settings-deck ${settingsOpen ? 'is-open' : ''}`}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            setSettingsOpen(false)
          }
        }}
      >
        <div className="settings-window glass" onPointerDown={(event) => event.stopPropagation()}>
          <div className="deck-header">
            <strong>设置</strong>
            <span>细节设置</span>
          </div>

          <div className="settings-grid">
            {isDesktopRuntime ? (
              <>
                <button
                  type="button"
                  className={`control-action action-button ${hudHidden ? 'active' : ''}`}
                  onClick={handleToggleHudVisibility}
                >
                  <span>{hudHidden ? '显示 HUD' : '隐藏 HUD'}</span>
                  <small>Ctrl+Shift+Space</small>
                </button>
                <button
                  type="button"
                  className={`control-action ${desktopIconsVisible === false ? 'active' : ''}`}
                  onClick={() => void handleToggleDesktopContentVisibility()}
                >
                  {desktopIconsVisible === false ? '显示桌面内容' : '隐藏桌面内容'}
                </button>
                <button
                  type="button"
                  className={`control-action ${launchAtStartupEnabled ? 'active' : ''}`}
                  onClick={() => void handleToggleLaunchAtStartup()}
                  disabled={!launchAtStartupSupported}
                >
                  {launchAtStartupEnabled ? '已开启开机自启动' : '开启开机自启动'}
                </button>
                <div className="window-pin-settings">
                  <div className="settings-subhead">
                    <div>
                      <strong>窗口层固定</strong>
                      <span>从当前运行的程序里选择，固定在桌面上一层</span>
                    </div>
                    <button type="button" onClick={() => void handleRefreshRunningWindows()} disabled={runningWindowsLoading}>
                      {runningWindowsLoading ? '刷新中' : '刷新'}
                    </button>
                  </div>

                  <div className="pinned-window-list">
                    {pinnedWindows.length > 0 ? (
                      pinnedWindows.map((windowItem) => (
                        <div key={windowItem.handle} className="window-pin-item is-pinned">
                          <span title={windowItem.title}>{windowItem.title || windowItem.processName}</span>
                          <small>{windowItem.processName}</small>
                          <button type="button" onClick={() => void handleRemovePinnedWindow(windowItem)}>
                            移除
                          </button>
                        </div>
                      ))
                    ) : (
                      <span className="window-pin-empty">还没有固定窗口。</span>
                    )}
                  </div>

                  <div className="running-window-list">
                    {runningWindows.map((windowItem) => {
                      const pinned = pinnedWindowHandles.has(windowItem.handle)
                      return (
                        <button
                          key={windowItem.handle}
                          type="button"
                          className={`running-window-option ${pinned ? 'is-active' : ''}`}
                          onClick={() => void handleTogglePinnedWindow(windowItem)}
                        >
                          <span>{windowItem.title || windowItem.processName}</span>
                          <small>{pinned ? '已固定' : windowItem.processName}</small>
                        </button>
                      )
                    })}
                    {runningWindows.length === 0 ? (
                      <span className="window-pin-empty">刷新后会显示当前有窗口的程序。</span>
                    ) : null}
                  </div>
                </div>
              </>
            ) : null}

            <div className="opacity-settings">
              <div className="settings-subhead">
                <div>
                  <strong>HUD 透明度</strong>
                  <span>{transparency}%</span>
                </div>
              </div>
              <div className="preset-row">
                <button
                  type="button"
                  className={preset === 'focus' ? 'active' : ''}
                  onClick={() => handlePresetChange('focus')}
                >
                  清晰
                </button>
                <button
                  type="button"
                  className={preset === 'balanced' ? 'active' : ''}
                  onClick={() => handlePresetChange('balanced')}
                >
                  均衡
                </button>
                <button
                  type="button"
                  className={preset === 'ghost' ? 'active' : ''}
                  onClick={() => handlePresetChange('ghost')}
                >
                  通透
                </button>
              </div>
              <label className="slider-block">
                <span>0% 完全透明 · 100% 完全不透明</span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={transparency}
                  onChange={(event) => setTransparency(Number(event.target.value))}
                />
              </label>
            </div>

            <label className="toggle-row deck-toggle-row">
              <span>静默淡出</span>
              <button
                type="button"
                className={`toggle-pill ${silentMode ? 'on' : ''}`}
                onClick={() => setSilentMode((value) => !value)}
                aria-pressed={silentMode}
              >
                <i />
              </button>
            </label>

            <label className="toggle-row deck-toggle-row">
              <span>日程到时提醒</span>
              <button
                type="button"
                className={`toggle-pill ${agendaReminderEnabled ? 'on' : ''}`}
                onClick={() => setAgendaReminderEnabled((value) => !value)}
                aria-pressed={agendaReminderEnabled}
              >
                <i />
              </button>
            </label>

            <div className="deepseek-settings">
              <div>
                <strong>DeepSeek</strong>
                <span>{hasDeepSeekApiKey ? '已保存 API Key' : '还没有保存 API Key'}</span>
              </div>
              <div className="deepseek-key-row">
                <input
                  type="password"
                  value={deepSeekKeyDraft}
                  onChange={(event) => setDeepSeekKeyDraft(event.target.value)}
                  placeholder={hasDeepSeekApiKey ? '输入新 Key 可覆盖，留空可清空' : '粘贴 DeepSeek API Key'}
                />
                <button type="button" onClick={() => void handleSaveDeepSeekApiKey()} disabled={deepSeekSaving}>
                  {deepSeekSaving ? '保存中' : '保存'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section
        className={`translate-deck glass ${translateOpen ? 'is-open' : ''}`}
        onPointerEnter={() => {
          setTranslateOpen(true)
          setSettingsOpen(false)
          setScheduleOpen(false)
        }}
        onPointerLeave={() => setTranslateOpen(false)}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            setTranslateOpen(false)
          }
        }}
      >
        <button
          type="button"
          className="deck-mini"
          onClick={(event) => {
            event.stopPropagation()
            setTranslateOpen((current) => !current)
          }}
          aria-expanded={translateOpen}
        >
          <span className="deck-mini-label">翻译</span>
        </button>

        <div
          className="deck-panel"
          onPointerDown={(event) => {
            event.stopPropagation()
            if (event.target === event.currentTarget) {
              setTranslateOpen(false)
            }
          }}
        >
          <form className="translate-panel" onSubmit={handleTranslateSubmit}>
            <div className="deck-header">
              <strong>翻译画板</strong>
              <span>{hasDeepSeekApiKey ? 'DeepSeek' : '需要 Key'}</span>
            </div>
            <div className="translate-targets" aria-label="翻译目标">
              {translationTargets.map((target) => (
                <button
                  key={target.id}
                  type="button"
                  className={translationTarget === target.id ? 'active' : ''}
                  onClick={() => setTranslationTarget(target.id)}
                >
                  {target.label}
                </button>
              ))}
            </div>
            <textarea
              value={translationSource}
              onChange={(event) => setTranslationSource(event.target.value)}
              placeholder="输入要翻译的文本"
            />
            <button type="submit" disabled={translationLoading || !translationSource.trim()}>
              {translationLoading ? '翻译中' : '翻译'}
            </button>
            <div className="translate-output">
              {translationOutput || translationMessage || '译文会显示在这里。'}
            </div>
            {translationOutput ? (
              <button type="button" className="translate-copy" onClick={() => void handleCopyTranslation()}>
                复制译文
              </button>
            ) : null}
          </form>
        </div>
      </section>

      <section
        className={`schedule-deck glass ${scheduleOpen ? 'is-open' : ''}`}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            setScheduleOpen(false)
          }
        }}
      >
        <button
          type="button"
          className="deck-mini"
          onClick={(event) => {
            event.stopPropagation()
            handleScheduleDeckToggle()
          }}
          aria-expanded={scheduleOpen}
        >
          <span className="deck-mini-label">日程</span>
          <strong>{nextAgendaItem?.time ?? `${completedAgendaCount}/${agendaItems.length || 0}`}</strong>
        </button>

        <div
          className="deck-panel"
          onPointerDown={(event) => {
            event.stopPropagation()
          }}
        >
          <section className="schedule-card">
            <div className="schedule-head">
              <div>
                <strong>今日日程</strong>
                <p>{todayLabel}</p>
              </div>
              <span className="schedule-progress">
                {completedAgendaCount}/{agendaItems.length || 0}
              </span>
              <button
                type="button"
                className={`schedule-reminder-chip ${agendaReminderEnabled ? 'is-on' : ''}`}
                onClick={() => setAgendaReminderEnabled((value) => !value)}
              >
                {agendaReminderEnabled ? '\u63d0\u9192\u5f00' : '\u63d0\u9192\u5173'}
              </button>
            </div>

            <div className="schedule-focus">
              <span>下一项</span>
              <strong>{nextAgendaItem ? `${nextAgendaItem.time} ${nextAgendaItem.title}` : '今天先放空一下'}</strong>
            </div>

            <div className="schedule-view-tabs" role="tablist" aria-label={'\u65e5\u7a0b\u67e5\u770b\u89c6\u56fe'}>
              <button
                type="button"
                className={agendaViewMode === 'timeline' ? 'active' : ''}
                onClick={() => setAgendaViewMode('timeline')}
              >
                {'\u65f6\u95f4\u8f74'}
              </button>
              <button
                type="button"
                className={agendaViewMode === 'list' ? 'active' : ''}
                onClick={() => setAgendaViewMode('list')}
              >
                {'\u6e05\u5355'}
              </button>
            </div>

            {agendaViewMode === 'timeline' ? (
            <div ref={scheduleTimelineRef} className="schedule-timeline" onWheel={handleAgendaTimelineWheel}>
              <div className="schedule-timeline-track">
                {timelineSlots.map((slot) => (
                  <span
                    key={slot.minutes}
                    className="schedule-time-slot"
                    style={{ left: `${((slot.minutes - timelineStart) / timelineSpan) * 100}%` }}
                  >
                    {slot.label}
                  </span>
                ))}
                <span className="schedule-now-marker" style={{ left: timelineNowLeft }}>
                  {clockLabel}
                </span>
                {agendaTimelineItems.map(({ item, left, top }) => (
                  <div
                    key={item.id}
                    className={`schedule-timeline-dot schedule-timeline-dot-${item.status}`}
                    style={{ left, top }}
                    title={`${item.time} ${item.title}`}
                  >
                    <button type="button" className="schedule-timeline-state" onClick={() => handleAgendaStatusChange(item.id)}>
                      <span>{item.time}</span>
                    </button>
                    <button
                      type="button"
                      className="schedule-timeline-remove"
                      onClick={(event) => {
                        event.stopPropagation()
                        handleAgendaRemove(item.id)
                      }}
                    >
                      {'\u00d7'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
            ) : null}

            {agendaViewMode === 'list' ? (
            <div className="schedule-list">
              {agendaListSections.map((section) => (
                <section key={section.hour} className="schedule-list-hour">
                  <div className="schedule-list-hour-label">{section.label}</div>
                  <div className="schedule-list-hour-items">
                    {section.items.length > 0 ? (
                      section.items.map((item) => (
                        <div
                          key={item.id}
                          className={`schedule-item schedule-item-${item.status}`}
                          onPointerDown={(event) => event.stopPropagation()}
                        >
                          <button type="button" className="schedule-state" onClick={() => handleAgendaStatusChange(item.id)}>
                            {item.status === 'todo'
                              ? '\u5f85\u529e'
                              : item.status === 'doing'
                                ? '\u8fdb\u884c\u4e2d'
                                : '\u5df2\u5b8c\u6210'}
                          </button>
                          <div className="schedule-copy">
                            <strong>{item.title}</strong>
                            <span>{item.time}</span>
                          </div>
                          <button type="button" className="schedule-remove" onClick={() => handleAgendaRemove(item.id)}>
                            {'\u5220\u9664'}
                          </button>
                        </div>
                      ))
                    ) : (
                      <span className="schedule-empty-hour">{'\u6682\u65e0\u5b89\u6392'}</span>
                    )}
                  </div>
                </section>
              ))}
            </div>
            ) : null}

            <form className="schedule-creator" onSubmit={handleAgendaSubmit}>
              <div className="schedule-primary-input">
                <span>{'\u65b0\u589e'}</span>
                <input
                ref={agendaTitleInputRef}
                aria-label="新增日程标题"
                className="schedule-input"
                placeholder="新增一条提醒"
                value={agendaDraftTitle}
                onChange={(event) => setAgendaDraftTitle(event.target.value)}
              />
              </div>
              <div className="schedule-creator-row">
                <div className="schedule-time-dial" aria-label={'\u65b0\u589e\u65e5\u7a0b\u65f6\u95f4'}>
                  <div className="schedule-dial-column" onWheel={(event) => handleAgendaTimeWheel('hour', event)}>
                    <span>{'\u65f6'}</span>
                    <div className="schedule-dial-options">
                      {agendaHourOptions.map((hour) => (
                        <button
                          key={hour}
                          type="button"
                          className={hour === agendaDraftHour ? 'active' : ''}
                          onClick={() => setAgendaDraftTimeParts(hour, agendaDraftMinute)}
                        >
                          {String(hour).padStart(2, '0')}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="schedule-dial-column" onWheel={(event) => handleAgendaTimeWheel('minute', event)}>
                    <span>{'\u5206'}</span>
                    <div className="schedule-dial-options">
                      {agendaMinuteOptions.map((minute) => (
                        <button
                          key={minute}
                          type="button"
                          className={minute === agendaDraftMinute ? 'active' : ''}
                          onClick={() => setAgendaDraftTimeParts(agendaDraftHour, minute)}
                        >
                          {String(minute).padStart(2, '0')}
                        </button>
                      ))}
                    </div>
                  </div>
                  <strong>{agendaDraftTime}</strong>
                </div>
                <input
                  aria-label="新增日程时间"
                  className="schedule-input schedule-time-input"
                  inputMode="numeric"
                  placeholder="09:30"
                  value={agendaDraftTime}
                  onChange={(event) => setAgendaDraftTime(event.target.value)}
                />
                <button type="submit" disabled={!agendaDraftTitle.trim()}>
                  {'\u6dfb\u52a0'}
                </button>
              </div>
              <p className="schedule-creator-hint">
                {agendaDraftTitle.trim() ? '回车也可以直接添加，时间可留空。' : statusMessage}
              </p>
            </form>

          </section>
        </div>
      </section>

      <aside className="hope-stack" onPointerDown={(event) => event.stopPropagation()}>
        <section className="hope-card glass">
          <div className="hope-head">
            <div>
              <strong>Hope List</strong>
              <span>{hopeItems.length} 条想法</span>
            </div>
            <button
              type="button"
              className="hope-ai-button"
              onClick={() => void handleHopeSummarize()}
              disabled={hopeSummarizing || selectedHopeItems.length === 0}
            >
              {hopeSummarizing ? '总结中' : 'AI 计划'}
            </button>
          </div>

          <form className="hope-form" onSubmit={handleHopeSubmit}>
            <div className="hope-category-row" aria-label="Hope List 分类">
              {hopeCategories.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  className={hopeDraftCategory === category.id ? 'active' : ''}
                  onClick={() => setHopeDraftCategory(category.id)}
                >
                  {category.label}
                </button>
              ))}
            </div>
            <div className="hope-input-row">
              <input
                ref={hopeIdeaInputRef}
                value={hopeDraftText}
                onChange={(event) => setHopeDraftText(event.target.value)}
                placeholder="记下一条迭代想法"
              />
              <button type="submit" disabled={!hopeDraftText.trim()}>
                添加
              </button>
            </div>
          </form>

          <div className="hope-list">
            {hopeItems.length > 0 ? (
              hopeItems.map((item) => {
                const selected = selectedHopeIds.includes(item.id)
                return (
                  <div key={item.id} className={`hope-item ${selected ? 'is-selected' : ''}`}>
                    <button
                      type="button"
                      className="hope-select"
                      onClick={() => handleHopeSelection(item.id)}
                      aria-pressed={selected}
                    >
                      {selected ? '已选' : '选择'}
                    </button>
                    <div className="hope-copy">
                      <span>{hopeCategoryLabels[item.category]}</span>
                      <strong>{item.text}</strong>
                    </div>
                    <button type="button" className="hope-remove" onClick={() => handleHopeRemove(item.id)}>
                      删除
                    </button>
                  </div>
                )
              })
            ) : (
              <div className="hope-empty">这里先留给下一轮灵感。</div>
            )}
          </div>

          <div className="hope-ai-foot">
            <span>{hopeAiMessage || (hasDeepSeekApiKey ? 'DeepSeek 已就绪。' : '先在设置里保存 DeepSeek Key。')}</span>
            {hopeAiOutput ? (
              <button type="button" onClick={() => void handleCopyHopeOutput()}>
                复制
              </button>
            ) : null}
          </div>

          {hopeAiOutput ? <pre className="hope-output">{hopeAiOutput}</pre> : null}
        </section>

        <section className={`focus-board glass ${focusWindowActive ? 'is-red' : 'is-green'}`}>
          <span className="focus-light" />
          <div>
            <strong>{focusWindowActive ? '高峰时段' : '自由时段'}</strong>
            <p>{clockLabel} · {focusWindowActive ? '红灯' : '绿灯'}</p>
          </div>
        </section>
      </aside>

      <section className={`group-layer ${settingsOpen ? 'is-hidden' : ''}`}>
        <article
          className={`group-frame group-frame-single ${contentHudVisible && !settingsOpen ? '' : 'is-hidden'}`}
        >
          <div className="group-frame-aurora" aria-hidden="true">
            <Aurora
              colorStops={['#5227FF', '#7cff67', '#7727ff']}
              amplitude={0.55}
              blend={0.28}
            />
          </div>

          <div className="group-frame-content">
          <div className={`frame-head ${contentHudVisible && !settingsOpen ? '' : 'is-hidden'}`}>
            <div className="frame-title">
              <strong>
                {canvasTitle}
                <small>{displayEntries.length}</small>
              </strong>
              <span>{searchQuery.trim() ? '全桌面检索结果' : activeCategory?.anchor ?? '当前高频分组'}</span>
            </div>
          </div>

          <div
            className={`app-grid ${contentHudVisible && !settingsOpen ? '' : 'is-hidden'}`}
          >
            {displayEntrySections.map((section) => (
              <Fragment key={section.meta.id}>
                <div className="entry-section-header">
                  <span className="entry-section-header-icon">{section.meta.icon}</span>
                  <strong>{section.meta.label}</strong>
                  <span className="entry-section-header-count">{section.entries.length}</span>
                </div>
                {section.entries.map((entry) => {
                  const currentCategory = categoryByEntryPath.get(entry.fullPath)
                  const isPinned = currentCategory
                    ? (sanitizedPinnedOrders[currentCategory.id] ?? []).includes(entry.fullPath)
                    : false
                  const canDragPinned = isPinned && !searchQuery.trim()
                  const canAcceptPinnedDrop = Boolean(
                    activeCategory && draggingPinnedEntryPath && !searchQuery.trim() && draggingPinnedEntryPath !== entry.fullPath,
                  )

                  return (
                    <div
                      key={entry.fullPath}
                      className={`app-card ${contextEntryPath === entry.fullPath ? 'is-menu-open' : ''} ${isPinned ? 'is-pinned' : ''} ${
                        draggingPinnedEntryPath === entry.fullPath ? 'is-dragging' : ''
                      }`}
                      onPointerDown={(event) => event.stopPropagation()}
                      onContextMenu={(event) => {
                        event.preventDefault()
                        event.stopPropagation()
                        setSettingsOpen(false)
                        setCategoryPanelEntryPath(null)
                        setContextEntryPath(entry.fullPath)
                        setEntryMenuPosition({
                          x: Math.max(16, Math.min(event.clientX, window.innerWidth - 460)),
                          y: Math.max(16, Math.min(event.clientY, window.innerHeight - 280)),
                        })
                      }}
                      draggable={canDragPinned}
                      onDragStart={(event) => {
                        if (!canDragPinned) {
                          return
                        }

                        setDraggingPinnedEntryPath(entry.fullPath)
                        event.dataTransfer.effectAllowed = 'move'
                        event.dataTransfer.setData('text/plain', entry.fullPath)
                      }}
                      onDragOver={(event) => {
                        if (!canAcceptPinnedDrop) {
                          return
                        }

                        event.preventDefault()
                        event.dataTransfer.dropEffect = 'move'
                      }}
                      onDrop={(event) => {
                        if (!canAcceptPinnedDrop) {
                          return
                        }

                        event.preventDefault()
                        handlePinnedEntryDrop(entry.fullPath)
                      }}
                      onDragEnd={() => setDraggingPinnedEntryPath(null)}
                    >
                      <button
                        type="button"
                        className="app-card-main"
                        onClick={() => void handleOpenEntry(entry)}
                        title={entry.fullPath}
                      >
                        {isPinned ? <span className="pin-badge">已固定</span> : null}
                        {entry.iconDataUrl ? (
                          <span className="app-icon-frame">
                            <img className="app-icon-image" src={entry.iconDataUrl} alt="" aria-hidden="true" />
                          </span>
                        ) : (
                          <span className="app-glyph">{getEntryGlyph(entry)}</span>
                        )}
                        <strong>{normalizeEntryName(entry.name)}</strong>
                        <small>
                          {searchQuery.trim()
                            ? currentCategory?.label ?? '未归组'
                            : entry.kind === 'shortcut'
                              ? '应用'
                              : entry.kind === 'folder'
                                ? '文件夹'
                                : entry.extension || '文件'}
                        </small>
                      </button>
                    </div>
                  )
                })}
              </Fragment>
            ))}

            {displayEntries.length === 0 ? (
              <div className="empty-state">
                <strong>没有命中内容</strong>
                <p>换个关键词试试，或者切换到其他分组。</p>
              </div>
            ) : null}
          </div>
          </div>
        </article>
      </section>

      {contextEntry && entryMenuPosition ? (
        <div
          className="entry-menu entry-menu-floating glass"
          style={{ left: entryMenuPosition.x, top: entryMenuPosition.y }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <div className="entry-menu-actions">
            <button
              type="button"
              onClick={() => {
                setPeekEntryPath(contextEntry.fullPath)
                setContextEntryPath(null)
                setEntryMenuPosition(null)
                setContentHudVisible(true)
              }}
            >
              速览
            </button>
            <button type="button" onClick={() => void handleRevealEntry(contextEntry)}>
              定位
            </button>
            <button
              type="button"
              className={contextEntryPinned ? 'is-active' : ''}
              onClick={() => handleTogglePinnedEntry(contextEntry)}
            >
              {contextEntryPinned ? '取消固定' : '固定'}
            </button>
            <button
              type="button"
              className={categoryPanelEntryPath === contextEntry.fullPath ? 'is-active' : ''}
              onClick={() => {
                setCategoryPanelEntryPath((current) =>
                  current === contextEntry.fullPath ? null : contextEntry.fullPath,
                )
              }}
            >
              手动分类
            </button>
          </div>

          {categoryPanelEntryPath === contextEntry.fullPath ? (
            <div className="entry-submenu glass">
              <div className="entry-submenu-head">
                <strong>手动分类</strong>
                <span>{contextCategory?.label ?? '未归组'}</span>
              </div>
              <div className="entry-menu-categories">
                {rankedCategories.map((category) => (
                  <button
                    key={`${contextEntry.fullPath}-${category.id}`}
                    type="button"
                    className={contextManualCategoryId === category.id ? 'is-active' : ''}
                    onClick={() => handleAssignCategory(contextEntry, category.id)}
                  >
                    {category.label}
                  </button>
                ))}
              </div>

              <div className="entry-submenu-actions">
                <button
                  type="button"
                  className="assign-reset"
                  onClick={() => setCategoryPanelEntryPath(null)}
                >
                  返回
                </button>
                {contextManualCategoryId ? (
                  <button
                    type="button"
                    className="assign-reset"
                    onClick={() => clearManualCategory(contextEntry)}
                  >
                    恢复自动分类
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <aside className={`utility-stack ${contentHudVisible && !settingsOpen ? '' : 'is-hidden'}`}>
        {peekEntry ? (
          <section className="utility-card glass">
            <strong>入口速览</strong>
            <p>{normalizeEntryName(peekEntry.name)}</p>
            <div className="preview-list">
              <span>类型：{peekEntry.kind === 'folder' ? '文件夹' : peekEntry.kind === 'shortcut' ? '快捷方式' : '文件'}</span>
              <span>分组：{peekCategory?.label ?? '待判断'}</span>
              <span>路径：{peekEntry.resolvedPath ?? peekEntry.fullPath}</span>
            </div>
            <div className="preview-actions">
              <button
                type="button"
                onClick={() => {
                  setPeekEntryPath(null)
                  setContentHudVisible(true)
                }}
              >
                收起
              </button>
              <button type="button" onClick={() => void handleOpenEntry(peekEntry)}>
                直接打开
              </button>
            </div>
          </section>
        ) : null}
      </aside>
    </main>
  )
}

export default App
