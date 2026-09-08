import { validateDocument } from './protocol.js';
import { prepareDocument, validateRules, layoutMap } from './spatial.js';

export function createDraftSession(committed, persistence) {
    const drafts = new Map(), listeners = new Set();
    let current, key, saving = false;
    const fingerprint = () => JSON.stringify(committed.snapshot());
    function emit() { for (const fn of listeners) fn(); }
    function sync() {
        key = persistence.scope();
        const signature = fingerprint();
        current = drafts.get(key);
        if (!current || !current.dirty || saving) {
            current = { document: prepareDocument(committed.snapshot()), base: signature, dirty: false, conflict: false, revision: 0 };
            drafts.set(key, current);
        } else current.conflict = current.base !== signature;
        emit();
    }
    const unsubscribe = committed.subscribe(sync); sync();
    function mutate(fn, recovery = false) {
        (recovery || current.recovery ? persistence.ensureBound ?? persistence.ensureActive : persistence.ensureActive)();
        if (key !== persistence.scope()) throw new Error('聊天已切换');
        const next = structuredClone(current.document);
        fn(next); validateDocument(next);
        current.document = next; current.recovery ||= recovery; current.dirty = true; current.revision++; emit();
    }
    return {
        snapshot: () => structuredClone(current.document),
        status: () => ({ dirty: current.dirty, conflict: current.conflict }),
        token: () => `${persistence.token()}:${current.revision}`,
        mutate,
        replace(document) { const next = prepareDocument(validateDocument(document)); for (const map of Object.values(next.maps)) validateRules(map); mutate(d => { for (const k of Object.keys(d)) delete d[k]; Object.assign(d, next); }, true); },
        save() {
            (current.recovery ? persistence.ensureBound ?? persistence.ensureActive : persistence.ensureActive)();
            if (current.base !== fingerprint()) throw new Error('已保存地图在编辑期间发生变化，请先放弃草稿并重新调整');
            const next = structuredClone(current.document);
            for (const map of Object.values(next.maps)) { validateRules(map); if (map.type === 'graph') layoutMap(map); }
            validateDocument(next);
            saving = true;
            try { persistence.importDocument(next, persistence.token()); } finally { saving = false; }
        },
        discard() { drafts.delete(key); sync(); },
        subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
        destroy() { unsubscribe(); listeners.clear(); },
    };
}


