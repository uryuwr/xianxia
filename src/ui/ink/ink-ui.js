// 墨途 · 水墨 UI 套件 ink-ui.js（可选的小助手，零依赖）
// 1) 给 .ink-paper / .ink-tip 自动补一层 .ink-sheet（纸张与阴影层，阴影才能顺着毛边）
// 2) 注入共享 SVG 滤镜（#ink-rough 让文字/线条边缘略毛；#ink-bleed 墨晕开）
// 3) inkui.decorate(root) 可在动态生成的界面上重复调用
(function () {
  const DEFS = `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
  <filter id="ink-rough" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="3"/><feDisplacementMap in="SourceGraphic" scale="2.2"/></filter>
  <filter id="ink-bleed" x="-20%" y="-20%" width="140%" height="140%"><feTurbulence type="fractalNoise" baseFrequency=".05" numOctaves="3" seed="7"/><feDisplacementMap in="SourceGraphic" scale="9"/><feGaussianBlur stdDeviation=".6"/></filter>
  </defs></svg>`;
  function decorate(root = document) {
    for (const el of root.querySelectorAll(".ink-paper, .ink-tip")) {
      if (!el.querySelector(":scope > .ink-sheet")) el.insertAdjacentHTML("afterbegin", '<i class="ink-sheet" aria-hidden="true"></i>');
    }
  }
  function init() {
    if (!document.getElementById("ink-rough")) document.body.insertAdjacentHTML("afterbegin", DEFS);
    decorate();
  }
  window.inkui = { decorate, init };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
