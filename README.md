# 剪贴板 · Clipboard

> Windows 本地剪贴板工具——托盘常驻、Alt+V 呼出浮动面板，展示剪贴板历史与常用语，支持搜索与主题切换。

## 特性

- **堆叠式卡片浏览**：剪贴板内容像手机后台卡片一样堆叠展示，滚轮/方向键翻动，一键粘贴
- **常用语**：常用文本片段独立管理，支持新建、修改、删除、拖拽排序
- **实时搜索**：点击搜索按钮展开成搜索栏，实时过滤剪贴板历史（仅文本，子串匹配）
- **图片支持**：图片复制后存缩略图预览 + 原图/路径用于粘贴（文件型图片还原 HDROP）
- **两套主题**：默认跟随系统，可手动切换浅色/深色，带圆形扩散过渡动画
- **极简扁平 + 微动效**：Framer Motion 物理弹簧动效，层次靠缩放/偏移/投影而非透明度
- **去重与自动淘汰**：相同内容提到栈顶不重复；保留最近 50 条（可配置），超出自动移除最旧

## 技术栈

| 层级 | 技术 |
|---|---|
| 桌面壳 | [Tauri 2](https://v2.tauri.app) + Rust |
| 前端 | React 19 + TypeScript + Vite |
| 动效 | Framer Motion |
| 字体 | IBM Plex Sans / Mono / SC（碳素副本记号）|
| 配色 | 墨与纸（双主题，ballpoint ink 强调色）|

## 环境准备

1. **Node.js** ≥ 20（已装）
2. **Rust** — [rustup.rs](https://rustup.rs)，选 `x86_64-pc-windows-msvc`
3. **VS 2022 Build Tools** — 勾选「使用 C++ 的桌面开发」
4. **WebView2** — Win10 19045+ 已自带

> ⚠️ 国内网络：`~/.cargo/config.toml` 建议配置 USTC 镜像：
> ```
> [source.crates-io]
> replace-with = "ustc"
> [source.ustc]
> registry = "sparse+https://mirrors.ustc.edu.cn/crates.io-index/"
> ```

## 快速开始

```bash
cd app

# 安装前端依赖
npm install

# 前端开发（仅浏览器，不启动窗口）
npm run dev

# 完整 Tauri 开发（vite + Rust 编译 + 窗口）
npm run tauri dev
```

浏览器访问 `http://localhost:1420` 可迭代前端视觉；Tauri 启动后按 **Alt+V** 呼出面板。

## 项目结构

```
app/
├── src/                  # 前端 React
│   ├── components/       # Panel / TopBar / Card / CardStack / SearchView
│   ├── lib/              # useTheme / types
│   ├── data/             # mock.ts（当前 mock 数据）
│   ├── styles/           # tokens(配色/字号) / base(重置/主题动画) / panel(面板/卡片/搜索)
│   └── App.tsx           # 顶层状态机（导航/粘贴/键盘）
├── src-tauri/            # Rust 后端
│   ├── src/lib.rs        # 单实例 / 全局热键 Alt+V / 托盘 / toggle_panel
│   ├── tauri.conf.json   # 无边框透明窗口 / bundle 配置
│   └── capabilities/     # 窗口 / 事件权限
├── docs/                 # 设计文档（灵感.md / 设计决策.md）
├── public/               # 图标
├── package.json
└── CLAUDE.md             # AI 辅助开发指南
```

## 交互操作

| 按键 | 操作 |
|---|---|
| Alt+V | 呼出/隐藏面板 |
| ↓ / ↑ 或 滚轮 | 翻动堆叠卡片 |
| Enter / 左键点击 | 粘贴当前卡片（剪贴板自动置顶） |
| Tab | 切换 剪贴板 / 常用语 |
| Alt+C / 点搜索图标 | 展开搜索栏 |
| Esc | 关搜索 / 关面板 |
| 主题按钮 | 切换 light/dark（圆形扩散）|

## 设计源真值

产品决策以 **[docs/设计决策.md](docs/设计决策.md)** 为准（由 `/grill-me` 访谈敲定）。原始灵感见 [docs/灵感.md](docs/灵感.md)。

## 当前状态

- ✅ 已完成：面板壳、托盘、热键、主题动画、堆叠+搜索前端（mock 数据）
- 🚧 进行中：真剪贴板后端（监听 / SQLite / 去重 / 图片落盘 / 粘贴回切）
- ⏳ 待铺：常用语网格排序模式、独立设置窗口