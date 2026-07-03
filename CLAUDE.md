# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

Windows 本地剪贴板工具：托盘常驻、Alt+V 呼出无边框浮动面板，展示剪贴板历史（堆叠卡片）与常用语，支持搜索、主题切换。技术栈 Tauri 2 + React 19 + TypeScript + Vite + Framer Motion，Rust 后端 + Web 前端。

## 设计源真值

- **docs/设计决策.md** — 实现的源真值，由 `/grill-me` 访谈敲定的全部产品/技术决策。改任何产品行为前先看它。
- docs/灵感.md — 原始灵感/spec。
- 关键约束：仅纯文本+图片；剪贴板最新在最前、粘贴后置顶；常用语新增放最后、粘贴不重排；点击卡=直接粘贴；卡片 320×120、文本前 3 行省略；搜索仅剪贴板、实时子串；两套主题跟随系统+手动切；性能目标 <100ms 唤起/60FPS/空闲 <80MB。

## 常用命令

所有命令在项目根目录（`app/`）执行：

- `npm run dev` — 仅起 Vite 前端（端口 1420），不启动 Tauri 窗口。纯前端视觉迭代用。
- `npm run tauri dev` — 完整 Tauri 开发：起 vite + 编译 Rust + 开窗口。**会占用 1420 端口**，运行前先停掉独立 `npm run dev`。
- `npm run build` — `tsc && vite build`，前端产物。
- `npm run tauri build` — 生产打包（含 Rust release 编译）。
- `npx tsc --noEmit` — 前端类型检查（不改产物）。
- `cargo build`（在 `src-tauri/`）— 仅编译 Rust 后端，不起窗口，不影响 vite。增量编译 ~30s。

## 架构

**单窗口面板**（`tauri.conf.json` label=`panel`）：无边框、透明、always-on-top、skipTaskbar、默认 `visible:false`。由 Rust 端 `toggle_panel()` 显示/隐藏。

**Rust 后端**（`src-tauri/src/lib.rs`）：
- `tauri-plugin-single-instance` — 第二次启动激活已有实例。
- `tauri-plugin-global-shortcut` — Alt+V 切换面板。
- 系统托盘 — 左键切换面板、右键菜单「退出」。
- `toggle_panel(app)` — show/hide 窗口；显示时 `emit_to("panel", "panel-shown", ())` 通知前端重置到最新卡片。
- Tauri 2 tray 闭包注意：`on_tray_icon_event` 的首参是 `&TrayIcon`，要用 `tray.app_handle()` 取 AppHandle（与 `on_menu_event` 首参是 `&AppHandle` 不同）。

**前端**（`src/`）：
- `App.tsx` — 顶层状态机：pane(剪贴板/常用语)、view(stack/search)、active 索引、主题、键盘导航（↓↑/Enter/Esc/Tab，滚轮经 CardStack onNav）、粘贴（mock：剪贴板置顶、常用语不重排）、监听 `panel-shown` 重置。
- `components/CardStack.tsx` — 堆叠 3 张（front 全显 + 2 peek），滚轮节流 110ms。
- `components/Card.tsx` — 卡片 + 「复写副条」签名（mono 序号·时间·来源）。POS 数组定义 peek 偏移/缩放/层级；**卡片不透明**（opacity 1），层次靠缩放+偏移+投影。
- `components/TopBar.tsx` — 分段 Tab + 搜索展开按钮（仅剪贴板页，motion 宽度动画 28→168）+ 主题切换。
- `lib/theme.ts` — `useTheme`：跟随系统/手动切换，data-theme 属性 + localStorage。
- `styles/tokens.css` — 设计令牌（墨与纸配色，light/dark 两套 CSS 变量）；`base.css` 含 View Transitions 主题圆形扩散动画。
- `data/mock.ts` — **当前是 mock 数据**；`formatTime` 工具函数也在这。

**Capabilities**（`src-tauri/capabilities/default.json`）：`windows:["panel"]`，含 window show/hide/focus + `core:event:default`（前端 listen `panel-shown` 需要）。

## 环境注意事项

- **Rust 工具链**：需 rustup（`x86_64-pc-windows-msvc` target）+ VS 2022 Build Tools（「使用 C++ 的桌面开发」）。两者缺一不可。
- **cargo 不在默认 shell PATH**（安装晚于 shell 会话启动）。命令里加 `export PATH="$HOME/.cargo/bin:$PATH"`，或用全路径 `$HOME/.cargo/bin/cargo.exe`。
- **crates.io 镜像**：`~/.cargo/config.toml` 已配 USTC 镜像（`sparse+https://mirrors.ustc.edu.cn/crates.io-index/`），首次 `cargo build` 索引秒过。**勿覆盖**该文件。
- **Bash 后台化**：`(cmd &)`（`&` 在 `()` 内）能后台存活（如 vite、cargo build）。注意 `cd X && (cmd) &` 中 `&` 在 `&&` 链外会把整条链（含 cd）后台化——后台命令应单独一行，或把 `&` 放进 `()`。
- 首次 `cargo build` 全量编译 ~2min（几百 crate）；增量 ~30s。`tauri dev` 监听 `src-tauri/` 变更自动重编重启。

## 当前实现状态

- **已完成**：基础壳——窗口/托盘/Alt+V/单实例/主题切换动画/堆叠+搜索前端，全部用 mock 数据。
- **未实现**（下一步，对照 docs/设计决策.md）：真剪贴板后端（`AddClipboardFormatListener` 监听、SQLite、blake3 去重、图片原图+预览落盘、HDROP 还原、粘贴时 `AttachThreadInput`+`SetForegroundWindow` 回切 + `SendInput` Ctrl+V）、网格排序模式（常用语 720×480/200×80/3 列 + 拖拽磁力让位）、独立设置窗口。

## 约定

- 用户用中文交流；代码标识符用英文，代码注释用中文。
- 前端纯视觉迭代用 `npm run dev`（浏览器 1420）；涉及 Rust/窗口/托盘/热键才需 `npm run tauri dev`。
- Tauri API 在浏览器（非 Tauri）环境不可用——前端调 `getCurrentWindow()`/`listen()` 等用 `isTauri()`（`@tauri-apps/api/core`）守卫。