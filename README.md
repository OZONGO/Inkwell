# 剪贴板 · Clipboard

Windows 上的一个本地剪贴板小工具。托盘常驻，按 Alt+V 呼出一个浮动面板，展示剪贴板历史跟常用语，支持搜索。

- 剪贴板内容像卡片一样堆叠着，滚轮或方向键翻动，点一下或者按 Enter 就直接粘贴
- 常用语单独管理，可以新建、修改、删除，还能拖拽排序
- 顶部有搜索按钮，点开变成搜索栏，实时过滤剪贴板历史（只搜文本）
- 图片也能存，复制后存一份缩略图预览 + 原图路径用于粘贴，文件型的图片还原成 HDROP
- 两套主题，默认跟系统走，也可以手动切浅色/深色
- 设置窗口：保持条数、强调色、开机自启；主题跟面板走。面板右下角齿轮或托盘右键打开

图片粘贴分两种情况：文件型（资源管理器复制的那种）走 CF_HDROP，截图型走 CF_DIB。

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
| Tab | 切换 剪贴板/常用语 |
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

