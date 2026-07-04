import { getCurrentWindow, LogicalSize, PhysicalPosition } from "@tauri-apps/api/window";

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

// 当前动画的取消令牌：每次启动新动画递增，旧动画的 tick 检查到自己被取消则停止。
// 避免快速连续切换时多个 rAF 动画打架（setSize 互相覆盖）。
let currentAnimId = 0;

/** 取消任何正在进行的窗口尺寸动画（供外部在需要时主动取消） */
export function cancelPanelAnim(): void {
  currentAnimId++;
}

/**
 * 设置新尺寸并调整位置使右下角固定。
 * 面板默认贴屏幕右下角，宽度变化时往左扩展，高度变化时往上收缩。
 * 全部用物理像素计算，避免物理/逻辑转换精度丢失。
 * 瞬时操作也会取消进行中的动画，避免动画下一帧覆盖刚设的值。
 */
export async function resizeWithBottomFixed(logicalW: number, logicalH: number): Promise<void> {
  currentAnimId++;
  const win = getCurrentWindow();
  const pos = await win.outerPosition();
  const size = await win.outerSize();
  const rightPx = pos.x + size.width;
  const bottomPx = pos.y + size.height;
  await win.setSize(new LogicalSize(logicalW, logicalH));
  // 等待 resize 生效后再设位置，避免竞争
  const newSize = await win.outerSize();
  await win.setPosition(new PhysicalPosition(rightPx - newSize.width, bottomPx - newSize.height));
}

/**
 * 动画化窗口高度，保持底部固定（宽度固定 380）。
 * 可中断：若启动时已有动画进行中，旧动画的 tick 自行停止。
 */
export async function animatePanelHeight(toH: number, durationMs = 260): Promise<void> {
  const myId = ++currentAnimId;
  const win = getCurrentWindow();
  const pos = await win.outerPosition();
  const size = await win.outerSize();
  const bottomPx = pos.y + size.height;
  const factor = await win.scaleFactor();
  const fromH = size.height / factor;
  if (Math.abs(fromH - toH) < 1) return;

  const start = performance.now();
  return new Promise((resolve) => {
    function tick(now: number) {
      // 被新动画取消：直接 resolve，不再 setSize（让新动画接管）
      if (myId !== currentAnimId) { resolve(); return; }
      const t = Math.min(1, (now - start) / durationMs);
      const logicalH = fromH + (toH - fromH) * easeOut(t);
      win.setSize(new LogicalSize(380, logicalH));
      win.outerSize().then((s) => {
        if (myId !== currentAnimId) return; // 异步回调里再检查一次
        win.setPosition(new PhysicalPosition(pos.x, bottomPx - s.height));
      });
      if (t < 1) {
        requestAnimationFrame(tick);
      } else {
        resolve();
      }
    }
    requestAnimationFrame(tick);
  });
}

/**
 * 动画化窗口宽高，保持右下角固定（宽度变化时往左扩展，高度变化时往上收缩）。
 * 用 easeOut 曲线，和 animatePanelHeight 视觉语言一致。
 * 可中断：若启动时已有动画进行中，旧动画的 tick 自行停止。
 */
export async function animatePanelSize(toW: number, toH: number, durationMs = 260): Promise<void> {
  const myId = ++currentAnimId;
  const win = getCurrentWindow();
  const pos = await win.outerPosition();
  const size = await win.outerSize();
  const factor = await win.scaleFactor();
  const rightPx = pos.x + size.width;
  const bottomPx = pos.y + size.height;
  const fromW = size.width / factor;
  const fromH = size.height / factor;
  if (Math.abs(fromW - toW) < 1 && Math.abs(fromH - toH) < 1) return;

  const start = performance.now();
  return new Promise((resolve) => {
    function tick(now: number) {
      if (myId !== currentAnimId) { resolve(); return; }
      const t = Math.min(1, (now - start) / durationMs);
      const e = easeOut(t);
      const w = fromW + (toW - fromW) * e;
      const h = fromH + (toH - fromH) * e;
      win.setSize(new LogicalSize(w, h));
      win.outerSize().then((s) => {
        if (myId !== currentAnimId) return;
        win.setPosition(new PhysicalPosition(rightPx - s.width, bottomPx - s.height));
      });
      if (t < 1) {
        requestAnimationFrame(tick);
      } else {
        resolve();
      }
    }
    requestAnimationFrame(tick);
  });
}
