import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoDocument } from '../src/core/demo.js';
import { validateDocument, createMap, createNode, createEdge } from '../src/core/protocol.js';
import { createStore } from '../src/core/store.js';
import { getNearbyLocations, getSummary } from '../src/core/selectors.js';
import { createPublicApi } from '../src/integrations/api.js';
import { createMemoryRepository } from '../src/adapters/memory.js';

test('demo contains required nodes, edges and current location', () => {
    const state = validateDocument(createDemoDocument());
    assert.deepEqual(Object.values(state.maps.world.nodes).map(n => n.name), ['青云宗', '龙门市', '白沙镇']);
    assert.equal(state.maps.world.edges.length, 2);
    assert.equal(state.maps.world.currentLocation, 'longmen_city');
});
test('graph, hex and grid documents round-trip as JSON', () => {
    for (const type of ['graph', 'hex', 'grid']) {
        const doc = { version: 1, activeMap: 'map', maps: { map: createMap('map', type, type) } };
        assert.deepEqual(validateDocument(JSON.parse(JSON.stringify(doc))), doc);
    }
});
test('bad references, invalid numbers, duplicate IDs and hierarchy loops rejected', () => {
    const mutations = [
        d => d.version = 2, d => d.activeMap = 'missing',
        d => d.maps.world.currentLocation = 'missing',
        d => d.maps.world.edges[0].to = 'missing',
        d => d.maps.world.edges.push(d.maps.world.edges[0]),
        d => d.maps.world.view.zoom = 0,
        d => d.maps.world.view.x = Infinity,
        d => d.maps.world.nodes.longmen_city.position.x = null,
        d => d.maps.world.parentMap = 'world',
        d => d.maps.world.metadata.date = new Date(),
        d => d.maps.world.nodes.longmen_city.discovered = false,
    ];
    for (const mutate of mutations) { const doc = createDemoDocument(); mutate(doc); assert.throws(() => validateDocument(doc)); }
    assert.throws(() => validateDocument(JSON.parse('{"__proto__": {}}')));
});
test('batch updates are atomic and rejected updates do not emit', () => {
    const store = createStore(createDemoDocument());
    const before = store.snapshot(); let events = 0;
    store.subscribe(() => events++);
    assert.throws(() => store.applyUpdate([
        { type: 'setCurrentLocation', nodeId: 'qingyun_sect' },
        { type: 'setCurrentLocation', nodeId: 'missing' },
    ]));
    assert.deepEqual(store.snapshot(), before); assert.equal(events, 0);
    store.applyUpdate([{ type: 'setCurrentLocation', nodeId: 'qingyun_sect' }]);
    assert.equal(events, 1);
});
test('new nodes and edges can be added together; snapshots are isolated', () => {
    const store = createStore(createDemoDocument());
    store.applyUpdate([
        { type: 'upsertEdge', edge: createEdge('port_road', 'longmen_city', 'port') },
        { type: 'upsertNode', node: createNode('port', '龙门港') },
    ]);
    const snapshot = store.snapshot(); snapshot.maps.world.name = 'modified';
    assert.notEqual(store.snapshot().maps.world.name, 'modified');
    assert.equal(store.snapshot().maps.world.edges.length, 3);
    assert.throws(() => store.applyUpdate([{ type: 'upsertNode', node: { id: '__proto__' } }]));
    assert.throws(() => store.applyUpdate([{ type: 'eval', code: 'anything' }]));
});
test('nearby follows outgoing edges and hides undiscovered or context-excluded nodes', () => {
    const doc = createDemoDocument();
    doc.maps.world.edges[0].bidirectional = false;
    doc.maps.world.currentLocation = 'qingyun_sect';
    assert.deepEqual(getNearbyLocations(doc), []);
    doc.maps.world.currentLocation = 'longmen_city';
    doc.maps.world.nodes.qingyun_sect.discovered = false;
    doc.maps.world.nodes.baisha_town.ai.includeInContext = false;
    assert.equal(getNearbyLocations(doc).length, 1);
    assert.deepEqual(getSummary(doc)['rpg.map.nearby'], []);
    assert.equal(Object.hasOwn(getSummary(doc), 'maps'), false);
});
test('optional summary adapter receives initial/update summaries and can detach', async () => {
    const store = createStore(createDemoDocument()); const seen = [];
    const api = createPublicApi(store, () => {});
    const detach = api.registerSummaryAdapter({ publish: summary => seen.push(summary) });
    await new Promise(resolve => setImmediate(resolve));
    api.setCurrentLocation('qingyun_sect');
    await new Promise(resolve => setImmediate(resolve));
    detach(); api.setCurrentLocation('baisha_town');
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(seen.length, 2);
    assert.equal(seen[1]['rpg.map.current_name'], '青云宗');
});
test('memory repository isolates keys and copies', async () => {
    const repo = createMemoryRepository(); const doc = createDemoDocument();
    await repo.save('chat-a', doc); doc.maps.world.name = 'changed';
    assert.equal(await repo.load('chat-b'), null);
    assert.notEqual((await repo.load('chat-a')).maps.world.name, 'changed');
});
