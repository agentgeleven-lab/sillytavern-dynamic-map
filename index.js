import { createDemoDocument } from './src/core/demo.js';
import { createStore } from './src/core/store.js';
import { createPanel } from './src/ui/panel.js';
import { createPublicApi } from './src/integrations/api.js';

let instance;
export function initialize() {
    if (instance) return instance;
    const host = document.querySelector('#extensions_settings2') ?? document.querySelector('#extensions_settings');
    const store = createStore(createDemoDocument());
    const panel = createPanel(store);
    const settings = document.createElement('div');
    settings.className = 'dm-settings';
    settings.innerHTML = '<b>动态地图</b><p>从悬浮条展开地图，拖动标题调整位置。</p><button type="button" class="menu_button">🗺 打开地图</button><button type="button" class="menu_button dm-reset-window">悬浮窗归位</button>';
    settings.querySelector('button').addEventListener('click', panel.open);
    settings.querySelector('.dm-reset-window').addEventListener('click', panel.resetPosition);
    host?.append(settings);
    const api = createPublicApi(store, panel.open);
    globalThis.SillyTavernDynamicMap = api;
    instance = { api, destroy() {
        panel.destroy(); settings.remove();
        if (globalThis.SillyTavernDynamicMap === api) delete globalThis.SillyTavernDynamicMap;
        instance = undefined;
    } };
    return instance;
}

// getContext avoids fragile relative imports into SillyTavern internals.
const context = globalThis.SillyTavern?.getContext?.();
if (context?.eventSource && context.event_types?.APP_INITIALIZED) {
    context.eventSource.on(context.event_types.APP_INITIALIZED, initialize);
} else if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize, { once: true });
} else initialize();
