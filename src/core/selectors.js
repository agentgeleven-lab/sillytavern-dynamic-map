export const getActiveMap = state => state.maps[state.activeMap];
export const getCurrentLocation = state => {
    const map = getActiveMap(state);
    return map.currentLocation === null ? null : map.nodes[map.currentLocation];
};
export function getNearbyLocations(state) {
    const map = getActiveMap(state);
    const ids = new Set();
    for (const edge of map.edges) {
        if (!edge.discovered) continue;
        if (edge.from === map.currentLocation) ids.add(edge.to);
        if (edge.bidirectional && edge.to === map.currentLocation) ids.add(edge.from);
    }
    return [...ids].map(id => map.nodes[id]).filter(node => node.discovered);
}
/** Small context export; never export the full document through variables. */
export function getSummary(state) {
    const map = getActiveMap(state);
    const current = getCurrentLocation(state);
    const visibleCurrent = current?.ai.includeInContext ? current : null;
    return { 'rpg.map.id': map.id, 'rpg.map.name': map.name,
        'rpg.map.current': visibleCurrent?.id ?? null,
        'rpg.map.current_name': visibleCurrent?.name ?? null,
        'rpg.map.nearby': getNearbyLocations(state).filter(n => n.ai.includeInContext).map(n => ({ id: n.id, name: n.name })),
    };
}
