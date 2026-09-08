import { validateDocument } from './protocol.js';

/** Atomic command boundary for UI, future AI tools and storage adapters. */
export function createStore(initial) {
    let state = structuredClone(validateDocument(initial));
    const listeners = new Set();
    let notifying = false;
    let guard = () => {};
    const snapshot = () => structuredClone(state);
    function replace(next) {
        if (notifying) throw new Error('订阅回调中不能同步修改地图');
        const validated = structuredClone(validateDocument(next));
        state = validated;
        notifying = true;
        try {
            for (const listener of [...listeners]) {
                try { Promise.resolve(listener(snapshot())).catch(error => console.error('[DynamicMap subscriber]', error)); }
                catch (error) { console.error('[DynamicMap subscriber]', error); }
            }
        } finally { notifying = false; }
        return snapshot();
    }
    function applyUpdate(commands) {
        guard();
        if (!Array.isArray(commands) || commands.length === 0) throw new TypeError('更新需要非空命令数组');
        const next = snapshot();
        for (const command of commands) {
            if (!command || typeof command !== 'object') throw new TypeError('无效命令');
            const mapId = command.mapId ?? next.activeMap;
            if (!Object.hasOwn(next.maps, mapId)) throw new Error('地图不存在');
            const map = next.maps[mapId];
            switch (command.type) {
                case 'setActiveMap': next.activeMap = mapId; break;
                case 'setCurrentLocation': map.currentLocation = command.nodeId; break;
                case 'setView': map.view = structuredClone(command.view); break;
                case 'removeNode':
                    if (!Object.hasOwn(map.nodes, command.nodeId)) throw new Error('地点不存在');
                    delete map.nodes[command.nodeId];
                    map.edges = map.edges.filter(e => e.from !== command.nodeId && e.to !== command.nodeId);
                    if (map.currentLocation === command.nodeId) map.currentLocation = null;
                    break;
                case 'removeEdge':
                    if (!map.edges.some(e => e.id === command.edgeId)) throw new Error('路线不存在');
                    map.edges = map.edges.filter(e => e.id !== command.edgeId);
                    break;
                case 'upsertNode': {
                    const node = structuredClone(command.node);
                    if (!node || typeof node.id !== 'string' || ['__proto__', 'constructor', 'prototype'].includes(node.id)) throw new Error('无效地点 ID');
                    map.nodes[node.id] = node;
                    break;
                }
                case 'upsertEdge': {
                    const edge = structuredClone(command.edge);
                    if (!edge || typeof edge.id !== 'string') throw new Error('无效连接');
                    const index = map.edges.findIndex(item => item.id === edge.id);
                    if (index < 0) map.edges.push(edge); else map.edges[index] = edge;
                    break;
                }
                default: throw new Error(`不支持的更新操作：${command.type}`);
            }
        }
        return replace(next);
    }
    return Object.freeze({ snapshot, replace, applyUpdate,
        setGuard(fn) { guard = fn; },
        subscribe(listener) {
            if (typeof listener !== 'function') throw new TypeError('需要回调函数');
            listeners.add(listener); return () => listeners.delete(listener);
        },
    });
}
