import { attachNavigation } from './navigation.js';
const NS = 'http://www.w3.org/2000/svg';
function svgElement(tag, attrs = {}, text) {
    const element = document.createElementNS(NS, tag);
    for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, String(value));
    if (text !== undefined) element.textContent = text;
    return element;
}

/** Presentation-only fallback, not geographic auto-layout. Does not mutate nodes. */
export function positions(nodes) {
    return new Map(nodes.map((node, index) => [node.id, node.position.x === null
        ? { x: 130 + (index % 4) * 170, y: 100 + Math.floor(index / 4) * 130 }
        : node.position]));
}

export function renderGraph(map, onSelect, navigation) {
    const nodes = Object.values(map.nodes).filter(node => node.discovered);
    const points = positions(nodes);
    const svg = svgElement('svg', { viewBox: '0 0 720 480', class: 'dm-svg', role: 'group', 'aria-label': `${map.name}，${nodes.length} 个已发现地点` });
    const viewport = svgElement('g', { transform: `translate(${map.view.x} ${map.view.y}) scale(${map.view.zoom})`, 'data-layer': 'viewport' });
    const edges = svgElement('g', { 'data-layer': 'edges' });
    for (const edge of map.edges) {
        if (!edge.discovered || !points.has(edge.from) || !points.has(edge.to)) continue;
        const a = points.get(edge.from), b = points.get(edge.to);
        const group = svgElement('g', { class: 'dm-edge', 'data-edge-id': edge.id });
        group.append(svgElement('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y }));
        if (!edge.bidirectional) {
            const x = a.x + (b.x - a.x) * 0.68, y = a.y + (b.y - a.y) * 0.68;
            const angle = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
            group.append(svgElement('path', { d: 'M -10 -6 L 0 0 L -10 6', transform: `translate(${x} ${y}) rotate(${angle})`, fill: 'none', stroke: '#d6c885', 'stroke-width': 3 }));
        }
        group.append(svgElement('text', { x: (a.x + b.x) / 2 + 16, y: (a.y + b.y) / 2 - 14 }, `${edge.name}${edge.bidirectional ? '' : ' →'}`));
        edges.append(group);
    }
    const locations = svgElement('g', { 'data-layer': 'nodes' });
    for (const node of nodes) {
        const point = points.get(node.id), current = map.currentLocation === node.id;
        const group = svgElement('g', { transform: `translate(${point.x} ${point.y})`, class: `dm-node${current ? ' dm-current' : ''}`, 'data-node-id': node.id,
            role: 'button', tabindex: 0, 'aria-label': `${node.name}${current ? '，当前位置' : ''}，查看地点详情` });
        group.append(svgElement('title', {}, node.description));
        if (current) group.append(svgElement('circle', { r: 38, class: 'dm-halo' }));
        group.append(svgElement('circle', { r: 25, class: 'dm-dot' }));
        group.append(svgElement('text', { y: 6, class: 'dm-symbol' }, node.type === 'sect' ? '▲' : node.type === 'city' ? '◆' : '●'));
        group.append(svgElement('text', { y: 60, class: 'dm-name' }, node.name));
        if (current) group.append(svgElement('text', { y: -50, class: 'dm-current-label' }, '当前位置'));
        if (!navigation) group.addEventListener('click', () => onSelect(node));
        group.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(node); }
        });
        locations.append(group);
    }
    viewport.append(edges, locations); svg.append(viewport);
    if (navigation) svg.dmCleanup = attachNavigation(svg, map, points, { ...navigation, select: onSelect });
    return svg;
}
