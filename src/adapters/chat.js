import { createDemoDocument } from '../core/demo.js';
import { validateDocument } from '../core/protocol.js';

export const STORAGE_KEY = 'dynamicMapV1';
export function chatIdentity(ctx) {
    const chat = ctx?.getCurrentChatId?.();
    if (chat === null || chat === undefined || chat === '') return null;
    const owner = ctx.groupId != null ? ['group', String(ctx.groupId)]
        : ['character', ctx.characters?.[ctx.characterId]?.avatar];
    if (!owner[1]) return null;
    return JSON.stringify([...owner, String(chat)]);
}

/** Synchronous binding changes; async save completions cannot write another chat. */
export function bindChatStore(store, { getContext, storage, namespace, report = () => {} }) {
    let binding = null, loading = false, disposed = false, generation = 0;
    const keyFor = id => `dynamic-map.chat.${namespace}.${id}`;
    function ensureActive() {
        if (!binding || chatIdentity(getContext()) !== binding.id || getContext().chatMetadata !== binding.metadata) {
            throw new Error('聊天已切换或尚未打开，请重新打开地图后操作');
        }
        if (binding.invalid) throw new Error('保存的地图格式无效，请先导出原始数据备份，再导入有效地图');
    }
    store.setGuard(ensureActive);
    function currentReport(text, target = binding) { if (!disposed && binding === target) report(text); }
    function switchChat() {
        generation++;
        const ctx = getContext(), id = chatIdentity(ctx);
        binding = id && ctx.chatMetadata ? { id, metadata: ctx.chatMetadata, revision: 0, invalid: false } : null;
        let document = createDemoDocument();
        loading = true;
        try {
            if (binding) {
                const saved = ctx.chatMetadata[STORAGE_KEY];
                let raw = null;
                try { raw = storage.getItem(keyFor(id)); } catch { /* Metadata remains usable. */ }
                binding.raw = { metadata: saved ?? null, localRaw: raw };
                const cached = raw ? JSON.parse(raw) : null;
                const candidate = cached && !cached.synced && (!saved || cached.updatedAt > saved.updatedAt) ? cached : saved;
                binding.raw = candidate;
                if (candidate) document = structuredClone(validateDocument(candidate.document));
                currentReport(candidate ? '已载入当前聊天地图' : '当前聊天尚无地图；首次编辑后保存');
            } else report('请先打开一个聊天；当前为只读示例');
        } catch (error) {
            if (binding) binding.invalid = true;
            currentReport(`地图载入失败，原数据未覆盖：${error.message}`);
        }
        try { store.replace(document); } finally { loading = false; }
    }
    async function persist(document) {
        if (loading || disposed) return;
        ensureActive();
        const target = binding, revision = ++target.revision;
        const envelope = { updatedAt: Math.max(Date.now(), (target.raw?.updatedAt ?? 0) + 1), document };
        target.raw = structuredClone(envelope);
        let cached = true;
        try { storage.setItem(keyFor(target.id), JSON.stringify(envelope)); } catch { cached = false; }
        target.metadata[STORAGE_KEY] = structuredClone(envelope);
        currentReport(cached ? '本地已保存，正在同步聊天…' : '本地副本不可用，正在保存聊天…', target);
        try {
            // Call immediately with the current context, never from a delayed save queue.
            const ctx = getContext();
            if (typeof ctx.saveMetadata !== 'function') throw new Error('酒馆未提供保存接口');
            await ctx.saveMetadata();
            if (binding === target && target.revision === revision && chatIdentity(getContext()) === target.id && getContext().chatMetadata === target.metadata) {
                try { storage.setItem(keyFor(target.id), JSON.stringify({ ...envelope, synced: true })); } catch { /* Keep server result. */ }
                currentReport('已保存到当前聊天', target);
            }
        } catch (error) {
            currentReport(`${cached ? '本地副本已保留' : '保存失败，请立即导出备份'}；聊天同步失败：${error.message}`, target);
        }
    }
    const unsubscribe = store.subscribe(persist);
    switchChat();
    return {
        switchChat, ensureActive,
        token: () => generation,
        importDocument(document, token) {
            if (token !== generation) throw new Error('导入期间聊天已切换，请重新选择文件');
            const valid = structuredClone(validateDocument(document));
            if (!binding || chatIdentity(getContext()) !== binding.id || getContext().chatMetadata !== binding.metadata) throw new Error('请先打开聊天');
            binding.invalid = false; generation++; store.replace(valid);
        },
        exportDocument: () => binding?.invalid ? (binding.raw ?? binding.metadata[STORAGE_KEY]) : store.snapshot(),
        retry() { ensureActive(); return persist(store.snapshot()); },
        destroy() { disposed = true; unsubscribe(); store.setGuard(() => { throw new Error('地图已关闭'); }); },
    };
}
