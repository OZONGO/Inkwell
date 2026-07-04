# 墨与纸 · 设计系统（Ink & Paper）

> 一份跨应用的统一视觉语言规范。本文档同时是本项目「剪贴板」的实现参考，
> 也是未来其他应用的起点：继承这里的配色、动画、字号、间距规则，只按需替换主题色。

---

## 一、设计哲学

**核心隐喻：墨与纸 / 碳素复写（Carbon Copy）**

视觉语言取材于真实世界的书写与纸质文档：

| 隐喻 | 映射 | 为什么 |
|---|---|---|
| 墨水（Ink） | 前景色：文字、图标 | 信息由"墨"书写，清晰、沉着 |
| 纸张（Paper） | 背景色、底板 | 代码/文字的"物理载体" |
| 复写纸条（Carbon Slip） | 剪贴板卡片 | 抄副本的小纸条，编号+内容+时间戳 |
| 圆珠笔头（Ballpoint Ink） | 强调色 | 蓝色圆珠笔作为交互焦点，不张扬但不可忽视 |
| 物理堆叠 | 卡片堆叠动画 | 纸条在桌上自然堆叠，翻动、放置有重量感 |

**设计原则：**
- **锋利克制**——每页只有一个签名元素，其余保持安静
- **物理直觉**——动效用弹簧模拟真实重量，不为动画而动画
- **同一种墨**——所有应用用同一套字号/间距/动画曲线，替换主题即可
- **尊重系统**——跟随系统深色/浅色，遵循 prefers-reduced-motion

---

## 二、色彩系统

### 2.1 核心色板

每个主题定义 8 个语义色变量，定义在 `tokens.css` 的 `:root` 下。

| CSS 变量 | 浅色 `[data-theme="light"]` | 深色 `[data-theme="dark"]` | 用途 |
|---|---|---|---|
| `--paper` | `#f8f8f6` 暖白纸 | `#15161b` 深灰蓝 | 最底层背景 |
| `--ink` | `#1c1c22` 近黑 | `#eceae4` 暖白 | 正文/图标 |
| `--graphite` | `#6e6e78` 中灰 | `#8c8c96` 中灰 | 辅助文字、图标次要态 |
| `--hairline` | `#e7e5df` 淡灰 | `#2a2c33` 深灰 | 边框、分割线 |
| `--accent` | `#2e5c8a` 蓝 | `#7fb3d6` 浅蓝 | 交互高亮、强调 |
| `--accent-soft` | `#e3ecf4` 淡蓝 | `#1f2d3a` 暗蓝 | 高亮背景 |
| `--card` | `#ffffff` 纯白 | `#1d1f25` 深色卡片 | 卡片/面板/弹窗背景 |
| `--backdrop` | `rgba(28,28,34,0.04)` | `rgba(0,0,0,0.30)` | 遮罩层 |

### 2.2 阴影

| 变量 | 浅色 | 深色 |
|---|---|---|
| `--shadow` | `0 1px 2px rgba(28,28,34,0.06), 0 8px 24px rgba(28,28,34,0.10)` | `0 1px 2px rgba(0,0,0,0.40), 0 8px 24px rgba(0,0,0,0.50)` |
| `--shadow-lift` | `0 2px 6px rgba(28,28,34,0.10), 0 18px 44px rgba(28,28,34,0.16)` | `0 2px 6px rgba(0,0,0,0.50), 0 18px 44px rgba(0,0,0,0.62)` |

`--shadow` 用于普通卡片，`--shadow-lift` 用于浮起态（当前卡片、右键菜单、toast）。

### 2.3 强调色变体

通过 `data-accent` 属性覆盖 `--accent` / `--accent-soft`，默认蓝色。预设变体在 `tokens.css`：

| data-accent | 浅色 accent | 深色 accent | 氛围 |
|---|---|---|---|
| `"green"` | `#2e7d4f` | `#5fae7a` | 自然、确认 |
| `"orple"` | `#6b4c8a` | `#a78bc4` | 创意、个性 |
| `"red"` | `#a83a3a` | `#d27474` | 危险、注意 |

新应用只需在 CSS 中补充新的 `data-accent` 值即可扩展。

### 2.4 主题切换动画

使用 **View Transitions API** 圆形扩散过渡：

```css
/* base.css */
::view-transition-old(root) {
  animation: 120ms var(--ease-out) both fade-out;
}
::view-transition-new(root) {
  mask: circle(0% at var(--reveal-x) var(--reveal-y));
  animation: 300ms var(--ease-out) both reveal-mask;
}
```

点击主题按钮时，从按钮位置（`--reveal-x/y`）开始圆形展开。`prefers-reduced-motion: reduce` 时回退到直接切换。

---

## 三、排版

| 变量 | 值 | 角色 |
|---|---|---|
| `--font-sans` | `"IBM Plex Sans", "IBM Plex Sans SC", system-ui, sans-serif` | 正文、UI 文字 |
| `--font-mono` | `"IBM Plex Mono", ui-monospace, "SFMono-Regular", monospace` | 编号、时间戳、代码、提示 |

**字距**：所有信息性文本（编号、时间戳、提示）固定 `letter-spacing: 0.02em`。

**字号层级**（无 CSS 变量，直接在实际上下文定义）：
- 编号/时间戳：`10.5px` —— `.card-slip`、`.panel-footer`
- UI 标签：`12px` —— 分段按钮、网格标题、输入框 placeholder
- 按钮：`12.5px` —— 上下文菜单、弹窗按钮
- 卡片正文：`13px` —— `.card-text`、`.phrase-grid-text`
- 弹窗标题：`13px font-weight: 500`

---

## 四、间距与尺寸

### 4.1 间距令牌

| 变量 | 值 | 场景 |
|---|---|---|
| `--sp-1` | 4px | 极小间隙 |
| `--sp-2` | 8px | 按钮内边距、分割间隙 |
| `--sp-3` | 12px | 面板内边距、卡片内容间隙 |
| `--sp-4` | 16px | 弹窗内边距、大间距 |
| `--sp-5` | 24px | 搜索无结果留白 |
| `--sp-6` | 32px | 大块留白 |

### 4.2 圆角

| 变量 | 值 | 角色 |
|---|---|---|
| `--r-card` | 12px | 卡片、弹窗、右键菜单 |
| `--r-panel` | 14px | 最外层面板（比卡稍大） |
| `--r-pill` | 999px | 按钮、分段控制器、标签 |

### 4.3 卡片尺寸

| 变量 | 值 |
|---|---|
| `--card-w` | 320px |
| `--card-h` | 120px |

### 4.4 面板默认尺寸

| 窗口 | 尺寸 | 放大态 |
|---|---|---|
| 主面板（panel） | 380×320 | 网格排序时 720×480 |
| 设置窗口（settings） | 480×640 | — |

---

## 五、动画系统

> 所有动画常量统一在 `lib/motion.ts`。新应用继承此文件，只按需修改弹簧参数。

### 5.1 缓动曲线

| 常量 | 贝塞尔 | 感官 | 用途 |
|---|---|---|---|
| `easeOut` | `cubic-bezier(0.22, 0.61, 0.36, 1)` | 快起慢停，自然减速 | hover、展开、淡入 |
| `easeEnter` | `cubic-bezier(0.34, 1.15, 0.64, 1)` | 带轻微过冲，轻巧落位 | 面板进入、弹窗、toast |
| `easeExit` | `cubic-bezier(0.4, 0, 1, 1)` | 比进入更平，不抢注意力 | 退出动画 |

CSS 等效变量：
```
--ease-out:  cubic-bezier(0.22, 0.61, 0.36, 1)
--ease-enter: cubic-bezier(0.34, 1.15, 0.64, 1)
--ease-exit:  cubic-bezier(0.4, 0, 1, 1)
```

### 5.2 时长

| 常量 | 值 | 用途 |
|---|---|---|
| `durFast` | 0.12s (120ms) | 淡入淡出、搜索输入 |
| `durBase` | 0.18s (180ms) | 面板进入、视图切换、toast |
| `durSlow` | 0.26s (260ms) | 主题切换等 |

CSS 等效：`--dur-fast: 140ms`, `--dur: 180ms`, `--dur-slow: 260ms`。

### 5.3 弹簧

| 常量 | stiffness | damping | mass | 物理感受 | 用途 |
|---|---|---|---|---|---|
| `springCard` | 440 | 36 | 0.7 | 硬朗、低弹 | 卡片堆叠翻动 |
| `springGrid` | 380 | 30 | 0.8 | 略软带惯性 | 网格炸开/重排 layout |
| `springSnap` | 600 | 28 | 0.6 | 强弹性、啪地回位 | 拖拽回弹 |
| `springUI` | 500 | 34 | 0.5 | 快而脆 | 分段指示器滑动 |

### 5.4 Framer Motion 变体

#### `overlayPop` — 浮层/弹窗进出
```js
initial: { opacity: 0, scale: 0.92, y: 8 }
animate: { opacity: 1, scale: 1,   y: 0 }  // easeEnter, durBase
exit:    { opacity: 0, scale: 0.95, y: 6 }  // easeExit, durFast
```
适用于：右键菜单、弹窗。

#### `staggerChildren` + `itemFadeUp` — 列表错峰
```js
staggerChildren: staggerChildren(step=0.015, delayChildren=0.02)
itemFadeUp: {
  hidden: { opacity: 0, y: 6 }
  show:   { opacity: 1, y: 0 }  // durFast, easeOut
  exit:   { opacity: 0, y: 4 }  // 0.08s, easeExit
}
```
适用于：搜索结果行。

#### `whileTap` — 按压反馈
```js
{ scale: 0.9 }  // 图标按钮
{ scale: 0.97 } // 当前卡片
{ scale: 0.98 } // 搜索结果行
```
CSS 等效：`--press-scale: 0.92`。所有交互元素都有按下反馈。

---

## 六、组件动画规格

### 6.1 卡片堆叠（签名元素）

卡片绝对定位在面板底部中心，三张堆叠（前、中、后），位置通过 `POS` 数组定义：

```js
POS = [
  { y: 0,   scale: 1,    opacity: 1, z: 30, rotate: 0   },  // 前（当前）
  { y: -36, scale: 0.975, opacity: 1, z: 20, rotate: -1  },  // 中窥
  { y: -52, scale: 0.95,  opacity: 1, z: 10, rotate: 0.8 },  // 后窥
]
```

- **弹簧**：`springCard`（stiffness 440, damping 36, mass 0.7）
- **进入**：`{ y: -44, scale: 0.9, opacity: 0 }` → animate
- **退出**：`{ y: 40, scale: 1, opacity: 0 }`
- **旋转**：peek 卡 ±1° —— 肉眼几乎察觉不到的"不齐"，模拟散落纸条
- **transform-origin**：`50% 100%`（从底部旋转/缩放）

### 6.2 分段切换器（layoutId 滑动）

剪贴板/常用语两个按钮之间的高亮背景用 `layoutId="seg-indicator"` 物理滑动：

- **弹簧**：`springUI`（stiffness 500, damping 34, mass 0.5）
- 高亮背景 `.seg-indicator` 绝对定位填充当前按钮，切换到另一个按钮时 Framer Motion 自动计算位移
- `.seg-btn` 仅控制文字颜色（`--graphite` / `--ink`），背景交由指示器完成

### 6.3 搜索栏展开

展开搜索是典型的**宽度动画 + 内容淡入**组合：

```jsx
<motion.div className="search-expander"
  animate={{ width: searching ? 168 : 28 }}
  transition={{ duration: 0.18, ease: easeOut }}
>
  <SearchIcon />  // 始终可见
  <AnimatePresence>
    {searching && <input initial={{ opacity: 0 }} animate={{ opacity: 1 }} />}
  </AnimatePresence>
</motion.div>
```

搜索图标 28×28 固定位，搜索栏展开到 168px，输入框淡入。关闭时反向。

### 6.4 网格炸开（常用语排序）

从堆叠视图切换到网格排序时：

1. **面板先放大**（720×480，`handleEnterGrid`）
2. **下一帧** `requestAnimationFrame` 再 `setView("grid")`
3. **网格卡片挂载**，每个 `motion.div` 的 `initial` 从堆叠态开始：
   ```js
   initial: { scale: 0.7, opacity: 0, x: 0, y: 0 }
   animate: { scale: 1,   opacity: 1, x: 0, y: 0 }
   ```
4. **错峰延迟**：`delay: min(i * 0.035, 0.25)` —— 靠后的卡片依次飞散
5. **弹簧**：`springSnap`（stiffness 600, damping 28, mass 0.6）
6. 退出时反向收拢并缩小，180ms 后缩回面板

### 6.5 网格拖拽重排

- `motion.div` + `drag` + `dragSnapToOrigin`
- `onDragEnd` 计算目标格子的列/行 → 重排数组 → 乐观更新 UI + 持久化后端
- 卡片弹起时放大 `scale: 1.06`、`boxShadow: --shadow-lift`
- `whileHover: { scale: 1.02 }`
- 回弹用 `dragTransition` 的 `springSnap` 参数

### 6.6 粘贴 Toast

```js
initial: { opacity: 0, y: 8, scale: 0.95 }
animate: { opacity: 1, y: 0, scale: 1 }    // easeEnter, durBase
exit:    { opacity: 0, y: 8, scale: 0.95 }
```

固定定位底部 32px，黑底白字 pill 形状。1.1s 后自动消失。

### 6.7 面板进出

```js
initial: { opacity: 0, y: 12, scale: 0.97 }
animate: { opacity: 1, y: 0,  scale: 1 }   // easeEnter, durBase
exit:    { opacity: 0, y: 8,  scale: 0.98 }
```

面板作为 `AnimatePresence` 的子元素（`key="panel"`），在窗口创建/隐藏时触发动画。

### 6.8 视图切换（AnimatePresence mode="wait"）

panel-body 内三个视图（堆叠/搜索/网格）用 `mode="wait"` 切换：

| 视图 | key | enter | exit |
|---|---|---|---|
| 堆叠 | `"stack"` | `opacity 0→1`, `easeEnter` | `opacity 0, scale 0.94` |
| 搜索 | `"search"` | `opacity 0→1`, `easeOut` | `opacity 0` |
| 网格 | `"grid"` | `opacity 0→1`, `easeEnter` | `opacity 0, scale 0.96` |

### 6.9 弹窗（PhraseEditModal）

- 遮罩 backdrop：`opacity 0→1`，`durFast easeOut`，`backdrop-filter: blur(2px)`
- 弹窗内容：`overlayPop` 变体（scale 0.92→1 + y 8→0）
- 键盘拦截：modal 容器 `onKeyDown stopPropagation` 避免事件冒泡到全局
- 提交：`Ctrl+Enter` 确定，`Esc` 取消

### 6.10 右键菜单（ContextMenu）

- 遮罩 `ctx-backdrop`：`position: fixed; inset: 0`
- 菜单：`overlayPop` 变体，fixed 定位在点击坐标
- 退出：点击遮罩或 Esc

---

## 七、CSS 架构

### 文件组织

```
styles/
  tokens.css   ← 配色、字号、间距、圆角、阴影、强调色变体
  base.css     ← reset、主题动画（CSS View Transitions）
  panel.css    ← 面板所有组件样式（topbar、card、grid、modal、menu）
  settings.css ← 设置窗口专用样式
```

### 命名约定

- 组件根类名：`.panel`、`.topbar`、`.card`、`.modal`
- 子元素连字符：`.card-slip`、`.card-serial`、`.card-body`
- 状态：`data-active="true"`（用 data 属性而非 class）
- 主题：通过 `:root[data-theme="light/dark"]` 切换

### 选择器顺序

```
/* ---- section name ---- */  ← 分隔注释
.组件 { ... }                   ← 根
.组件-子 { ... }                  ← 子元素
.组件:状态 { ... }               ← 伪类/属性选择器
```

---

## 八、迁移到新应用

### 8.1 快速启动模板

新应用复制以下文件后替换主题色：

```
lib/motion.ts        ← 不动，直接复制
styles/tokens.css    ← 替换 --accent / --accent-soft 为你的品牌色
styles/base.css      ← 不动（reset + 主题动画）
```

### 8.2 只换什么

| 元素 | 改法 |
|---|---|
| 品牌色 | `tokens.css` 中替换 `--accent` / `--accent-soft` 的 light/dark 值 |
| 字体 | `tokens.css` 中替换 `--font-sans` / `--font-mono` |
| 卡片圆角 | `tokens.css` 中调整 `--r-card` / `--r-panel` |
| 弹簧软硬 | `lib/motion.ts` 中调整 `springCard` / `springGrid` 的 stiffness/damping |

### 8.3 不换什么（保持一致）

- 间距令牌（`--sp-1` 到 `--sp-6`）
- 缓动曲线（`easeOut` / `easeEnter` / `easeExit`）
- 时长（`durFast` / `durBase` / `durSlow`）
- 圆角层级关系（`--r-card < --r-panel < --r-pill`）
- `overlayPop` / `staggerChildren` / `whileTap` 等变体
- 主题切换动画

### 8.4 新增组件动画的原则

1. **只有一个签名元素**——整个界面最能体现产品性格的动画，其他保持安静
2. **有物理含义才用弹簧**——纸张/卡片/翻动用弹簧；hover/淡入/展开用缓动
3. **所有交互元素都有 whileTap**——用户按下的每个按钮都有按压反馈
4. **统一时长层级**——fast 140ms / base 180ms / slow 260ms，不引入第四档
5. **AnimatePresence 包裹进出**——所有 mount/unmount 的 UI 块都用 AnimatePresence 防止硬跳

---

## 九、动画检查清单

为每个组件检查：
- [ ] 进出有 AnimatePresence
- [ ] 可点击元素有 whileTap 按压反馈
- [ ] 列表有 staggerChildren 错峰
- [ ] hover 有 CSS transition（`--dur-fast var(--ease-out)`）
- [ ] 所有 transition 使用共享曲线/弹簧，不手写 magic number
- [ ] prefers-reduced-motion 有回退（主题切换已做）