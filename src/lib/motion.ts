// 共享动画常量 —— 让所有组件说同一种"运动语言"。
// 设计隐喻：碳素复写纸条。弹簧用于有物理含义的动作（卡片操作），
// 缓动曲线用于 UI 状态切换（hover、展开）。

// ---- 缓动曲线 ----
// 主力曲线：快起慢停，自然减速
export const easeOut = [0.22, 0.61, 0.36, 1] as const;
// 进入曲线：略带过冲，像纸条轻轻落位
export const easeEnter = [0.34, 1.15, 0.64, 1] as const;
// 退出曲线：比进入更平，不抢注意力
export const easeExit = [0.4, 0, 1, 1] as const;

// ---- 弹簧 ----
// 卡片堆叠：硬朗、低弹，像卡片柜翻动
export const springCard = {
  type: "spring" as const,
  stiffness: 440,
  damping: 36,
  mass: 0.7,
};

// 网格炸开/重排：略软，带惯性
export const springGrid = {
  type: "spring" as const,
  stiffness: 380,
  damping: 30,
  mass: 0.8,
};

// 拖拽回弹：弹性强，松手有"啪"的回位感
export const springSnap = {
  type: "spring" as const,
  stiffness: 600,
  damping: 28,
  mass: 0.6,
};

// UI 小元素（指示器、分段按钮）：快而脆
export const springUI = {
  type: "spring" as const,
  stiffness: 500,
  damping: 34,
  mass: 0.5,
};

// ---- 时长 ----
export const durFast = 0.12;
export const durBase = 0.18;
export const durSlow = 0.26;

// ---- Framer Motion 变体 ----

// 列表项错峰进入：每项延迟 15ms，最多 0.2s 封顶
export function staggerChildren(_maxItems = 20) {
  return {
    hidden: {},
    show: {
      transition: {
        staggerChildren: 0.015,
        delayChildren: 0.02,
      },
    },
    exit: {},
  };
}

// 右键菜单项错峰：比列表更密的一沓"翻纸条"节奏
export function menuStagger() {
  return {
    hidden: {},
    show: {
      transition: { staggerChildren: 0.03, delayChildren: 0.04 },
    },
  };
}

// 菜单项落位：向上轻推 + 淡入，比 itemFadeUp 更克制（不抢菜单整体的 scale-in）
export const menuItem = {
  hidden: { opacity: 0, y: 4 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: durFast, ease: easeOut },
  },
};

export const itemFadeUp = {
  hidden: { opacity: 0, y: 6 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: durFast, ease: easeOut },
  },
  exit: {
    opacity: 0,
    y: 4,
    transition: { duration: 0.08, ease: easeExit },
  },
};

// 弹窗/浮层进出
export const overlayPop = {
  initial: { opacity: 0, scale: 0.92, y: 8 },
  animate: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { duration: durBase, ease: easeEnter },
  },
  exit: {
    opacity: 0,
    scale: 0.95,
    y: 6,
    transition: { duration: durFast, ease: easeExit },
  },
};

// pane 切换：内容侧向"抽屉式"换页。方向与顶部 Segmented 指示器一致——
// 指示器向右滑（→常用语）时，旧内容向左滑出、新内容从右滑入；反方向镜像。
// custom 传入方向：+1 表示向右翻（进常用语），-1 表示向左翻（回剪贴板）。
export const paneSlide = {
  enter: (dir: number) => ({
    initial: { opacity: 0, x: 24 * dir, scale: 0.98 },
    animate: {
      opacity: 1,
      x: 0,
      scale: 1,
      transition: { duration: durBase, ease: easeEnter },
    },
    exit: {
      opacity: 0,
      x: -24 * dir,
      scale: 0.98,
      transition: { duration: durFast, ease: easeExit },
    },
  }),
};

// footer 计数/状态文字滚动：用 key 切换触发交叉淡入，避免数字硬跳。
// 旧文字向上离场、新文字从下方进入，durFast。
export const footerRoll = {
  initial: (dir: number) => ({ opacity: 0, y: 8 * dir }),
  animate: { opacity: 1, y: 0, transition: { duration: durFast, ease: easeOut } },
  exit: (dir: number) => ({
    opacity: 0,
    y: -8 * dir,
    transition: { duration: durFast, ease: easeExit },
  }),
};

// 按压反馈
export const whileTap = { scale: 0.9 };
export const whileHover = { scale: 1.05 };
