import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../src/core/store.js';
import { createDemoDocument } from '../src/core/demo.js';
import { bindChatStore, STORAGE_KEY } from '../src/adapters/chat.js';

function setup(save) {
    const records = new Map(), a = {}, b = {}; let metadata = a, id = 'a';
    const ctx = () => ({ getCurrentChatId: () => id, characterId: 0, characters: [{ avatar: 'hero.png' }], chatMetadata: metadata, saveMetadata: save ?? (async () => {}) });
    const storage = { getItem: key => records.get(key) ?? null, setItem: (key, value) => records.set(key, value) };
    const store = createStore(createDemoDocument()); const reports = [];
    const bridge = bindChatStore(store, { getContext: ctx, storage, namespace: 'test', report: text => reports.push(text) });
    return { store, bridge, a, b, records, reports, switch(idNext, notify = true) { id = idNext; metadata = id === 'a' ? a : b; if (notify) bridge.switchChat(); } };
}
test('chat A edits do not leak into B and survive returning to A', () => {
    const s = setup(); s.store.applyUpdate([{ type: 'setCurrentLocation', nodeId: 'qingyun_sect' }]);
    assert.equal(s.a[STORAGE_KEY].document.maps.world.currentLocation, 'qingyun_sect');
    s.switch('b'); assert.equal(s.store.snapshot().maps.world.currentLocation, 'longmen_city');
    assert.equal(s.b[STORAGE_KEY], undefined);
    s.switch('a'); assert.equal(s.store.snapshot().maps.world.currentLocation, 'qingyun_sect');
});
test('stale host binding rejects edits even before CHAT_CHANGED fires', () => {
    const s = setup(); s.switch('b', false);
    assert.throws(() => s.store.applyUpdate([{ type: 'setCurrentLocation', nodeId: 'qingyun_sect' }]));
    assert.equal(s.b[STORAGE_KEY], undefined);
});
test('late save completion cannot overwrite new chat state or status', async () => {
    let resolve; const s = setup(() => new Promise(r => { resolve = r; }));
    s.store.applyUpdate([{ type: 'setCurrentLocation', nodeId: 'qingyun_sect' }]);
    s.switch('b'); const status = s.reports.at(-1); resolve(); await new Promise(r => setImmediate(r));
    assert.equal(s.reports.at(-1), status); assert.equal(s.b[STORAGE_KEY], undefined);
    assert.equal(s.store.snapshot().maps.world.currentLocation, 'longmen_city');
});
test('import after chat switch and invalid import leave original state intact', () => {
    const s = setup(), token = s.bridge.token(); s.switch('b'); const before = s.store.snapshot();
    assert.throws(() => s.bridge.importDocument(createDemoDocument(), token));
    assert.throws(() => s.bridge.importDocument({ version: 99 }, s.bridge.token()));
    assert.deepEqual(s.store.snapshot(), before);
});
test('corrupt stored document is not overwritten by demo and can be exported', () => {
    const s = setup(); s.a[STORAGE_KEY] = { updatedAt: 1, document: { version: 99 } }; s.bridge.switchChat();
    assert.throws(() => s.store.applyUpdate([{ type: 'setCurrentLocation', nodeId: null }]));
    assert.equal(s.bridge.exportDocument().document.version, 99);
    assert.equal(s.a[STORAGE_KEY].document.version, 99);
});
test('delete current node clears dangling edges and current location', () => {
    const s = setup(); s.store.applyUpdate([{ type: 'removeNode', nodeId: 'longmen_city' }]);
    const map = s.store.snapshot().maps.world;
    assert.equal(map.currentLocation, null); assert.equal(map.edges.length, 0); assert.equal(Object.keys(map.nodes).length, 2);
});
test('save failure retains local recovery data and reports failure', async () => {
    const s = setup(async () => { throw new Error('offline'); });
    s.store.applyUpdate([{ type: 'setCurrentLocation', nodeId: 'qingyun_sect' }]);
    await new Promise(r => setImmediate(r)); assert.match(s.reports.at(-1), /同步失败/);
    delete s.a[STORAGE_KEY]; s.bridge.switchChat();
    assert.equal(s.store.snapshot().maps.world.currentLocation, 'qingyun_sect');
});
test('a successfully synced cache does not resurrect a deleted chat with reused name', async () => {
    const s = setup(); s.store.applyUpdate([{ type: 'setCurrentLocation', nodeId: 'qingyun_sect' }]);
    await new Promise(r => setImmediate(r)); delete s.a[STORAGE_KEY]; s.bridge.switchChat();
    assert.equal(s.store.snapshot().maps.world.currentLocation, 'longmen_city');
});
