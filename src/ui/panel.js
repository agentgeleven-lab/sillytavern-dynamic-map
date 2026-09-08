import { getActiveMap, getCurrentLocation, getNearbyLocations } from '../core/selectors.js';
import { renderGraph, positions } from './graph.js';
import { createEditor } from './editor.js';
import { attachFloatingWindow, readWindowPreferences } from './floating.js';

export function createPanel(store, persistence) {
    const panel = document.createElement('section');
    panel.id = 'dynamic-map-panel';
    panel.setAttribute('aria-label', '动态地图悬浮窗');
    // Static markup only; data strings use textContent.
    panel.innerHTML = `<header class="dm-header">
        <div class="dm-handle" tabindex="0" role="group" aria-label="拖动地图窗口，方向键移动" title="拖动标题移动，也可聚焦后使用方向键"><span class="dm-icon">🗺</span><div><span class="dm-eyebrow">动态地图</span><strong class="dm-compact-location"></strong></div><span class="dm-grip" aria-hidden="true">⠿</span></div>
        <button type="button" class="dm-toggle" aria-controls="dm-content"></button></header>
        <div id="dm-content">
            <div class="dm-map-heading"><h2 id="dm-title"></h2><select class="dm-map-select" aria-label="切换地图"></select></div>
            <div class="dm-toolbar" role="group" aria-label="地图控制">
                <button type="button" data-action="zoom-out" aria-label="缩小地图">−</button><output class="dm-zoom" aria-label="地图缩放比例">100%</output><button type="button" data-action="zoom-in" aria-label="放大地图">＋</button>
                <button type="button" data-action="reset-view">重置视图</button><button type="button" data-action="reset-window">归位</button><button type="button" data-action="locate">定位当前</button>
            </div>
            <div class="dm-canvas"></div><div class="dm-nearby" aria-label="附近地点"></div>
            <section class="dm-selection"><div class="dm-details" aria-live="polite"></div><button type="button" class="dm-move" hidden>设为当前位置</button></section>
            <div class="dm-editor-host"></div><p class="dm-save-status" role="status"></p><p class="dm-feedback" role="status"></p><footer class="dm-footer">拖动空白平移 · 拖动地点摆放 · 滚轮缩放</footer>
        </div>`;
    let collapsed = readWindowPreferences()?.collapsed ?? true;
    const content = panel.querySelector('#dm-content'), toggle = panel.querySelector('.dm-toggle');
    function reflectCollapse() {
        panel.classList.toggle('dm-collapsed', collapsed); content.hidden = collapsed;
        toggle.textContent = collapsed ? '展开' : '收起';
        toggle.setAttribute('aria-label', collapsed ? '展开地图' : '收起地图');
        toggle.setAttribute('aria-expanded', String(!collapsed));
    }
    reflectCollapse(); document.body.append(panel);
    const floating = attachFloatingWindow(panel, panel.querySelector('.dm-handle'), () => collapsed);
    const title = panel.querySelector('h2'), compact = panel.querySelector('.dm-compact-location');
    const canvas = panel.querySelector('.dm-canvas'), details = panel.querySelector('.dm-details');
    const mapSelect = panel.querySelector('.dm-map-select'), moveButton = panel.querySelector('.dm-move');
    const feedback = panel.querySelector('.dm-feedback'), nearby = panel.querySelector('.dm-nearby');
    const renderers = new Map([['graph', renderGraph]]);
    let selectedId = null, selectedMapId = null, chatToken = persistence.token();
    const selectedNode = map => Object.hasOwn(map.nodes, selectedId) ? map.nodes[selectedId] : null;
    function showDetails(node, map) {
        selectedId = node?.id ?? null;
        details.textContent = node ? `${node.name} · ${node.description || '暂无描述'}` : '点击地图或附近地点查看详情。';
        moveButton.hidden = !node || node.id === map.currentLocation;
    }
    function render() {
        const state = store.snapshot(), map = getActiveMap(state), current = getCurrentLocation(state);
        if (selectedMapId !== map.id || chatToken !== persistence.token()) { selectedId = null; selectedMapId = map.id; chatToken = persistence.token(); feedback.textContent = ''; }
        title.textContent = map.name; compact.textContent = current?.name ?? '未设置位置';
        compact.title = `当前位置：${current?.name ?? '未设置'}`;
        mapSelect.replaceChildren(...Object.values(state.maps).map(item => {
            const option = document.createElement('option'); option.value = item.id; option.textContent = item.name; return option;
        }));
        mapSelect.value = map.id; mapSelect.hidden = Object.keys(state.maps).length < 2;
        canvas.querySelector('svg')?.dmCleanup?.();
        if (collapsed) return;
        const select = node => showDetails(node, map), renderer = renderers.get(map.type);
        if (renderer) {
            const captured = persistence.token();
            const guarded = commands => { if (captured === persistence.token()) update(commands); };
            canvas.replaceChildren(renderer(map, select, {
                view: view => guarded([{ type: 'setView', mapId: map.id, view }]),
                node: (id, position) => guarded([{ type: 'upsertNode', mapId: map.id,
                    node: { ...map.nodes[id], position, layout: { ...map.nodes[id].layout, fixed: true } } }]),
            }));
        }
        else canvas.textContent = `${map.type} 地图的渲染器尚未实现。`;
        panel.querySelector('.dm-zoom').textContent = `${Math.round(map.view.zoom * 100)}%`;
        panel.querySelector('[data-action="zoom-out"]').disabled = !renderer || map.view.zoom <= 0.5;
        panel.querySelector('[data-action="zoom-in"]').disabled = !renderer || map.view.zoom >= 3;
        nearby.replaceChildren(); const label = document.createElement('span'); label.textContent = '附近'; nearby.append(label);
        for (const node of getNearbyLocations(state)) {
            const button = document.createElement('button'); button.type = 'button'; button.textContent = node.name;
            button.addEventListener('click', () => select(node)); nearby.append(button);
        }
        if (nearby.children.length === 1) nearby.append(document.createTextNode('暂无已发现的相邻地点'));
        const selected = selectedNode(map); showDetails(selected?.discovered ? selected : null, map);
    }
    function update(commands) {
        try { feedback.textContent = ''; store.applyUpdate(commands); return true; }
        catch (error) { feedback.textContent = `操作未完成：${error.message}`; return false; }
    }
    function setCollapsed(value) {
        if (value && content.contains(document.activeElement)) toggle.focus();
        collapsed = value; reflectCollapse(); render(); floating.keepVisible(); floating.save();
    }
    toggle.addEventListener('click', () => setCollapsed(!collapsed));
    panel.addEventListener('keydown', event => {
        if (event.key === 'Escape' && !collapsed) { event.stopPropagation(); setCollapsed(true); toggle.focus(); }
    });
    mapSelect.addEventListener('change', () => update([{ type: 'setActiveMap', mapId: mapSelect.value }]));
    moveButton.addEventListener('click', () => {
        const map = getActiveMap(store.snapshot());
        if (selectedNode(map)?.discovered && update([{ type: 'setCurrentLocation', mapId: map.id, nodeId: selectedId }])) {
            feedback.textContent = '已更新当前位置'; toggle.focus();
        }
    });
    panel.querySelector('.dm-toolbar').addEventListener('click', event => {
        const action = event.target.closest('button')?.dataset.action;
        if (!action) return;
        if (action === 'reset-window') { floating.reset(); return; }
        const map = getActiveMap(store.snapshot()); let view = { x: 0, y: 0, zoom: 1 };
        if (action === 'reset-view' || action === 'locate') {
            const pts = positions(Object.values(map.nodes).filter(n => n.discovered));
            const target = action === 'locate' ? pts.get(map.currentLocation) : null;
            if (target) view = { x: 360 - target.x * map.view.zoom, y: 240 - target.y * map.view.zoom, zoom: map.view.zoom };
            else if (pts.size) {
                const xs = [...pts.values()].map(p => p.x), ys = [...pts.values()].map(p => p.y);
                const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
                const zoom = Math.min(2, 580 / (maxX - minX + 120), 340 / (maxY - minY + 140));
                view = { zoom, x: 360 - (minX + maxX) / 2 * zoom, y: 240 - (minY + maxY) / 2 * zoom };
            }
        }
        if (action === 'zoom-in' || action === 'zoom-out') {
            const bounds = canvas.querySelector('svg')?.viewBox.baseVal;
            if (!bounds) return;
            const zoom = Math.max(0.5, Math.min(3, map.view.zoom + (action === 'zoom-in' ? 0.25 : -0.25)));
            const ratio = zoom / map.view.zoom;
            const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
            view = { zoom, x: center.x - (center.x - map.view.x) * ratio, y: center.y - (center.y - map.view.y) * ratio };
        }
        update([{ type: 'setView', mapId: map.id, view }]);
    });
    const editor = createEditor(panel.querySelector('.dm-editor-host'), store, persistence, text => { feedback.textContent = text; });
    const unsubscribe = store.subscribe(render); render();
    return { open() { setCollapsed(false); }, resetPosition: floating.reset, setStatus(text) { panel.querySelector('.dm-save-status').textContent = text; },
        destroy() { canvas.querySelector('svg')?.dmCleanup?.(); editor.destroy(); unsubscribe(); floating.destroy(); panel.remove(); } };
}
