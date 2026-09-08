import { createDraftSession } from './src/core/draft.js';
import { createApiSettings } from './src/adapters/generation.js';
import { createPreferences } from './src/ui/preferences.js';
import { installMessageButtons } from './src/ui/message-buttons.js';
import { createDemoDocument } from './src/core/demo.js';
import { createStore } from './src/core/store.js';
import { createPanel } from './src/ui/panel.js';
import { createPublicApi } from './src/integrations/api.js';
import { bindChatStore } from './src/adapters/chat.js';

let instance;
export function initialize() {
    if (instance) return instance;
    const host = document.querySelector('#extensions_settings2') ?? document.querySelector('#extensions_settings');
    const store = createStore(createDemoDocument());
    const ctx = globalThis.SillyTavern?.getContext?.();
    let panel, status = '';
    const inlinePanels = new Set();
    const settingsObject = ctx?.extensionSettings;
    if (settingsObject && !settingsObject.dynamicMapNamespace) {
        settingsObject.dynamicMapNamespace = crypto.randomUUID();
        ctx.saveSettingsDebounced?.();
    }
    const persistence = bindChatStore(store, {
        getContext: () => globalThis.SillyTavern?.getContext?.() ?? {},
        storage: { getItem: key => localStorage.getItem(key), setItem: (key, value) => localStorage.setItem(key, value) },
        namespace: settingsObject?.dynamicMapNamespace ?? 'unbound',
        report(message) { status = message; panel?.setStatus(message); for(const item of inlinePanels)item.setStatus(message); },
    });
    const preferences = createPreferences(() => globalThis.SillyTavern?.getContext?.(), localStorage, settingsObject?.dynamicMapNamespace ?? 'unbound');
    const shared = {draft:createDraftSession(store,persistence),apiSettings:createApiSettings(localStorage,persistence.namespace)};
    panel = createPanel(store, persistence, preferences, shared);
    const messageButtons = installMessageButtons(mount=>{
        const widget=createPanel(store,persistence,preferences,{...shared,mount,inline:true});
        inlinePanels.add(widget);widget.setStatus(status);
        return {destroy(){inlinePanels.delete(widget);widget.destroy();}};
    }, preferences);
    panel.setStatus(status);
    const onChatChanged = () => { persistence.switchChat(); messageButtons.refresh(); };
    if (ctx?.event_types?.CHAT_CHANGED) ctx.eventSource.on(ctx.event_types.CHAT_CHANGED, onChatChanged);
    const settings = document.createElement('div');
    settings.className = 'dm-settings';
    settings.innerHTML = '<b>动态地图</b><p>从悬浮条展开地图，拖动标题调整位置。</p><button type="button" class="menu_button">🗺 打开地图</button>';
    settings.querySelector('button').addEventListener('click', panel.open);

    host?.append(settings);
    const api = createPublicApi(store, panel.open);
    globalThis.SillyTavernDynamicMap = api;
    instance = { api, destroy() {
        messageButtons.destroy(); panel.destroy(); shared.draft.destroy(); settings.remove();
        persistence.destroy();
        if (ctx?.event_types?.CHAT_CHANGED) ctx.eventSource.removeListener?.(ctx.event_types.CHAT_CHANGED, onChatChanged);
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


