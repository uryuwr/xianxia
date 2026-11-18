// 界面 Esc 统一入口（模块 A）。规则见 docs/knowledge/玩法系统/本项目约定.md「Esc 规则」。
//   1) 弹层栈：kit.confirm / prompt、洞府确认框、功法匣弹层、F8 调试、Esc 菜单（暂停 / 设置）打开时 pushEsc(fn)，关闭时调用返回的函数出栈。
//      Esc 只交给栈顶那一层并 stopImmediatePropagation：底下的界面和其它监听都收不到这次 Esc（一次只关一层，不会顺带弹出 Esc 菜单）。
//      pushEsc(fn, { block: true, el })：el = 这一层的根元素，被别处直接移除（换场景、kit.clear）时自动出栈，不会留下"吞键"的死层。
//      block：这一层开着时连其它按键也截住（F1–F12 放行；keyup 不拦，免得松开的 WASD 被当成一直按着）。
//   2) 栈空时：场景用 setEscIdle(fn) 登记"Esc 先问场景"，fn 返回 true 表示已处理（返回上一页 / 呼出 Esc 菜单）；返回 false 交给各界面自己的监听
//      （出行局的储物袋 / 舆图链、洞府设施页、天机镜、搜取窗、瞄准……）。
// 监听在模块加载时挂到 window 捕获阶段，排在所有界面监听之前。
const stack = [];
let idle = null;

addEventListener(
  "keydown",
  (e) => {
    for (let i = stack.length - 1; i >= 0; i--) if (stack[i].el && !stack[i].el.isConnected) stack.splice(i, 1);
    const top = stack[stack.length - 1];
    if (e.code !== "Escape") {
      if (top && top.block && !/^F\d+$/.test(e.code)) e.stopImmediatePropagation();
      return;
    }
    if (top) {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (!e.repeat) top.fn(e);
      return;
    }
    if (idle && !e.repeat && idle(e)) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  },
  !0,
);

export function pushEsc(fn, o = {}) {
  const h = { fn, block: !!o.block, el: o.el || null };
  stack.push(h);
  return () => {
    const i = stack.indexOf(h);
    if (i >= 0) stack.splice(i, 1);
  };
}
export const escDepth = () => stack.length;
export function setEscIdle(fn) {
  idle = fn;
  return () => idle === fn && (idle = null);
}
