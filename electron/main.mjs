import { app, BrowserWindow, Menu, Tray, dialog, globalShortcut, ipcMain, nativeImage, screen, shell } from 'electron'
import { execFile } from 'node:child_process'
import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises'
import { promisify } from 'node:util'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const appRoot = path.resolve(__dirname, '..')
const isDevServerMode = process.argv.includes('--dev')
const devServerUrl = 'http://127.0.0.1:5173'
const organizeRootName = '桌面分组'
const execFileAsync = promisify(execFile)

app.commandLine.appendSwitch('disable-gpu-shader-disk-cache')
app.commandLine.appendSwitch('disable-http-cache')

try {
  app.setPath('sessionData', path.join(app.getPath('userData'), 'session-data'))
} catch {
  // Keep Electron defaults if the custom session path cannot be applied.
}

const categoryFolderNames = {
  creative: '创作',
  dev: '开发',
  temp: '临时',
  games: '游戏',
  projects: '项目',
  downloads: '下载',
}

let mainWindow
let tray

let presentationState = {
  hudHidden: false,
  hideSystemDesktopIcons: false,
}
let desktopIconsBaselineVisible = null
const presentationStateFile = path.join(app.getPath('userData'), 'presentation-state.json')
const deepSeekSettingsFile = path.join(app.getPath('userData'), 'deepseek-settings.json')

function getLoginItemOptions(enabled) {
  const options = {
    openAtLogin: enabled,
    openAsHidden: true,
  }

  if (process.platform !== 'win32') {
    return options
  }

  const executablePath = app.getPath('exe')
  const launchArgs = app.isPackaged ? [] : [app.getAppPath()]

  return {
    ...options,
    path: executablePath,
    args: launchArgs,
    enabled,
    name: '桌面助手',
  }
}

function getLoginItemQueryOptions() {
  if (process.platform !== 'win32') {
    return undefined
  }

  return {
    path: app.getPath('exe'),
    args: app.isPackaged ? [] : [app.getAppPath()],
  }
}

function getLaunchAtStartupStatus() {
  if (process.platform !== 'win32' && process.platform !== 'darwin') {
    return {
      ok: false,
      enabled: false,
      supported: false,
      message: 'Launch at startup is only supported on Windows and macOS.',
    }
  }

  const settings = app.getLoginItemSettings(getLoginItemQueryOptions())
  const isEnabled =
    process.platform === 'win32'
      ? Boolean(settings.openAtLogin || settings.executableWillLaunchAtLogin)
      : Boolean(settings.openAtLogin)

  return {
    ok: true,
    enabled: isEnabled,
    supported: true,
  }
}

function setLaunchAtStartupEnabled(enabled) {
  if (process.platform !== 'win32' && process.platform !== 'darwin') {
    return {
      ok: false,
      enabled: false,
      supported: false,
      message: 'Launch at startup is only supported on Windows and macOS.',
    }
  }

  app.setLoginItemSettings(getLoginItemOptions(Boolean(enabled)))
  return getLaunchAtStartupStatus()
}

async function loadPresentationState() {
  try {
    const raw = await readFile(presentationStateFile, 'utf8')
    const saved = JSON.parse(raw)
    presentationState = {
      ...presentationState,
      hudHidden: typeof saved.hudHidden === 'boolean' ? saved.hudHidden : false,
      hideSystemDesktopIcons:
        typeof saved.hideSystemDesktopIcons === 'boolean'
          ? saved.hideSystemDesktopIcons
          : presentationState.hideSystemDesktopIcons,
    }
  } catch {
    // Keep defaults until the first successful save.
  }
}

async function savePresentationState() {
  try {
    await writeFile(presentationStateFile, JSON.stringify(presentationState, null, 2), 'utf8')
  } catch (error) {
    console.error('Failed to save presentation state:', error)
  }
}

async function loadDeepSeekApiKey() {
  try {
    const raw = await readFile(deepSeekSettingsFile, 'utf8')
    const saved = JSON.parse(raw)
    return typeof saved.apiKey === 'string' ? saved.apiKey.trim() : ''
  } catch {
    return ''
  }
}

async function saveDeepSeekApiKey(apiKey) {
  const nextKey = typeof apiKey === 'string' ? apiKey.trim() : ''
  await writeFile(deepSeekSettingsFile, JSON.stringify({ apiKey: nextKey }, null, 2), 'utf8')
  return { ok: true, hasApiKey: nextKey.length > 0 }
}

function formatDeepSeekError(status, payload) {
  const message =
    payload?.error?.message ||
    payload?.message ||
    (typeof payload === 'string' ? payload : '') ||
    `DeepSeek request failed with status ${status}.`

  if (status === 401) {
    return `DeepSeek API Key 无效或已过期：${message}`
  }

  if (status === 429) {
    return `DeepSeek 请求过于频繁或额度受限：${message}`
  }

  return message
}

async function summarizeHopeListWithDeepSeek(items = []) {
  const apiKey = await loadDeepSeekApiKey()
  if (!apiKey) {
    return { ok: false, message: '请先在设置里保存 DeepSeek API Key。' }
  }

  const cleanItems = Array.isArray(items)
    ? items
        .map((item) => ({
          category: typeof item?.category === 'string' ? item.category.trim() : '灵感',
          text: typeof item?.text === 'string' ? item.text.trim() : '',
        }))
        .filter((item) => item.text.length > 0)
        .slice(0, 24)
    : []

  if (cleanItems.length === 0) {
    return { ok: false, message: '先选择至少一条 Hope List 想法。' }
  }

  try {
    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'deepseek-v4-flash',
        stream: false,
        temperature: 0.4,
        max_tokens: 1200,
        messages: [
          {
            role: 'system',
            content:
              '你是一个桌面软件迭代规划助手。把零散想法整理成一段可直接交给 AI 编程助手执行的中文计划性提示词。要求包含目标、范围、关键改动、验收标准和注意事项，避免空泛鼓励。',
          },
          {
            role: 'user',
            content: cleanItems
              .map((item, index) => `${index + 1}. [${item.category}] ${item.text}`)
              .join('\n'),
          },
        ],
      }),
    })

    const payload = await response.json().catch(() => null)
    if (!response.ok) {
      return { ok: false, message: formatDeepSeekError(response.status, payload) }
    }

    const summary = payload?.choices?.[0]?.message?.content?.trim()
    if (!summary) {
      return { ok: false, message: 'DeepSeek 没有返回可用内容，请稍后再试。' }
    }

    return { ok: true, summary }
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    }
  }
}

async function translateTextWithDeepSeek(input = {}) {
  const apiKey = await loadDeepSeekApiKey()
  if (!apiKey) {
    return { ok: false, message: '请先在设置里保存 DeepSeek API Key。' }
  }

  const text = typeof input?.text === 'string' ? input.text.trim() : ''
  const target = ['zh', 'en', 'auto'].includes(input?.target) ? input.target : 'auto'
  if (!text) {
    return { ok: false, message: '先输入要翻译的内容。' }
  }

  const targetInstruction =
    target === 'zh'
      ? 'Translate the text into natural Simplified Chinese.'
      : target === 'en'
        ? 'Translate the text into natural English.'
        : 'If the text is mainly Chinese, translate it into natural English. Otherwise translate it into natural Simplified Chinese.'

  try {
    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'deepseek-v4-flash',
        stream: false,
        temperature: 0.2,
        max_tokens: 1200,
        messages: [
          {
            role: 'system',
            content:
              `${targetInstruction} Return only the translated text. Preserve line breaks, names, code, and URLs where appropriate.`,
          },
          {
            role: 'user',
            content: text.slice(0, 6000),
          },
        ],
      }),
    })

    const payload = await response.json().catch(() => null)
    if (!response.ok) {
      return { ok: false, message: formatDeepSeekError(response.status, payload) }
    }

    const translation = payload?.choices?.[0]?.message?.content?.trim()
    if (!translation) {
      return { ok: false, message: 'DeepSeek 没有返回可用译文，请稍后再试。' }
    }

    return { ok: true, translation }
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    }
  }
}

// Adapted for Electron from the MIT-licensed Windows desktop icon toggle scheme in
// C:\Users\MECHREVO\Desktop\desk_tidy-main\lib\utils\desktop_helper\desktop_icons.dart
const desktopIconsPowerShell = String.raw`
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public static class DesktopHudIcons {
  [DllImport("user32.dll")]
  public static extern IntPtr GetShellWindow();

  [DllImport("user32.dll", CharSet = CharSet.Unicode)]
  public static extern IntPtr FindWindow(string lpClassName, string lpWindowName);

  [DllImport("user32.dll", CharSet = CharSet.Unicode)]
  public static extern IntPtr FindWindowEx(IntPtr parentHandle, IntPtr childAfter, string className, string windowTitle);

  [DllImport("user32.dll")]
  public static extern bool IsWindowVisible(IntPtr hWnd);

  [DllImport("user32.dll")]
  public static extern IntPtr GetParent(IntPtr hWnd);

  [DllImport("user32.dll", CharSet = CharSet.Unicode)]
  public static extern IntPtr SendMessageTimeout(
    IntPtr hWnd,
    uint Msg,
    IntPtr wParam,
    IntPtr lParam,
    uint fuFlags,
    uint uTimeout,
    out UIntPtr lpdwResult
  );

  [DllImport("shell32.dll")]
  public static extern void SHChangeNotify(uint wEventId, uint uFlags, IntPtr dwItem1, IntPtr dwItem2);
}
"@

function Find-DesktopListView {
  $shellWindow = [DesktopHudIcons]::GetShellWindow()
  $defView = [IntPtr]::Zero

  if ($shellWindow -ne [IntPtr]::Zero) {
    $defView = [DesktopHudIcons]::FindWindowEx($shellWindow, [IntPtr]::Zero, "SHELLDLL_DefView", $null)
  }

  if ($defView -eq [IntPtr]::Zero) {
    $progman = [DesktopHudIcons]::FindWindow("Progman", $null)
    if ($progman -ne [IntPtr]::Zero) {
      $defView = [DesktopHudIcons]::FindWindowEx($progman, [IntPtr]::Zero, "SHELLDLL_DefView", $null)
    }
  }

  if ($defView -eq [IntPtr]::Zero) {
    $worker = [DesktopHudIcons]::FindWindowEx([IntPtr]::Zero, [IntPtr]::Zero, "WorkerW", $null)
    while ($worker -ne [IntPtr]::Zero -and $defView -eq [IntPtr]::Zero) {
      $defView = [DesktopHudIcons]::FindWindowEx($worker, [IntPtr]::Zero, "SHELLDLL_DefView", $null)
      $worker = [DesktopHudIcons]::FindWindowEx([IntPtr]::Zero, $worker, "WorkerW", $null)
    }
  }

  if ($defView -eq [IntPtr]::Zero) {
    return [IntPtr]::Zero
  }

  return [DesktopHudIcons]::FindWindowEx($defView, [IntPtr]::Zero, "SysListView32", "FolderView")
}

function Get-DesktopIconsVisible {
  $listView = Find-DesktopListView
  if ($listView -ne [IntPtr]::Zero) {
    return [DesktopHudIcons]::IsWindowVisible($listView)
  }

  try {
    $value = (Get-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced" -Name HideIcons -ErrorAction Stop).HideIcons
    return ([int]$value -eq 0)
  } catch {
    return $true
  }
}

function Notify-DesktopChanged {
  [DesktopHudIcons]::SHChangeNotify(0x08000000, 0x0000, [IntPtr]::Zero, [IntPtr]::Zero)
  $setting = [System.Runtime.InteropServices.Marshal]::StringToHGlobalUni("ShellState")
  try {
    $result = [UIntPtr]::Zero
    [DesktopHudIcons]::SendMessageTimeout([IntPtr]0xffff, 0x001A, [IntPtr]::Zero, $setting, 0x0002, 1000, [ref]$result) | Out-Null
    [DesktopHudIcons]::SendMessageTimeout([IntPtr]0xffff, 0x031A, [IntPtr]::Zero, [IntPtr]::Zero, 0x0000, 1000, [ref]$result) | Out-Null
  } finally {
    [System.Runtime.InteropServices.Marshal]::FreeHGlobal($setting)
  }
}

function Set-DesktopIconsVisible([bool]$visible) {
  $listView = Find-DesktopListView
  if ($listView -ne [IntPtr]::Zero) {
    $current = [DesktopHudIcons]::IsWindowVisible($listView)
    if ($current -eq $visible) {
      return $true
    }

    $shellWindow = [DesktopHudIcons]::GetShellWindow()
    $defView = [DesktopHudIcons]::GetParent($listView)
    $result = [UIntPtr]::Zero

    if ($defView -ne [IntPtr]::Zero) {
      [DesktopHudIcons]::SendMessageTimeout($defView, 0x0111, [IntPtr]0x7402, [IntPtr]::Zero, 0x0002, 1000, [ref]$result) | Out-Null
    }

    if ($shellWindow -ne [IntPtr]::Zero) {
      [DesktopHudIcons]::SendMessageTimeout($shellWindow, 0x0111, [IntPtr]0x7402, [IntPtr]::Zero, 0x0002, 1000, [ref]$result) | Out-Null
    }

    $progman = [DesktopHudIcons]::FindWindow("Progman", $null)
    if ($progman -ne [IntPtr]::Zero) {
      [DesktopHudIcons]::SendMessageTimeout($progman, 0x0111, [IntPtr]0x7402, [IntPtr]::Zero, 0x0002, 1000, [ref]$result) | Out-Null
    }

    $deadline = [DateTime]::UtcNow.AddMilliseconds(900)
    while ([DateTime]::UtcNow -lt $deadline) {
      $now = Find-DesktopListView
      $nowVisible = ($now -ne [IntPtr]::Zero) -and [DesktopHudIcons]::IsWindowVisible($now)
      if ($nowVisible -eq $visible) {
        return $true
      }
      Start-Sleep -Milliseconds 40
    }
  }

  try {
    Set-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced" -Name HideIcons -Type DWord -Value $(if ($visible) { 0 } else { 1 })
    Notify-DesktopChanged
    return $true
  } catch {
    return $false
  }
}
`

async function runDesktopIconsScript(action, visible) {
  if (process.platform !== 'win32') {
    return { ok: false, message: 'Desktop icon control is only supported on Windows.' }
  }

  const visibilityLiteral = visible ? '$true' : '$false'
  const actionScript =
    action === 'get'
      ? '$visible = Get-DesktopIconsVisible; @{ ok = $true; visible = [bool]$visible } | ConvertTo-Json -Compress'
      : `$ok = Set-DesktopIconsVisible(${visibilityLiteral}); $visible = Get-DesktopIconsVisible; @{ ok = [bool]$ok; visible = [bool]$visible } | ConvertTo-Json -Compress`
  const command = `${desktopIconsPowerShell}\n${actionScript}`
  const encoded = Buffer.from(command, 'utf16le').toString('base64')

  try {
    const { stdout } = await execFileAsync('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-EncodedCommand',
      encoded,
    ])

    const output = stdout.trim()
    return output ? JSON.parse(output) : { ok: false, message: 'No result from desktop icon controller.' }
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    }
  }
}

async function getDesktopIconsVisible() {
  const result = await runDesktopIconsScript('get')
  return {
    ok: Boolean(result?.ok),
    visible: result?.visible !== false,
    message: result?.message,
  }
}

async function setDesktopIconsVisible(visible) {
  const result = await runDesktopIconsScript('set', visible)
  return {
    ok: Boolean(result?.ok),
    visible: result?.visible !== false,
    message: result?.message,
  }
}

const externalWindowsPowerShell = String.raw`
Add-Type -TypeDefinition @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;

public static class DesktopHudWindows {
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

  [DllImport("user32.dll")]
  public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);

  [DllImport("user32.dll")]
  public static extern bool IsWindowVisible(IntPtr hWnd);

  [DllImport("user32.dll")]
  public static extern int GetWindowTextLength(IntPtr hWnd);

  [DllImport("user32.dll", CharSet = CharSet.Unicode)]
  public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);

  [DllImport("user32.dll")]
  public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);

  [DllImport("user32.dll", EntryPoint = "GetWindowLongPtr")]
  public static extern IntPtr GetWindowLongPtr64(IntPtr hWnd, int nIndex);

  [DllImport("user32.dll", EntryPoint = "GetWindowLong")]
  public static extern IntPtr GetWindowLongPtr32(IntPtr hWnd, int nIndex);

  [DllImport("user32.dll")]
  public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int x, int y, int cx, int cy, uint flags);

  public static IntPtr GetWindowLongPtr(IntPtr hWnd, int nIndex) {
    return IntPtr.Size == 8 ? GetWindowLongPtr64(hWnd, nIndex) : GetWindowLongPtr32(hWnd, nIndex);
  }
}
"@

function Get-DesktopHudWindows([int]$currentProcessId) {
  $windows = New-Object System.Collections.Generic.List[object]
  $callback = [DesktopHudWindows+EnumWindowsProc]{
    param([IntPtr]$handle, [IntPtr]$lParam)

    if (-not [DesktopHudWindows]::IsWindowVisible($handle)) {
      return $true
    }

    $length = [DesktopHudWindows]::GetWindowTextLength($handle)
    if ($length -le 0) {
      return $true
    }

    $builder = New-Object System.Text.StringBuilder($length + 1)
    [DesktopHudWindows]::GetWindowText($handle, $builder, $builder.Capacity) | Out-Null
    $title = $builder.ToString().Trim()
    if ([string]::IsNullOrWhiteSpace($title)) {
      return $true
    }

    [uint32]$pid = 0
    [DesktopHudWindows]::GetWindowThreadProcessId($handle, [ref]$pid) | Out-Null
    if ([int]$pid -eq $currentProcessId) {
      return $true
    }

    try {
      $process = Get-Process -Id ([int]$pid) -ErrorAction Stop
      $style = [DesktopHudWindows]::GetWindowLongPtr($handle, -20).ToInt64()
      $windows.Add([pscustomobject]@{
        handle = $handle.ToInt64().ToString()
        processId = [int]$pid
        processName = $process.ProcessName
        title = $title
        isTopmost = (($style -band 0x00000008) -ne 0)
      }) | Out-Null
    } catch {
    }

    return $true
  }

  [DesktopHudWindows]::EnumWindows($callback, [IntPtr]::Zero) | Out-Null
  return $windows
}

function Set-DesktopHudWindowTopmost([string]$handleText, [bool]$topmost) {
  $handleValue = [Int64]::Parse($handleText)
  $handle = [IntPtr]$handleValue
  $insertAfter = if ($topmost) { [IntPtr](-1) } else { [IntPtr](-2) }
  $flags = 0x0001 -bor 0x0002 -bor 0x0010
  return [DesktopHudWindows]::SetWindowPos($handle, $insertAfter, 0, 0, 0, 0, $flags)
}
`

async function runExternalWindowsScript(action, payload = {}) {
  if (process.platform !== 'win32') {
    return { ok: false, message: 'Window layer control is only supported on Windows.' }
  }

  const actionScript =
    action === 'list'
      ? `$windows = Get-DesktopHudWindows ${process.pid}; @{ ok = $true; windows = @($windows) } | ConvertTo-Json -Compress -Depth 4`
      : `$ok = Set-DesktopHudWindowTopmost "${String(payload.handle ?? '')}" ${payload.topmost ? '$true' : '$false'}; @{ ok = [bool]$ok; handle = "${String(
          payload.handle ?? '',
        )}"; topmost = ${payload.topmost ? '$true' : '$false'} } | ConvertTo-Json -Compress`
  const encoded = Buffer.from(`${externalWindowsPowerShell}\n${actionScript}`, 'utf16le').toString('base64')

  try {
    const { stdout } = await execFileAsync('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-EncodedCommand',
      encoded,
    ])

    const output = stdout.trim()
    return output ? JSON.parse(output) : { ok: false, message: 'No result from window controller.' }
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    }
  }
}

async function listRunningWindows() {
  const result = await runExternalWindowsScript('list')
  const windows = Array.isArray(result?.windows)
    ? result.windows
    : result?.windows
      ? [result.windows]
      : []

  return {
    ok: Boolean(result?.ok),
    windows: windows
      .map((windowItem) => ({
        handle: String(windowItem.handle ?? ''),
        processId: Number(windowItem.processId) || 0,
        processName: String(windowItem.processName ?? ''),
        title: String(windowItem.title ?? ''),
        isTopmost: Boolean(windowItem.isTopmost),
      }))
      .filter((windowItem) => windowItem.handle && windowItem.title)
      .sort((left, right) => left.title.localeCompare(right.title, 'zh-CN')),
    message: result?.message,
  }
}

async function setExternalWindowTopmost(handle, topmost) {
  const normalizedHandle = String(handle ?? '').trim()
  if (!/^\d+$/.test(normalizedHandle)) {
    return { ok: false, handle: normalizedHandle, topmost: Boolean(topmost), message: 'Invalid window handle.' }
  }

  const result = await runExternalWindowsScript('set', {
    handle: normalizedHandle,
    topmost: Boolean(topmost),
  })

  return {
    ok: Boolean(result?.ok),
    handle: normalizedHandle,
    topmost: Boolean(topmost),
    message: result?.message,
  }
}

async function syncDesktopIconsForPresentation() {
  if (process.platform !== 'win32') {
    return
  }

  if (!presentationState.hideSystemDesktopIcons) {
    if (desktopIconsBaselineVisible !== null) {
      await setDesktopIconsVisible(desktopIconsBaselineVisible)
      desktopIconsBaselineVisible = null
    }
    return
  }

  if (presentationState.hudHidden) {
    if (desktopIconsBaselineVisible === null) {
      const current = await getDesktopIconsVisible()
      desktopIconsBaselineVisible = current.visible
    }

    await setDesktopIconsVisible(false)
    return
  }

  if (desktopIconsBaselineVisible !== null) {
    await setDesktopIconsVisible(desktopIconsBaselineVisible)
    desktopIconsBaselineVisible = null
  }
}

async function resolveDesktopIconsAfterPresentationChange(previousState, nextState) {
  if (process.platform !== 'win32') {
    return
  }

  const disabledAutoManage =
    previousState.hideSystemDesktopIcons && !nextState.hideSystemDesktopIcons
  const restoredHud =
    previousState.hideSystemDesktopIcons &&
    previousState.hudHidden &&
    !nextState.hudHidden

  if (disabledAutoManage || restoredHud) {
    const restoreVisible = desktopIconsBaselineVisible ?? true
    await setDesktopIconsVisible(restoreVisible)
    desktopIconsBaselineVisible = null
    return
  }

  await syncDesktopIconsForPresentation()
}

function resolveDesktopPath() {
  return path.join(app.getPath('home'), 'Desktop')
}

function resolveOrganizeRoot() {
  return path.join(resolveDesktopPath(), organizeRootName)
}

function isDirectDesktopChild(fullPath) {
  return path.dirname(fullPath).toLowerCase() === resolveDesktopPath().toLowerCase()
}

function resolveIconSourcePath(fullPath, extension) {
  if (process.platform === 'win32' && extension === '.lnk') {
    try {
      const shortcut = shell.readShortcutLink(fullPath)
      if (shortcut?.target) {
        return shortcut.target
      }
    } catch {
      return fullPath
    }
  }

  return fullPath
}

function resolveEntryPreviewPath(fullPath, extension, kind) {
  if (kind === 'folder') {
    return fullPath
  }

  if (process.platform === 'win32' && extension === '.lnk') {
    try {
      const shortcut = shell.readShortcutLink(fullPath)
      if (shortcut?.target) {
        return path.dirname(shortcut.target)
      }
    } catch {
      return fullPath
    }
  }

  return fullPath
}

async function getEntryIconDataUrl(fullPath, extension) {
  try {
    const iconSourcePath = resolveIconSourcePath(fullPath, extension)
    const icon = await app.getFileIcon(iconSourcePath, { size: 'large' })
    return icon.isEmpty() ? undefined : icon.toDataURL()
  } catch {
    return undefined
  }
}

async function readEntriesFromRoot(rootPath) {
  const entries = await readdir(rootPath, { withFileTypes: true })

  return Promise.all(
    entries
      .filter((entry) => !(rootPath.toLowerCase() === resolveDesktopPath().toLowerCase() && entry.name === organizeRootName))
      .map(async (entry) => {
        const fullPath = path.join(rootPath, entry.name)
        const extension = path.extname(entry.name).toLowerCase()
        const kind = entry.isDirectory()
          ? 'folder'
          : extension === '.lnk' || extension === '.url'
            ? 'shortcut'
            : 'file'

        return {
          name: entry.name,
          extension,
          kind,
          fullPath,
          iconDataUrl: await getEntryIconDataUrl(fullPath, extension),
          resolvedPath: resolveEntryPreviewPath(fullPath, extension, kind),
        }
      }),
  )
}

async function readDesktopSnapshot(extraPaths = []) {
  const desktopPath = resolveDesktopPath()
  const sourcePaths = [desktopPath, ...extraPaths.filter(Boolean)].filter(
    (entryPath, index, allPaths) => allPaths.indexOf(entryPath) === index,
  )

  const results = await Promise.all(
    sourcePaths.map(async (sourcePath) => {
      try {
        return await readEntriesFromRoot(sourcePath)
      } catch {
        return []
      }
    }),
  )

  return {
    desktopPath,
    sourcePaths,
    entries: results.flat(),
  }
}

function buildMovePlan(assignments = []) {
  const organizeRoot = resolveOrganizeRoot()

  return assignments
    .filter((assignment) => assignment?.fullPath && assignment?.categoryId)
    .filter((assignment) => isDirectDesktopChild(assignment.fullPath))
    .map((assignment) => {
      const folderName = categoryFolderNames[assignment.categoryId] ?? assignment.categoryId
      const targetDirectory = path.join(organizeRoot, folderName)
      const targetPath = path.join(targetDirectory, path.basename(assignment.fullPath))

      return {
        categoryId: assignment.categoryId,
        folderName,
        sourcePath: assignment.fullPath,
        targetDirectory,
        targetPath,
        name: path.basename(assignment.fullPath),
      }
    })
}

async function loadDevServer(win) {
  let attempts = 0

  while (attempts < 10) {
    try {
      await win.loadURL(devServerUrl)
      return
    } catch {
      attempts += 1
      await new Promise((resolve) => setTimeout(resolve, 600))
    }
  }

  await win.loadURL(`data:text/html,
    <html>
      <body style="margin:0;background:#111827;color:#e5e7eb;font:14px Segoe UI;padding:24px;">
        <h2>桌面助手 failed to connect to Vite</h2>
        <p>Expected dev server: ${devServerUrl}</p>
        <p>Retry <code>npm.cmd run dev:desktop</code> after the dev server is ready.</p>
      </body>
    </html>`)
}

function toggleWindowVisibility() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow()
    return
  }

  if (mainWindow.isVisible()) {
    mainWindow.hide()
    return
  }

  mainWindow.show()
  if (!presentationState.hudHidden) {
    mainWindow.focus()
  }
}

function refreshTrayMenu() {
  if (!tray) {
    return
  }

  const menu = Menu.buildFromTemplate([
    {
      label: mainWindow?.isVisible() ? '隐藏 HUD' : '显示 HUD',
      click: () => toggleWindowVisibility(),
    },
    {
      label: presentationState.hudHidden ? '显示 HUD' : '隐藏 HUD',
      click: () => {
        presentationState = {
          ...presentationState,
          hudHidden: !presentationState.hudHidden,
        }
        applyWindowPresentation(presentationState)
        broadcastPresentationState()
      },
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => app.quit(),
    },
  ])

  tray.setContextMenu(menu)
}

function broadcastPresentationState() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return
  }

  mainWindow.webContents.send('desktop-hud:presentation-command', presentationState)
  refreshTrayMenu()
}

function applyWindowPresentation({ hudHidden, hideSystemDesktopIcons }) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return
  }

  presentationState = {
    ...presentationState,
    hudHidden,
    hideSystemDesktopIcons:
      typeof hideSystemDesktopIcons === 'boolean'
        ? hideSystemDesktopIcons
        : presentationState.hideSystemDesktopIcons,
  }
  void savePresentationState()

  const { workArea } = screen.getDisplayMatching(mainWindow.getBounds())
  mainWindow.setBounds(workArea)
  mainWindow.setIgnoreMouseEvents(false)
  mainWindow.setSkipTaskbar(false)
  mainWindow.setResizable(true)
  mainWindow.setMinimizable(true)
  mainWindow.setMaximizable(true)
  mainWindow.setMovable(true)
  mainWindow.setFocusable(!hudHidden)
  if (hudHidden) {
    mainWindow.setIgnoreMouseEvents(true, { forward: true })
    mainWindow.blur()
    return
  }

  mainWindow.focus()
}

function createTray() {
  if (tray) {
    return tray
  }

  const trayIconPath = path.join(appRoot, 'public', 'favicon.svg')
  const trayIcon = nativeImage.createFromPath(trayIconPath)
  tray = new Tray(trayIcon.resize({ width: 16, height: 16 }))
  tray.setToolTip('桌面助手')

  tray.on('double-click', () => {
    toggleWindowVisibility()
  })

  refreshTrayMenu()
  return tray
}

function createWindow() {
  const { workArea } = screen.getPrimaryDisplay()
  const win = new BrowserWindow({
    x: workArea.x,
    y: workArea.y,
    width: workArea.width,
    height: workArea.height,
    minWidth: 1180,
    minHeight: 760,
    show: false,
    transparent: true,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#00000000',
    vibrancy: 'under-window',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  win.once('ready-to-show', () => {
    win.maximize()
    win.show()
    applyWindowPresentation(presentationState)
  })

  if (isDevServerMode) {
    void loadDevServer(win)
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    void win.loadFile(path.join(appRoot, 'dist', 'index.html'))
  }

  mainWindow = win
  refreshTrayMenu()
  return win
}

ipcMain.handle('desktop-hud:get-desktop-snapshot', async (_event, extraPaths) =>
  readDesktopSnapshot(Array.isArray(extraPaths) ? extraPaths : []),
)

ipcMain.handle('desktop-hud:select-import-path', async () => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return { ok: false, canceled: true }
  }

  const result = await dialog.showOpenDialog(mainWindow, {
    title: '选择导入文件夹',
    properties: ['openDirectory'],
  })

  if (result.canceled || result.filePaths.length === 0) {
    return { ok: false, canceled: true }
  }

  return {
    ok: true,
    path: result.filePaths[0],
  }
})

ipcMain.handle('desktop-hud:open-entry', async (_event, fullPath) => {
  const message = await shell.openPath(fullPath)
  return { ok: message.length === 0, message }
})

ipcMain.handle('desktop-hud:reveal-entry', async (_event, fullPath) => {
  const extension = path.extname(fullPath).toLowerCase()
  const revealPath = resolveEntryPreviewPath(fullPath, extension, 'file')

  if (extension === '.lnk' && revealPath !== fullPath) {
    const message = await shell.openPath(revealPath)
    return { ok: message.length === 0, message }
  }

  shell.showItemInFolder(revealPath)
  return { ok: true }
})

ipcMain.handle('desktop-hud:preview-organize', async (_event, assignments) => {
  const moves = buildMovePlan(assignments)
  const summary = `${moves.length} 项将移动到 ${organizeRootName} 下的分类文件夹`

  return {
    ok: true,
    organizeRoot: resolveOrganizeRoot(),
    moves,
    summary,
  }
})

ipcMain.handle('desktop-hud:execute-organize', async (_event, assignments) => {
  const moves = buildMovePlan(assignments)
  const organizeRoot = resolveOrganizeRoot()

  await mkdir(organizeRoot, { recursive: true })

  const completed = []
  const skipped = []

  for (const move of moves) {
    try {
      await mkdir(move.targetDirectory, { recursive: true })
      await rename(move.sourcePath, move.targetPath)
      completed.push(move)
    } catch (error) {
      skipped.push({
        ...move,
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return {
    ok: skipped.length === 0,
    organizeRoot,
    completed,
    skipped,
  }
})

ipcMain.handle('desktop-hud:set-window-presentation', async (_event, input) => {
  applyWindowPresentation(input)
  broadcastPresentationState()
  return {
    desktopIconsManaged: presentationState.hideSystemDesktopIcons,
  }
})

ipcMain.handle('desktop-hud:get-desktop-icons-visibility', async () => getDesktopIconsVisible())

ipcMain.handle('desktop-hud:set-desktop-icons-visibility', async (_event, visible) => {
  return setDesktopIconsVisible(Boolean(visible))
})

ipcMain.handle('desktop-hud:get-launch-at-startup', async () => getLaunchAtStartupStatus())

ipcMain.handle('desktop-hud:set-launch-at-startup', async (_event, enabled) => {
  return setLaunchAtStartupEnabled(Boolean(enabled))
})

ipcMain.handle('desktop-hud:list-running-windows', async () => listRunningWindows())

ipcMain.handle('desktop-hud:set-external-window-topmost', async (_event, handle, topmost) => {
  return setExternalWindowTopmost(handle, Boolean(topmost))
})

ipcMain.handle('desktop-hud:get-deepseek-settings', async () => {
  const apiKey = await loadDeepSeekApiKey()
  return { ok: true, hasApiKey: apiKey.length > 0 }
})

ipcMain.handle('desktop-hud:save-deepseek-api-key', async (_event, apiKey) => {
  return saveDeepSeekApiKey(apiKey)
})

ipcMain.handle('desktop-hud:summarize-hope-list', async (_event, items) => {
  return summarizeHopeListWithDeepSeek(items)
})

ipcMain.handle('desktop-hud:translate-text', async (_event, input) => {
  return translateTextWithDeepSeek(input)
})

app.whenReady().then(async () => {
  await loadPresentationState()
  createWindow()
  createTray()

  globalShortcut.register('CommandOrControl+Shift+Space', () => {
    presentationState = {
      ...presentationState,
      hudHidden: !presentationState.hudHidden,
    }
    applyWindowPresentation(presentationState)
    broadcastPresentationState()
  })

  globalShortcut.register('CommandOrControl+Shift+Q', () => {
    app.quit()
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})
