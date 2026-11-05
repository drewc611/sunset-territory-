// Keyboard, virtual stick, gallop button, and camera drag.
// Touch: stick bottom left, GALLOP button, drag anywhere on the right half to swing the camera.
// Desktop: WASD or arrows, Shift to gallop, Q/E or mouse drag to swing the camera.
export function createInput(canvas) {
  const keys = {};
  addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    keys[k] = true;
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
  });
  addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });
  addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

  const stick = { x: 0, y: 0, active: false };
  const stickEl = document.getElementById('stick'), knob = document.getElementById('knob');
  let stickId = null, origin = null;
  stickEl.addEventListener('pointerdown', (e) => {
    stickId = e.pointerId;
    const r = stickEl.getBoundingClientRect();
    origin = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    stickEl.setPointerCapture(e.pointerId);
    stick.active = true;
  });
  stickEl.addEventListener('pointermove', (e) => {
    if (e.pointerId !== stickId) return;
    let dx = e.clientX - origin.x, dy = e.clientY - origin.y;
    const m = Math.hypot(dx, dy), max = 44;
    if (m > max) { dx *= max / m; dy *= max / m; }
    stick.x = dx / max; stick.y = dy / max;
    knob.style.transform = `translate(${dx}px,${dy}px)`;
  });
  const endStick = (e) => {
    if (e.pointerId !== stickId) return;
    stickId = null; stick.x = stick.y = 0; stick.active = false; knob.style.transform = '';
  };
  stickEl.addEventListener('pointerup', endStick);
  stickEl.addEventListener('pointercancel', endStick);

  let spur = false;
  const spurEl = document.getElementById('spur');
  spurEl.addEventListener('pointerdown', (e) => { spur = true; spurEl.classList.add('on'); e.preventDefault(); });
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) {
    spurEl.addEventListener(ev, () => { spur = false; spurEl.classList.remove('on'); });
  }

  // Camera drag: right half of the screen on touch, anywhere with a mouse.
  let dragId = null, dragX = 0, dragDelta = 0;
  canvas.addEventListener('pointerdown', (e) => {
    if (dragId !== null) return;
    if (e.pointerType === 'touch' && e.clientX < innerWidth / 2) return;
    dragId = e.pointerId; dragX = e.clientX;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerId !== dragId) return;
    dragDelta += e.clientX - dragX; dragX = e.clientX;
  });
  const endDrag = (e) => { if (e.pointerId === dragId) dragId = null; };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  // Contextual action (F, or the action button): dismount, mount, or whistle. H whistles.
  const handlers = { action: [], whistle: [], journal: [] };
  let invert = 1;
  addEventListener('keydown', (e) => {
    if (e.repeat) return;
    const k = e.key.toLowerCase();
    if (k === 'f') handlers.action.forEach((f) => f());
    if (k === 'h') handlers.whistle.forEach((f) => f());
    if (k === 'j') handlers.journal.forEach((f) => f());
  });
  const actEl = document.getElementById('act');
  actEl.addEventListener('pointerdown', (e) => { e.preventDefault(); handlers.action.forEach((f) => f()); });

  const state = { fwd: 0, turn: 0, gallop: false, camYawDelta: 0, dragging: false, keys };

  function read(dt) {
    let fwd = 0, turn = 0;
    if (keys.w || keys.arrowup) fwd += 1;
    if (keys.s || keys.arrowdown) fwd -= 0.5;
    if (keys.a || keys.arrowleft) turn += 1;
    if (keys.d || keys.arrowright) turn -= 1;
    if (stick.active) { fwd += -stick.y; turn += -stick.x; }
    state.fwd = Math.max(-0.5, Math.min(1, fwd));
    state.turn = Math.max(-1, Math.min(1, turn));
    state.gallop = !!keys.shift || spur;
    let yaw = 0;
    if (keys.q) yaw += dt * 2;
    if (keys.e) yaw -= dt * 2;
    yaw -= dragDelta * 0.006 * invert;
    dragDelta = 0;
    state.camYawDelta = yaw;
    state.dragging = dragId !== null;
    return state;
  }

  return {
    read, state,
    onAction: (f) => handlers.action.push(f), onWhistle: (f) => handlers.whistle.push(f), onJournal: (f) => handlers.journal.push(f),
    setInvert: (v) => { invert = v ? -1 : 1; },
  };
}
