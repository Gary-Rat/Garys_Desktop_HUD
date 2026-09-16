# Desktop HUD（桌面助手）

一个常驻型透明桌面 HUD：把「桌面入口、搜索、分组、轻整理、日程、状态」收进一层随时呼出、随时隐去的覆盖层里。

不是传统的桌面整理器——目标是轻量、顺手、不打断，而不是全自动重排你的桌面。

> 当前版本 `0.0.0`，处于个人迭代阶段，Windows 为主要目标平台。

## 功能

- **真实桌面读取**：读取桌面一级项目、图标、类型，并解析 `.lnk` 快捷方式的真实目标路径。
- **分组与搜索**：左侧分组栏（创作 / 开发 / 临时 / 游戏 / 项目 / 下载）+ 独立搜索，主画布只渲染当前分组。
- **应用卡片**：固定尺寸卡片、右键菜单（速览 / 定位 / 固定 / 手动分类）、固定卡可拖动换位并可插入普通卡之间。
- **额外导入路径**：除桌面外可导入自定义文件夹，扫描结果合并进同一套 HUD，路径列表本地持久化。
- **画布分页**：画布区支持翻页按钮与滚轮切页，切换分组或搜索时自动回到第一页。
- **HUD 显示 / 隐藏**：快捷键 `Ctrl+Shift+Space`，隐藏后窗口进入点击穿透，方便继续操作桌面。
- **日程小窗**：`00:00`–`24:00` 全天时间轴 + 24 小时清单视图，支持到时提醒（系统通知 + 提示音）。
- **Hope List**：右下角常驻想法清单，可调用 DeepSeek 把条目整理成计划性提示词。
- **窗口层固定**：从当前运行程序里选窗口，固定到桌面上一层。
- **状态便签板**：本机时间 09:00–12:00 / 14:00–18:00 显示红灯，其余绿灯。

## 技术栈

| 层 | 选型 |
| --- | --- |
| 构建 | Vite 8 + TypeScript 6 |
| 界面 | React 19 + Tailwind CSS 4 |
| 桌面壳 | Electron 42（`electron/main.mjs` + `electron/preload.cjs`） |
| 打包 | electron-builder（portable / NSIS） |
| 渲染特效 | `ogl`（背景 Aurora 着色器） |

主要文件：

- `src/App.tsx` — 主界面与交互状态机
- `src/App.css` — 主样式
- `src/desktopData.ts` — 分组规则与桌面数据整形
- `electron/main.mjs` — 主进程：窗口、桌面读取、IPC、DeepSeek 代理
- `electron/preload.cjs` — 预加载桥
- `src/electron.d.ts` — 类型桥接

## 直接使用（免安装，不需要 Node.js）

到 [Releases](https://github.com/Gary-Rat/Garys_Desktop_HUD/releases) 下载 `Desktop-HUD-<版本>-x64-portable.exe`（Windows x64 免安装版），双击直接运行。

这个 exe 由 GitHub Actions 在 `windows-latest` 上自动构建（`.github/workflows/build-windows.yml`）：推 `v*` tag 会自动出包并挂到 Release，也可以在 Actions 页面手动触发一次。所以换一台电脑不需要装 Node.js / npm，也不用 clone 源码。

## 快速开始（本地开发）

需要 Node.js 与 npm（项目未声明 `engines`，建议 Node 20 以上）。

```bash
npm install

# 浏览器里跑界面（只有 UI，没有桌面能力）
npm run dev:web

# Electron + Vite 热更新（推荐日常开发）
npm run dev:desktop

# 先构建再用 Electron 启动
npm run start:desktop
```

## 打包（Windows）

```bash
npm run dist:win            # 快捷方式，等同 dist:win:portable
npm run dist:win:portable   # 免安装 portable
npm run dist:win:installer  # NSIS 安装包
npm run pack:win            # 只出未打包目录（--dir）
```

产物输出到 `release/`（已在 `.gitignore` 中忽略）。

## 本地数据与密钥

- 界面偏好（分组布局、固定项、导入路径、日程、Hope List 等）保存在渲染进程的 `localStorage`，键前缀 `desktop-hud:`。
- **DeepSeek API Key 不进入前端存储**：由主进程写入 Electron `userData/deepseek-settings.json`，请求也由主进程代理转发。仓库内不包含任何密钥。

## 权限与安全说明

这个应用本身就要操作桌面，因此主进程会用到以下能力，使用前请知悉：

- `shell.openPath` / `shell.showItemInFolder`：打开与定位桌面条目，路径来自 HUD 自身扫描结果或用户手动导入。
- `powershell.exe`：枚举可见窗口、设置窗口置顶（`SetWindowPos`）、切换桌面图标显示。
- 网络请求：仅在启用 Hope List 计划生成 / 翻译时，由主进程请求 `https://api.deepseek.com`。

窗口已启用 `contextIsolation: true`、`nodeIntegration: false`，渲染进程通过 `preload.cjs` 暴露的有限 IPC 方法与主进程通信。

## 已知限制

- 仅针对 Windows 调优，未在 macOS / Linux 上验证。
- 换行符统一为 LF（`*.cmd` 除外，见 `.gitattributes`）。
- 界面背景图使用 Unsplash 外链，离线或该资源失效时背景不显示。

## License

[MIT](LICENSE)
