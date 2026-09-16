import type { DesktopCategoryId, DesktopEntry } from './desktopData'

type OrganizeAssignment = {
  fullPath: string
  categoryId: DesktopCategoryId
}

type OrganizeMove = {
  categoryId: DesktopCategoryId
  folderName: string
  sourcePath: string
  targetDirectory: string
  targetPath: string
  name: string
  message?: string
}

declare global {
  interface Window {
    desktopHud?: {
      getDesktopSnapshot?: (extraPaths?: string[]) => Promise<{
        desktopPath: string
        sourcePaths: string[]
        entries: DesktopEntry[]
      }>
      selectImportPath?: () => Promise<{
        ok: boolean
        canceled?: boolean
        path?: string
      }>
      openEntry?: (fullPath: string) => Promise<{ ok: boolean; message?: string }>
      revealEntry?: (fullPath: string) => Promise<{ ok: boolean; message?: string }>
      previewOrganize?: (assignments: OrganizeAssignment[]) => Promise<{
        ok: boolean
        organizeRoot: string
        moves: OrganizeMove[]
        summary: string
      }>
      executeOrganize?: (assignments: OrganizeAssignment[]) => Promise<{
        ok: boolean
        organizeRoot: string
        completed: OrganizeMove[]
        skipped: OrganizeMove[]
      }>
      getDesktopIconsVisibility?: () => Promise<{
        ok: boolean
        visible: boolean
        message?: string
      }>
      setDesktopIconsVisibility?: (visible: boolean) => Promise<{
        ok: boolean
        visible: boolean
        message?: string
      }>
      getLaunchAtStartup?: () => Promise<{
        ok: boolean
        enabled: boolean
        supported: boolean
        message?: string
      }>
      setLaunchAtStartup?: (enabled: boolean) => Promise<{
        ok: boolean
        enabled: boolean
        supported: boolean
        message?: string
      }>
      listRunningWindows?: () => Promise<{
        ok: boolean
        windows: Array<{
          handle: string
          processId: number
          processName: string
          title: string
          isTopmost: boolean
        }>
        message?: string
      }>
      setExternalWindowTopmost?: (
        handle: string,
        topmost: boolean,
      ) => Promise<{
        ok: boolean
        handle: string
        topmost: boolean
        message?: string
      }>
      getDeepSeekSettings?: () => Promise<{
        ok: boolean
        hasApiKey: boolean
        message?: string
      }>
      saveDeepSeekApiKey?: (apiKey: string) => Promise<{
        ok: boolean
        hasApiKey: boolean
        message?: string
      }>
      summarizeHopeList?: (
        items: Array<{
          category: string
          text: string
        }>,
      ) => Promise<{
        ok: boolean
        summary?: string
        message?: string
      }>
      translateText?: (input: {
        text: string
        target: 'auto' | 'zh' | 'en'
      }) => Promise<{
        ok: boolean
        translation?: string
        message?: string
      }>
      setWindowPresentation?: (input: {
        hudHidden: boolean
        hideSystemDesktopIcons: boolean
      }) => Promise<{
        desktopIconsManaged: boolean
      }>
      onPresentationCommand?: (
        callback: (input: {
          hudHidden: boolean
          hideSystemDesktopIcons: boolean
        }) => void,
      ) => () => void
    }
  }
}

export {}
