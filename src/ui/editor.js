import { createNode, createEdge, validateDocument } from '../core/protocol.js';
import { getActiveMap } from '../core/selectors.js';

function download(document, prefix = 'map') {
    const blob = new Blob([JSON.stringify(document, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob), link = documentElement('a');
    link.href = url; link.download = `${prefix}-${Date.now()}.json`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function documentElement(tag) { return document.createElement(tag); }
export function createEditor(host, store, persistence, report) {
    host.innerHTML = `<details class="dm-editor"><summary>编辑地图与备份</summary>
      <form class="dm-node-form"><h3>地点</h3>
        <label>选择地点<select name="nodeId" aria-label="选择编辑地点"></select></label>
        <label>地点名称<input name="name" required maxlength="120"></label>
        <label>地点类型<input name="type" required value="landmark" maxlength="80"></label>
        <label>地点描述<textarea name="description" rows="2" maxlength="10000"></textarea></label>
        <button type="submit">保存地点</button><button type="button" class="dm-delete-node">删除地点</button>
      </form>
      <form class="dm-edge-form"><h3>路线</h3>
        <label>选择路线<select name="edgeId" aria-label="选择编辑路线"></select></label>
        <label>路线名称<input name="name" maxlength="120"></label>
        <label>起点<select name="from" aria-label="路线起点" required></select></label>
        <label>终点<select name="to" aria-label="路线终点" required></select></label>
        <label>双向通行<input name="bidirectional" type="checkbox" checked></label>
        <button type="submit">保存路线</button><button type="button" class="dm-delete-edge">删除路线</button>
      </form>
      <div class="dm-backup"><button type="button" class="dm-export">导出 JSON</button><label>导入 JSON<input class="dm-import" type="file" accept=".json,application/json"></label><button type="button" class="dm-retry">重试保存</button></div>
    </details>`;
    const nodeForm = host.querySelector('.dm-node-form'), edgeForm = host.querySelector('.dm-edge-form');
    const field = (form, name) => form.elements.namedItem(name);
    let token = persistence.token(), mapId = null;
    const option = (value, text) => { const el = documentElement('option'); el.value = value; el.textContent = text; return el; };
    function fillNode() {
        const map = getActiveMap(store.snapshot()), node = map.nodes[field(nodeForm, 'nodeId').value];
        field(nodeForm, 'name').value = node?.name ?? '';
        field(nodeForm, 'type').value = node?.type ?? 'landmark';
        field(nodeForm, 'description').value = node?.description ?? '';
        host.querySelector('.dm-delete-node').disabled = !node;
    }
    function fillEdge() {
        const edge = getActiveMap(store.snapshot()).edges.find(e => e.id === field(edgeForm, 'edgeId').value);
        field(edgeForm, 'name').value = edge?.name ?? '';
        field(edgeForm, 'bidirectional').checked = edge?.bidirectional ?? true;
        if (edge) { field(edgeForm, 'from').value = edge.from; field(edgeForm, 'to').value = edge.to; }
        host.querySelector('.dm-delete-edge').disabled = !edge;
    }
    function refresh() {
        const map = getActiveMap(store.snapshot());
        const changed = token !== persistence.token() || mapId !== map.id;
        token = persistence.token(); mapId = map.id;
        const selectedNode = changed ? '' : field(nodeForm, 'nodeId').value;
        const selectedEdge = changed ? '' : field(edgeForm, 'edgeId').value;
        const from = field(edgeForm, 'from').value, to = field(edgeForm, 'to').value;
        field(nodeForm, 'nodeId').replaceChildren(option('', '＋ 新增地点'), ...Object.values(map.nodes).map(n => option(n.id, n.name)));
        field(edgeForm, 'edgeId').replaceChildren(option('', '＋ 新增路线'), ...map.edges.map(e => option(e.id, e.name || `${map.nodes[e.from].name} → ${map.nodes[e.to].name}`)));
        for (const key of ['from', 'to']) field(edgeForm, key).replaceChildren(...Object.values(map.nodes).map(n => option(n.id, n.name)));
        field(nodeForm, 'nodeId').value = Object.hasOwn(map.nodes, selectedNode) ? selectedNode : '';
        field(edgeForm, 'edgeId').value = map.edges.some(e => e.id === selectedEdge) ? selectedEdge : '';
        if (!changed) { if (map.nodes[from]) field(edgeForm, 'from').value = from; if (map.nodes[to]) field(edgeForm, 'to').value = to; }
        if (changed) { host.querySelector('details').open = false; fillNode(); fillEdge(); }
    }
    function attempt(fn) { try { persistence.ensureActive(); fn(); } catch (error) { report(error.message); } }
    field(nodeForm, 'nodeId').addEventListener('change', fillNode);
    field(edgeForm, 'edgeId').addEventListener('change', fillEdge);
    nodeForm.addEventListener('submit', event => {
        event.preventDefault(); attempt(() => {
            const map = getActiveMap(store.snapshot()), id = field(nodeForm, 'nodeId').value || `node_${crypto.randomUUID()}`;
            const old = map.nodes[id];
            const node = old ? structuredClone(old) : createNode(id, '新地点', { position: { x: (360 - map.view.x) / map.view.zoom, y: (200 - map.view.y) / map.view.zoom } });
            node.name = field(nodeForm, 'name').value.trim(); node.type = field(nodeForm, 'type').value.trim(); node.description = field(nodeForm, 'description').value;
            store.applyUpdate([{ type: 'upsertNode', node }]); field(nodeForm, 'nodeId').value = id; fillNode(); report('地点已更新');
        });
    });
    edgeForm.addEventListener('submit', event => {
        event.preventDefault(); attempt(() => {
            const map = getActiveMap(store.snapshot()), id = field(edgeForm, 'edgeId').value || `edge_${crypto.randomUUID()}`;
            const old = map.edges.find(e => e.id === id);
            const edge = old ? structuredClone(old) : createEdge(id, '', '');
            edge.name = field(edgeForm, 'name').value.trim(); edge.from = field(edgeForm, 'from').value; edge.to = field(edgeForm, 'to').value;
            edge.bidirectional = field(edgeForm, 'bidirectional').checked;
            store.applyUpdate([{ type: 'upsertEdge', edge }]); field(edgeForm, 'edgeId').value = id; fillEdge(); report('路线已更新');
        });
    });
    host.querySelector('.dm-delete-node').addEventListener('click', () => attempt(() => {
        const id = field(nodeForm, 'nodeId').value, map = getActiveMap(store.snapshot());
        if (!map.nodes[id]) return;
        const count = map.edges.filter(e => e.from === id || e.to === id).length;
        if (confirm(`删除「${map.nodes[id].name}」及其 ${count} 条连接？若为当前位置，当前位置将清空。`)) {
            store.applyUpdate([{ type: 'removeNode', nodeId: id }]); fillNode(); fillEdge(); report('地点及连接已删除');
        }
    }));
    host.querySelector('.dm-delete-edge').addEventListener('click', () => attempt(() => {
        const id = field(edgeForm, 'edgeId').value;
        if (id && confirm('删除所选路线？')) { store.applyUpdate([{ type: 'removeEdge', edgeId: id }]); fillEdge(); report('路线已删除'); }
    }));
    host.querySelector('.dm-export').addEventListener('click', () => download(persistence.exportDocument()));
    host.querySelector('.dm-retry').addEventListener('click', () => attempt(() => { persistence.retry(); }));
    host.querySelector('.dm-import').addEventListener('change', async event => {
        const file = event.target.files[0], captured = persistence.token(); event.target.value = '';
        if (!file) return;
        try {
            if (file.size > 5 * 1024 * 1024) throw new Error('地图文件不能超过 5 MB');
            const value = validateDocument(JSON.parse(await file.text()));
            if (captured !== persistence.token()) throw new Error('聊天已切换，请重新导入');
            if (!confirm('用此文件替换当前聊天的地图？将先下载一份原地图备份。')) return;
            download(persistence.exportDocument(), 'map-before-import');
            persistence.importDocument(value, captured); report('地图已导入');
        } catch (error) { report(`导入失败：${error.message}`); }
    });
    const unsubscribe = store.subscribe(refresh); refresh();
    return { destroy: unsubscribe };
}
