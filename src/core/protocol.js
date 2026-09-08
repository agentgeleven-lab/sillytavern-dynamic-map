/**
 * JSON protocol v1. The core has no DOM or SillyTavern dependencies.
 * @typedef {'graph'|'hex'|'grid'} MapType
 * @typedef {{x:number,y:number,zoom:number}} ViewState
 * @typedef {{id:string,name:string,type:string,description:string,discovered:boolean,
 * position:{x:number|null,y:number|null},layout:{fixed:boolean},
 * ai:{includeInContext:boolean,alias:string[]},metadata:Object}} MapNode
 * @typedef {{id:string,from:string,to:string,type:string,name:string,
 * direction:string|null,bidirectional:boolean,discovered:boolean,metadata:Object}} MapEdge
 * @typedef {{id:string,name:string,type:MapType,parentMap:string|null,
 * nodes:Object<string,MapNode>,edges:MapEdge[],currentLocation:string|null,
 * view:ViewState,metadata:Object}} MapData
 * @typedef {{version:1,activeMap:string,maps:Object<string,MapData>}} MapDocument
 */
import { DIRECTIONS, prepareDocument, validateRules } from './spatial.js';
export const MAP_TYPES = Object.freeze(['graph', 'hex', 'grid']);
const forbidden = new Set(['__proto__', 'constructor', 'prototype']);
const directions = [null, ...DIRECTIONS.map(d => d.id), 'up', 'down'];
const own = (o, key) => Object.hasOwn(o, key);
function expect(ok, path, message) {
    if (!ok) throw new TypeError(`${path}: ${message}`);
}
function object(value, path) {
    expect(value !== null && typeof value === 'object' && !Array.isArray(value), path, '需要对象');
    expect(Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null, path, '需要普通 JSON 对象');
}
function string(value, path) { expect(typeof value === 'string' && value.trim().length > 0, path, '需要非空字符串'); }
function id(value, path) { string(value, path); expect(!forbidden.has(value), path, '保留 ID'); }
function bool(value, path) { expect(typeof value === 'boolean', path, '需要布尔值'); }

// Reject non-JSON values rather than silently dropping or coercing them on save.
function json(value, path, ancestors = new Set()) {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
    if (typeof value === 'number') { expect(Number.isFinite(value), path, '需要有限数值'); return; }
    object(value, path); // Arrays are handled by the caller below.
    expect(!ancestors.has(value), path, '不允许循环引用');
    ancestors.add(value);
    for (const [key, child] of Object.entries(value)) {
        expect(!forbidden.has(key), `${path}.${key}`, '保留字段');
        if (Array.isArray(child)) {
            expect(!ancestors.has(child), path, '不允许循环引用');
            ancestors.add(child);
            for (const item of child) jsonValue(item, `${path}.${key}[]`, ancestors);
            ancestors.delete(child);
        } else json(child, `${path}.${key}`, ancestors);
    }
    ancestors.delete(value);
}
function jsonValue(value, path, ancestors) {
    if (!Array.isArray(value)) return json(value, path, ancestors);
    expect(!ancestors.has(value), path, '不允许循环引用');
    ancestors.add(value);
    for (const item of value) jsonValue(item, `${path}[]`, ancestors);
    ancestors.delete(value);
}

/** Validate structure AND cross references. Throws before any store mutation. */
export function validateDocument(doc) {
    json(doc, 'document');
    expect(doc.version === 1, 'version', '仅支持协议版本 1');
    object(doc.maps, 'maps'); id(doc.activeMap, 'activeMap');
    expect(own(doc.maps, doc.activeMap), 'activeMap', '地图不存在');
    for (const [mapId, map] of Object.entries(doc.maps)) {
        id(mapId, 'maps key'); object(map, mapId);
        expect(map.id === mapId, mapId, '地图 ID 与键不一致');
        string(map.name, `${mapId}.name`);
        expect(MAP_TYPES.includes(map.type), mapId, '未知地图类型');
        expect(map.parentMap === null || (typeof map.parentMap === 'string' && own(doc.maps, map.parentMap)), mapId, '父地图不存在');
        object(map.metadata, `${mapId}.metadata`);
        object(map.nodes, `${mapId}.nodes`);
        for (const [nodeId, node] of Object.entries(map.nodes)) {
            id(nodeId, 'nodes key'); object(node, nodeId);
            expect(node.id === nodeId, nodeId, '地点 ID 与键不一致');
            string(node.name, `${nodeId}.name`); string(node.type, `${nodeId}.type`);
            expect(typeof node.description === 'string', nodeId, 'description 需要字符串');
            bool(node.discovered, `${nodeId}.discovered`);
            object(node.position, `${nodeId}.position`);
            const { x, y } = node.position;
            expect((x === null && y === null) || (Number.isFinite(x) && Number.isFinite(y)), nodeId, '坐标需同时为 null 或有限数值');
            object(node.layout, `${nodeId}.layout`); bool(node.layout.fixed, `${nodeId}.layout.fixed`);
            expect(!node.layout.fixed || x !== null, nodeId, '固定地点需要坐标');
            object(node.ai, `${nodeId}.ai`); bool(node.ai.includeInContext, `${nodeId}.ai.includeInContext`);
            expect(Array.isArray(node.ai.alias) && node.ai.alias.every(a => typeof a === 'string'), nodeId, 'alias 需要字符串数组');
            object(node.metadata, `${nodeId}.metadata`);
        }
        expect(map.currentLocation === null || (typeof map.currentLocation === 'string' && own(map.nodes, map.currentLocation)), mapId, '当前位置不存在');
        expect(map.currentLocation === null || map.nodes[map.currentLocation].discovered, mapId, '当前位置必须已发现');
        expect(Array.isArray(map.edges), mapId, 'edges 需要数组');
        const edgeIds = new Set();
        for (const edge of map.edges) {
            object(edge, 'edge'); id(edge.id, 'edge.id');
            expect(!edgeIds.has(edge.id), edge.id, '连接 ID 重复'); edgeIds.add(edge.id);
            id(edge.from, 'edge.from'); id(edge.to, 'edge.to');
            expect(own(map.nodes, edge.from) && own(map.nodes, edge.to), edge.id, '连接端点不存在');
            expect(edge.from !== edge.to, edge.id, '不支持自连接');
            string(edge.type, 'edge.type'); expect(typeof edge.name === 'string', edge.id, 'name 需要字符串');
            expect(directions.includes(edge.direction), edge.id, '未知方向');
            bool(edge.bidirectional, 'edge.bidirectional'); bool(edge.discovered, 'edge.discovered');
            object(edge.metadata, 'edge.metadata');
        }
        object(map.view, `${mapId}.view`);
        expect(Number.isFinite(map.view.x) && Number.isFinite(map.view.y) && Number.isFinite(map.view.zoom) && map.view.zoom > 0, mapId, '视图坐标需有限且缩放必须大于 0');
        const visited = new Set([mapId]);
        let parent = map.parentMap;
        while (parent !== null) {
            expect(typeof parent === 'string' && own(doc.maps, parent), mapId, '父地图不存在');
            expect(!visited.has(parent), mapId, '地图层级循环');
            visited.add(parent); parent = doc.maps[parent].parentMap;
        }
    }
    for (const map of Object.values(doc.maps)) {
        if (Object.hasOwn(map.metadata, 'rules') || Object.hasOwn(map.metadata, 'nodeTypes') || Object.hasOwn(map.metadata, 'roadTypes')) validateRules(prepareDocument({ maps: { [map.id]: map } }).maps[map.id]);
    }
    return doc;
}

export function createNode(id, name, options = {}) {
    return { id, name, type: 'landmark', description: '', discovered: true,
        position: { x: null, y: null }, layout: { fixed: false },
        ai: { includeInContext: true, alias: [] }, metadata: {}, ...options };
}
export function createEdge(id, from, to, options = {}) {
    return { id, from, to, type: 'road', name: '', direction: null,
        bidirectional: true, discovered: true, metadata: {}, ...options };
}
export function createMap(id, name, type = 'graph') {
    return { id, name, type, parentMap: null, nodes: {}, edges: [],
        currentLocation: null, view: { x: 0, y: 0, zoom: 1 }, metadata: {} };
}


