/** UI-only preferences, never map/story data. */
const KEY = 'sillytavern-dynamic-map.window.v1';
export function readWindowPreferences() {
    try {
        const value = JSON.parse(localStorage.getItem(KEY));
        return value && Number.isFinite(value.x) && Number.isFinite(value.y)
            ? { x: value.x, y: value.y, collapsed: value.collapsed !== false } : null;
    } catch { return null; }
}
export function attachFloatingWindow(element, handle, getCollapsed) {
    let position = readWindowPreferences(), drag = null;
    const abort = new AbortController(), options = { signal: abort.signal };
    function save() {
        try { localStorage.setItem(KEY, JSON.stringify({ ...position, collapsed: getCollapsed() })); }
        catch { /* Storage may be blocked; the window still works. */ }
    }
    function place(x, y) {
        const bounds = element.getBoundingClientRect();
        position = { x: Math.max(8, Math.min(x, window.innerWidth - bounds.width - 8)),
            y: Math.max(8, Math.min(y, window.innerHeight - bounds.height - 8)) };
        element.style.left = `${position.x}px`; element.style.top = `${position.y}px`;
    }
    function reset() { place(window.innerWidth - element.offsetWidth - 18, 140); save(); }
    function keepVisible() { place(position.x, position.y); }
    if (position) place(position.x, position.y); else reset();
    handle.addEventListener('pointerdown', event => {
        if (!event.isPrimary || event.button !== 0) return;
        drag = { id: event.pointerId, x: event.clientX, y: event.clientY, start: { ...position } };
        handle.setPointerCapture(event.pointerId); element.classList.add('dm-dragging'); event.preventDefault();
    }, options);
    handle.addEventListener('pointermove', event => {
        if (drag?.id === event.pointerId) place(drag.start.x + event.clientX - drag.x, drag.start.y + event.clientY - drag.y);
    }, options);
    function stop(event) {
        if (drag?.id !== event.pointerId) return;
        drag = null; element.classList.remove('dm-dragging'); save();
    }
    for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) handle.addEventListener(event, stop, options);
    handle.addEventListener('keydown', event => {
        const moves = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
        if (!moves[event.key]) return;
        event.preventDefault(); const step = event.shiftKey ? 40 : 10;
        place(position.x + moves[event.key][0] * step, position.y + moves[event.key][1] * step); save();
    }, options);
    window.addEventListener('resize', keepVisible, options);
    const observer = new ResizeObserver(keepVisible); observer.observe(element);
    return { reset, save, keepVisible, destroy() { abort.abort(); observer.disconnect(); } };
}
