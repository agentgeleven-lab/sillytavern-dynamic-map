import { getActiveMap, getCurrentLocation, getNearbyLocations } from '../core/selectors.js';
import { renderGraph } from './graph.js';

export function createPanel(store) {
    const dialog = document.createElement('dialog');
    dialog.id = 'dynamic-map-panel';
    dialog.setAttribute('aria-labelledby', 'dm-title');
    // This template is static. All map-provided strings use textContent below.
    dialog.innerHTML = `<header class="dm-header"><div><span class="dm-eyebrow">动态地图 · V0.1</span><h2 id="dm-title"></h2></div><button type="button" class="dm-close" aria-label="关闭地图">×</button></header>
        <div class="dm-location" aria-live="polite"></div>
        <div class="dm-canvas"></div>
        <section class="dm-details" aria-live="polite"></section>
        <footer class="dm-footer">点击地点查看详情 · 示例数据仅保留在本次页面中</footer>`;
    document.body.append(dialog);
    const title = dialog.querySelector('h2'), location = dialog.querySelector('.dm-location');
    const canvas = dialog.querySelector('.dm-canvas'), details = dialog.querySelector('.dm-details');
    const renderers = new Map([['graph', renderGraph]]);
    let selectedId = null;
    function render() {
        const state = store.snapshot(), map = getActiveMap(state), current = getCurrentLocation(state);
        title.textContent = map.name;
        location.textContent = `📍 当前位置：${current?.name ?? '未设置'}　·　附近：${getNearbyLocations(state).map(node => node.name).join(' / ') || '无'}`;
        const select = node => {
            selectedId = node.id;
            details.textContent = `${node.name} · ${node.description || '暂无描述'}`;
        };
        const renderer = renderers.get(map.type);
        if (renderer) canvas.replaceChildren(renderer(map, select));
        else canvas.textContent = `${map.type} 地图的数据协议已预留，渲染器将在后续阶段加入。`;
        const selected = map.nodes[selectedId];
        if (selected?.discovered) select(selected);
        else { selectedId = null; details.textContent = '选择地图上的地点，可在这里查看说明。'; }
    }
    const unsubscribe = store.subscribe(() => { if (dialog.open) render(); });
    dialog.querySelector('.dm-close').addEventListener('click', () => dialog.close());
    return {
        open() { render(); if (!dialog.open) dialog.showModal(); },
        destroy() { unsubscribe(); dialog.close(); dialog.remove(); },
    };
}
