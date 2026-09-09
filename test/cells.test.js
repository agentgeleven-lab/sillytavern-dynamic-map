import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyCell,paintCells,cellColor,ensureCells,validateCells,regionName,removeCellRule} from '../src/core/cells.js';
import {createDemoDocument} from '../src/core/demo.js';
import {prepareDocument} from '../src/core/spatial.js';
import {validateDocument} from '../src/core/protocol.js';
import {applyGeneratedMap} from '../src/core/map-generation.js';
import {applyMapExpansion} from '../src/core/map-expansion.js';
import {layoutTiles,applyTilePlacement,tilePlacement} from '../src/core/tiles.js';
const fixture=()=>{const doc=prepareDocument(createDemoDocument());doc.maps.world.type='hex';layoutTiles(doc.maps.world);return doc;};
test('batch painting is sparse and independent of nodes, roads and movement',()=>{
 const doc=fixture(),map=doc.maps.world,before=structuredClone(map);
 paintCells(map,['0,0','1,0'],{...emptyCell(),area:'suburb',terrain:'forest',description:'树林'});
 assert.deepEqual(map.nodes,before.nodes);assert.deepEqual(map.edges,before.edges);assert.equal(Object.keys(map.metadata.cells).length,2);
 const cells=structuredClone(map.metadata.cells),id=Object.keys(map.nodes)[0];applyTilePlacement(map,id,tilePlacement(map,id,{x:1600,y:1600}));assert.deepEqual(map.metadata.cells,cells);
 assert.deepEqual(prepareDocument(JSON.parse(JSON.stringify(doc))),doc);
 paintCells(map,['0,0'],null);assert.equal(map.metadata.cells['0,0'],undefined);assert.ok(map.metadata.cells['1,0']);
});
test('administrative paths, references and cycles are validated',()=>{
 const map=fixture().maps.world;ensureCells(map);map.metadata.cellRules.regions=[{id:'province',name:'省',color:'#123456',parentId:null},{id:'city',name:'市',color:'#234567',parentId:'province'}];
 paintCells(map,['0,0'],{...emptyCell(),region:'city'});assert.equal(regionName(map,'city'),'省 / 市');
 assert.throws(()=>removeCellRule(map,'regions','province'),/使用/);assert.throws(()=>removeCellRule(map,'regions','city'),/使用/);
 map.metadata.cellRules.regions[0].parentId='city';assert.throws(()=>validateCells(map),/循环/);map.metadata.cellRules.regions[0].parentId='missing';assert.throws(()=>validateCells(map),/不存在/);
});
test('invalid cells reject atomically and referenced catalogs cannot be deleted',()=>{
 const map=fixture().maps.world,before=structuredClone(map);
 for(const key of ['01,0','1000001,0','__proto__'])assert.throws(()=>paintCells(map,[key],emptyCell()));assert.deepEqual(map,before);
 assert.throws(()=>paintCells(map,['0,0'],{...emptyCell(),area:'missing'}),/不存在/);assert.deepEqual(map,before);
 assert.throws(()=>paintCells(map,['0,0'],{...emptyCell(),color:'url(https://example.com)'}),/颜色/);
 paintCells(map,['0,0'],{...emptyCell(),area:'urban'});assert.throws(()=>removeCellRule(map,'areas','urban'),/使用/);
 paintCells(map,['0,0'],null);removeCellRule(map,'areas','urban');validateCells(map);
});
test('color overrides and generated locations preserve manually painted cells',()=>{
 const doc=fixture(),map=doc.maps.world;paintCells(map,['-2,3'],{...emptyCell(),area:'suburb',terrain:'forest',color:'#abcdef'});
 assert.equal(cellColor(map,map.metadata.cells['-2,3']),'#abcdef');assert.equal(cellColor(map,{area:'suburb'}),'#9bbd85');
 const generated=applyGeneratedMap(doc,createDemoDocument()),expanded=applyMapExpansion(doc,{nodes:{},edges:[]});
 for(const next of [generated,expanded]){assert.deepEqual(next.maps.world.metadata.cells,map.metadata.cells);assert.deepEqual(next.maps.world.metadata.cellRules,map.metadata.cellRules);validateDocument(next);}
});
