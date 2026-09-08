/** SVG coordinates are independent of screen pixels and panel size. */
export function attachNavigation(svg, map, points, callbacks) {
    const viewport = svg.querySelector('[data-layer="viewport"]');
    let drag = null, view = { ...map.view }, wheelTimer, suppressClick = false;
    const point = event => new DOMPoint(event.clientX, event.clientY).matrixTransform(svg.getScreenCTM().inverse());
    const transform = () => viewport.setAttribute('transform', `translate(${view.x} ${view.y}) scale(${view.zoom})`);
    function commitWheel() { clearTimeout(wheelTimer); wheelTimer = undefined; callbacks.view(view); }
    svg.addEventListener('wheel', event => {
        event.preventDefault(); if (drag) return;
        const p = point(event), next = Math.max(0.5, Math.min(3, view.zoom * (event.deltaY < 0 ? 1.12 : 1 / 1.12)));
        const ratio = next / view.zoom;
        view = { x: p.x - (p.x - view.x) * ratio, y: p.y - (p.y - view.y) * ratio, zoom: next };
        transform(); clearTimeout(wheelTimer); wheelTimer = setTimeout(commitWheel, 160);
    }, { passive: false });
    svg.addEventListener('pointerdown', event => {
        if (!event.isPrimary || event.button !== 0) return;
        if (wheelTimer) { commitWheel(); return; }
        const node = event.target.closest('[data-node-id]');
        const p = point(event), id = node?.dataset.nodeId;
        drag = { pointer: event.pointerId, start: p, node, id, original: id ? points.get(id) : { ...view }, moved: false };
        svg.setPointerCapture(event.pointerId);
    });
    svg.addEventListener('pointermove', event => {
        if (drag?.pointer !== event.pointerId) return;
        const p = point(event), dx = p.x - drag.start.x, dy = p.y - drag.start.y;
        if (Math.hypot(dx, dy) < 5 && !drag.moved) return;
        drag.moved = true;
        if (drag.node) {
            drag.position = { x: drag.original.x + dx / view.zoom, y: drag.original.y + dy / view.zoom };
            drag.node.setAttribute('transform', `translate(${drag.position.x} ${drag.position.y})`);
        } else { view = { ...view, x: drag.original.x + dx, y: drag.original.y + dy }; transform(); }
    });
    function finish(event) {
        if (drag?.pointer !== event.pointerId) return;
        const ended = drag; drag = null;
        if (event.type === 'pointercancel') {
            if (ended.node) ended.node.setAttribute('transform', `translate(${ended.original.x} ${ended.original.y})`);
            view = { ...map.view }; transform(); return;
        }
        if (!ended.moved) { if (ended.id) callbacks.select(map.nodes[ended.id]); return; }
        suppressClick = true;
        if (ended.node) callbacks.node(ended.id, ended.position); else callbacks.view(view);
    }
    svg.addEventListener('pointerup', finish); svg.addEventListener('pointercancel', finish);
    svg.addEventListener('click', event => { if (suppressClick) { event.stopPropagation(); suppressClick = false; } }, true);
    return () => clearTimeout(wheelTimer);
}
