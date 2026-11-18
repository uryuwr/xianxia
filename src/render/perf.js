// 性能工具（渲染侧，纯性能，不改画面与玩法）：
//   keepPrograms(renderer)  着色器程序常驻：特效每次放完就 dispose 材质，若它是某个着色器程序的最后一个使用者，
//                           three 会销毁程序（连同 ShaderMaterial 的着色器阶段缓存），下次同样的特效又要重新编译——
//                           集显上一次编译 50–150ms，就是战斗里周期性的卡顿尖峰。这里给每个程序留一个"保活"材质（不释放），
//                           之后同样的特效直接复用已编译好的程序。保活数量有上限，超出后恢复正常释放。
import * as THREE from "three";

export function keepPrograms(renderer, max = 200) {
  if (THREE.Material.prototype.__keepPrograms) return;
  const props = renderer.properties;
  const keep = new Map(); // program → 保活材质
  const dispose = THREE.Material.prototype.dispose;
  THREE.Material.prototype.dispose = function () {
    const progs = props.get(this).programs;
    if (progs && progs.size && keep.size < max) {
      let pin = !1;
      for (const p of progs.values())
        if (p.usedTimes <= 1 && !keep.has(p)) keep.set(p, this), (pin = !0);
      if (pin) return; // 留作保活：程序与着色器阶段都不释放
    }
    return dispose.call(this);
  };
  THREE.Material.prototype.__keepPrograms = keep;
}
