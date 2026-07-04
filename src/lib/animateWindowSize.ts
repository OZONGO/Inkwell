import { getCurrentWindow, LogicalSize, PhysicalPosition } from "@tauri-apps/api/window";

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * 设置新尺寸并调整位置使右下角固定。
 * 面板默认贴屏幕右下角，宽度变化时往左扩展，高度变化时往上收缩。
 * 全部用物理像素计算，避免物理/逻辑转换精度丢失。
 */
export async function resizeWithBottomFixed(logicalW: number, logicalH: number): Promise<void> {
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

export async function animatePanelHeight(toH: number, durationMs = 260): Promise<void> {
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
      const t = Math.min(1, (now - start) / durationMs);
      const logicalH = fromH + (toH - fromH) * easeOut(t);
      win.setSize(new LogicalSize(380, logicalH));
      win.outerSize().then((s) => {
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

export async function animatePanelSize(toW: number, toH: number, durationMs = 260): Promise<void> {
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
      const t = Math.min(1, (now - start) / durationMs);
      const e = easeOut(t);
      const w = fromW + (toW - fromW) * e;
      const h = fromH + (toH - fromH) * e;
      win.setSize(new LogicalSize(w, h));
      win.outerSize().then((s) => {
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
