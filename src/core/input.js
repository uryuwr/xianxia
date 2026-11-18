// 输入：键盘、鼠标按键、鼠标在地面上的世界坐标（斜俯视下用于朝向与瞄准）。
// 用法：input.down("KeyW")、input.pressed("Space")（本帧刚按下）、input.mouse.left / right、input.aim（Vector3，地面落点）
import * as THREE from "three";

export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this._pressed = new Set();
    this.mouse = { x: 0, y: 0, ndc: new THREE.Vector2(), left: !1, right: !1, middle: !1, leftPressed: !1, rightPressed: !1, wheel: 0 };
    this.aim = new THREE.Vector3();
    this._ray = new THREE.Raycaster();
    this._plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    addEventListener("keydown", (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this._pressed.add(e.code);
      if (["Space", "Tab"].includes(e.code)) e.preventDefault();
    });
    addEventListener("keyup", (e) => this.keys.delete(e.code));
    addEventListener("blur", () => this.keys.clear());
    // 右键是游戏按键：整页屏蔽右键菜单；浏览器的"鼠标手势"（按住右键左右划 = 后退 / 前进）无法从网页关闭，
    // 所以再加一个历史记录陷阱：手势触发后退时立刻回到游戏页面，不会离开游戏
    addEventListener("contextmenu", (e) => e.preventDefault(), { capture: !0 });
    addEventListener("mousedown", (e) => e.button === 2 && e.preventDefault(), { capture: !0 });
    history.pushState({ jxTrap: !0 }, "");
    addEventListener("popstate", () => history.pushState({ jxTrap: !0 }, ""));
    addEventListener("mousemove", (e) => {
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
    });
    addEventListener("mousedown", (e) => {
      if (e.button === 0) (this.mouse.left = !0), (this.mouse.leftPressed = !0);
      if (e.button === 2) (this.mouse.right = !0), (this.mouse.rightPressed = !0);
      if (e.button === 1) this.mouse.middle = !0;
    });
    addEventListener("mouseup", (e) => {
      if (e.button === 0) this.mouse.left = !1;
      if (e.button === 2) this.mouse.right = !1;
      if (e.button === 1) this.mouse.middle = !1;
    });
    addEventListener("wheel", (e) => (this.mouse.wheel += Math.sign(e.deltaY)), { passive: !0 });
  }
  down(code) {
    return this.keys.has(code);
  }
  pressed(code) {
    return this._pressed.has(code);
  }
  // 测试用：模拟按键
  tap(code) {
    this._pressed.add(code);
  }
  // 每帧开始：用镜头把鼠标投射到"玩家所在高度"的水平面上，得到瞄准点
  update(camera, groundY) {
    this.mouse.ndc.set((this.mouse.x / innerWidth) * 2 - 1, -(this.mouse.y / innerHeight) * 2 + 1);
    this._ray.setFromCamera(this.mouse.ndc, camera);
    this._plane.constant = -groundY;
    this._ray.ray.intersectPlane(this._plane, this.aim);
  }
  // 每帧结束：清空"本帧刚按下"
  endFrame() {
    this._pressed.clear();
    this.mouse.leftPressed = this.mouse.rightPressed = !1;
    this.mouse.wheel = 0;
  }
}
