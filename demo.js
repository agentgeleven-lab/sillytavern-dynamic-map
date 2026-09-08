// Standalone host simulation: never loaded by the extension manifest.
let active = localStorage.getItem('dm-demo-chat') || 'a';
const listeners = new Map();
function load(id) { try { return JSON.parse(localStorage.getItem(`dm-demo-metadata-${id}`)) || {}; } catch { return {}; } }
let metadata = load(active);
const settings = { dynamicMapNamespace: 'standalone-demo-v3' };
globalThis.SillyTavern = { getContext: () => ({
    getCurrentChatId: () => active, characterId: 0, characters: [{ avatar: 'demo.png' }], chatMetadata: metadata,
    extensionSettings: settings, event_types: { APP_INITIALIZED: 'ready', CHAT_CHANGED: 'chat' },
    eventSource: { on(event, fn) { if (event === 'ready') queueMicrotask(fn); else { if (!listeners.has(event)) listeners.set(event, new Set()); listeners.get(event).add(fn); } }, removeListener(event, fn) { listeners.get(event)?.delete(fn); } },
    async saveMetadata() { localStorage.setItem(`dm-demo-metadata-${active}`, JSON.stringify(metadata)); },
}) };
document.querySelector('#demo-chat').value = active;
document.querySelector('#demo-chat').addEventListener('change', event => {
    active = event.target.value; localStorage.setItem('dm-demo-chat', active); metadata = load(active);
    for (const fn of listeners.get('chat') ?? []) fn();
});
await import('./index.js');
