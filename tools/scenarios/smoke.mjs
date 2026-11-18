// 冒烟测试：启动后截一张图
export default async function (page, c) {
  await c.wait(1500);
  await c.shot("main");
}
