# 剪贴板 · Clipboard

Windows 上的一个本地剪贴板小工具。托盘常驻，按 Alt+V 呼出一个浮动面板，展示剪贴板历史跟常用语，支持搜索和主题切换。

## 长什么样

面板大概这么个意思：

- 剪贴板内容像手机后台卡片一样堆叠着，滚轮或方向键翻动，点一下或者按 Enter 就直接粘贴
- 常用语单独管理，可以新建、修改、删除，还能拖拽排序
- 顶部有搜索按钮，点开变成搜索栏，实时过滤剪贴板历史（只搜文本，子串匹配）
- 图片也能存，复制后存一份缩略图预览 + 原图路径用于粘贴，文件型的图片还原成 HDROP
- 两套主题，默认跟系统走，也可以手动切浅色/深色，切换时带个圆形扩散动画
- 动效方面用了 Framer Motion，物理弹簧那种手感，层次靠缩放和偏移来体现，没用透明度

## 粘贴到底怎么工作的

这是最折腾的部分：

1. 面板打开的时候后台线程一直在记录"当前用户到底在哪个窗口打字"
2. 你点粘贴 → 面板先隐藏，让系统把前台还给原来的窗口
3. 轮询等那个窗口成为前台，最多等 200ms
4. 如果没等到，用 `AttachThreadInput` 附加到当前前台线程拿权限，再 `SetForegroundWindow` 硬设
5. 最后 `SendInput` 模拟 Ctrl+V

Shift + Enter 粘贴的话面板不关，可以连续贴。

图片粘贴分两种情况：文件型（资源管理器复制的那种）走 CF_HDROP，截图型走 CF_DIB。

## 后端干了啥

- 剪贴板监听不走轮询，用的 `AddClipboardFormatListener`，事件驱动
- 监听到变化先读文本，非空就去重后写 SQLite，相同内容提到栈顶
- 文本不行就试 CF_DIB 图片，blake3 哈希去重，原图存 PNG，缩略图 256px JPEG
- 保留最近 N 条（默认 50，可配），超出自动淘汰最旧
- 自粘贴抑制：自己贴的内容 500ms 内不会被再监听到

## 技术栈

- 桌面壳：Tauri 2 + Rust
- 前端：React 19 + TypeScript + Vite
- 动效：Framer Motion
- 字体：IBM Plex Sans / Mono / SC
- 配色：墨与纸双主题
- 数据：SQLite（rusqlite bundled）
- 图片：image crate + blake3

## 跑起来

```bash
cd app
npm install
npm run tauri dev
```

环境要求：Node.js ≥ 20、Rust（msvc 工具链）、VS 2022 Build Tools（C++ 桌面开发）、WebView2（Win10 19045+ 自带）。

## 快捷键

| 按键 | 作用 |
|---|---|
| Alt+V | 开/关面板 |
| ↑/↓ 或滚轮 | 翻卡片 |
| Enter / 左键 | 粘贴当前卡片 |
| Shift+Enter | 粘贴但不关面板 |
| Tab | 切 剪贴板/常用语 |
| Alt+C | 展开搜索 |
| Esc | 关搜索 / 关面板 |

## 项目结构

```
app/
├── src/                   # React 前端
│   ├── components/        # 各种组件
│   ├── lib/               # 主题 / IPC / 类型 / 动效
│   ├── data/              # mock 数据和工具函数
│   ├── styles/            # CSS
│   └── App.tsx            # 主状态机
├── src-tauri/             # Rust 后端
│   ├── src/
│   │   ├── lib.rs                # 入口：托盘、热键、初始化
│   │   ├── clipboard_listener.rs # 剪贴板监听
│   │   ├── db.rs                 # SQLite 读写
│   │   ├── image_store.rs        # 图片处理
│   │   ├── paste.rs              # 粘贴回切逻辑
│   │   ├── foreground_tracker.rs # 前台窗口追踪
│   │   ├── commands.rs           # IPC 命令
│   │   └── settings.rs           # 设置读写
│   └── tauri.conf.json
└── docs/                  # 设计文档
```

## 当前完成度

该有的基本都有了：托盘、热键、剪贴板监听、图片支持、常用语、搜索、双主题、设置窗口、开机自启、单实例。单元测试前后端加起来 31 个。

还有一些想加的东西没加进去：托盘自定义菜单、剪贴板白名单过滤。再说吧。