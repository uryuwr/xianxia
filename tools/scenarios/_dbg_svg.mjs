export default async function (page, c) {
  await page.waitForFunction(() => window.__game && __game.run && __game.run.state === "play", null, { timeout: 120000 });
  await c.wait(800);
  await page.keyboard.press("Tab");
  await c.wait(600);
  console.log(await c.ev(() => {
    const ps = [...document.querySelectorAll("svg path, svg circle")];
    const by = new Map();
    for (const p of ps) { let s = p.closest("svg"), k = (s.id || "") + "." + (s.getAttribute("class") || "") + " <" + (s.parentElement && (s.parentElement.id || s.parentElement.className)) + ">"; by.set(k, (by.get(k) || 0) + 1); }
    return JSON.stringify([...by.entries()]);
  }));
}
