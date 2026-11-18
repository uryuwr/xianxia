// Gallery choice is ephemeral: no localStorage, network write, or game save.
const preset = document.getElementById('compare-preset');
const frames = { a: document.getElementById('preview-a'), b: document.getElementById('preview-b') };
const links = { a: document.getElementById('open-a'), b: document.getElementById('open-b') };
const readyFrames = new Set();
preset.addEventListener('change', () => {
  readyFrames.clear();
  window.__ready = false;
  for (const [layout, name] of [['a', 'a_overview.html'], ['b', 'b_folio.html']]) {
    const url = `${name}#preset=${encodeURIComponent(preset.value)}`;
    links[layout].href = url;
    // A fresh iframe document deliberately resets its in-memory example.
    frames[layout].src = `${name}?fixture=${encodeURIComponent(preset.value)}#preset=${encodeURIComponent(preset.value)}`;
  }
});
document.querySelectorAll('[data-choice]').forEach((button) => {
  button.addEventListener('click', () => {
    document.querySelectorAll('[data-choice]').forEach((b) => b.setAttribute('aria-pressed', String(b === button)));
    document.getElementById('choice-result').textContent = button.dataset.choice === 'a'
      ? '当前倾向 A：全园常见、逐畦打理。这里只记录你的比较结果；请在对话中确认后，再安排正式落地。'
      : '当前倾向 B：大区分工、翻册办事。这里只记录你的比较结果；请在对话中确认后，再安排正式落地。';
  });
});
async function markReady(layout) {
  readyFrames.add(layout);
  if (readyFrames.size === 2) { await document.fonts.ready; window.__ready = readyFrames.size === 2; }
}
window.addEventListener('message', (event) => {
  if (event.origin !== location.origin || event.data?.type !== 'garden-sketch-ready') return;
  const layout = event.data.layout;
  if (frames[layout]?.contentWindow === event.source) markReady(layout);
});
for (const [layout, frame] of Object.entries(frames)) {
  try { if (frame.contentWindow.__ready) markReady(layout); } catch { /* Same-origin previews only. */ }
}
