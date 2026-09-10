# 地图协议与扩展接口 v1

数据由 `version: 1`、`activeMap: string`、`maps: Record<ID, Map>` 组成。当前只接受版本 1；未知版本报错，不能直接按旧结构读取。协议类型也写在 `src/core/protocol.js` 的 JSDoc 中。

| 对象 | 字段与约定 |
| --- | --- |
| Map | id、name、type（graph/hex/grid）、parentMap（地图 ID 或 null）、nodes、edges、currentLocation、view、metadata |
| Node | id、name、type（自由字符串）、description、discovered、position、layout、ai、metadata |
| Edge | id、from、to、type、name、direction、bidirectional、discovered、metadata |
| CurrentLocation | 每张地图保存一个地点 ID 或 null；非空时必须存在且已发现 |
| ViewState | 存储在 Map.view：x、y 为有限数值；zoom 为大于 0 的有限数值 |
| position | x/y 同时为 null 表示等待布局；否则同时为有限数值，graph 单位为 SVG 用户坐标 |
| layout | fixed 布尔值；为 true 时必须有具体坐标 |
| ai | includeInContext 布尔值、alias 字符串数组；摘要排除未发现及不允许进入上下文的地点 |
| metadata | 普通 JSON 对象；供扩展使用，不进入摘要。格子坐标约定见下方 |

ID 不随显示名变化；对象键必须与对象 id 一致；连接只引用同一地图内地点。direction 描述从 from 到 to 的布局方向，允许 16 方位英文值、up/down 或 null。direction 与 bidirectional 独立，前者是布局提示，后者决定可达方向。parentMap 允许嵌套，但不能形成循环。

核心拒绝缺失必填字段、重复连接 ID、悬空引用、无效坐标、保留原型字段和非 JSON 数据。upsert 接收完整对象，不是字段补丁；可用 createNode/createEdge 工厂补全默认值。新增地图可通过核心 store.replace 完整载入经校验的文档，尚未公开为 AI 命令。

## 公共 API

插件加载后提供 `window.SillyTavernDynamicMap`。返回的数据是副本，直接修改副本不会改变地图。API 给同页面可信扩展使用，本版没有模型消息监听、自动执行或跨窗口 postMessage 桥接。

```js
const map = window.SillyTavernDynamicMap;
map.open();
map.getActiveMap();
map.getCurrentLocation();
map.getNearbyLocations();
map.getSummary();
map.setCurrentLocation('qingyun_sect');
const unsubscribe = map.subscribe(document => console.log(document.activeMap));
unsubscribe();
```

小白X和状态栏通过真实适配代码注册摘要接收器：

```js
const detach = map.registerSummaryAdapter({
    async publish(summary) {
        // 在这里调用已经确认的小白X或状态栏 API。
        console.log(summary);
    },
});
// 不再需要时 detach();
```

注册后发送一次初始摘要，然后按变更顺序发送。错误记录到控制台，不中断核心。注销取消后续排队发布，但不能撤销已经开始的外部写入。异步适配器应尽快完成。

摘要键：rpg.map.id、rpg.map.name、rpg.map.current、rpg.map.current_name、rpg.map.nearby（仅 ID/名称数组）。旅行状态尚未建模，不导出伪造的目的地或行进状态。隐藏地图名称等更细粒度策略可在未来桥接层加入。

## AI / Tool Calling 更新边界

```js
map.applyUpdate([
    { type: 'setCurrentLocation', mapId: 'world', nodeId: 'baisha_town' },
    { type: 'setView', mapId: 'world', view: { x: 0, y: 0, zoom: 1 } },
]);
```

支持 setActiveMap、setCurrentLocation、setView、upsertNode、upsertEdge。mapId 省略时使用该批次执行到此时的 activeMap。整批在副本上运行，最终校验通过后一次提交；任一操作失败，原状态保留且不发送变更事件。允许先添加连接再在同批次补上节点。未知操作报错，不接受任意代码、JSON 路径写入或 eval。

未来模型适配层负责解析结构化参数、检查授权和聊天归属，再调用此入口。这里的校验是数据完整性校验，不是 AI 调用授权系统。同步订阅中禁止反向修改 store，避免循环更新；桥接默认只向外发布。

## v0.3 持久化与编辑补充

协议仍为 version:1。新增 removeNode（级联移除边，必要时清空 currentLocation）和 removeEdge 命令。聊天绑定无效时 applyUpdate 拒绝提交。完整 JSON 导入经校验及用户确认后替换；聊天切换令导入令牌失效。

存储层在 chatMetadata.dynamicMapV1 中保存 `{updatedAt, document}` 信封；导出的正常 JSON 只包含 document，不含窗口位置和保存信封。导出损坏数据用于诊断时可能是原始信封，需修复后提取有效 document 再导入。

视图坐标为 SVG 用户坐标，拖动节点保存 position 并设 layout.fixed=true。方向自动布局尚未实现。store.replace 是存储层内部入口，外部集成继续使用公共 applyUpdate。

## v0.4 编辑规则扩展

`map.metadata.rules` 包含 `segmentDistance`（正数）、`unit`（距离单位）、`methods`（非空数组，每项 id/name/speed，speed 为距离单位/小时）。`map.metadata.nodeTypes` 是可编辑的 id/name 类型目录，节点类型必须属于目录。

`edge.direction` 是从 from 到 to 的 16 罗盘方向之一；反向查询使用相反方位。旧的 null/up/down 在草稿准备时按已有坐标迁移到平面方位；旧数据直到保存才写回。

图上每段长度 160，与真实距离无关。`waypoint` 是普通节点的一种类型，显示为小圆点；可连接任意数量的边。插入途经点后用两条边替换一条边，每段继承原路线类型和单向设置，因此真实总距离也变成两倍。

已保存状态与编辑草稿完全分离。相机平移缩放只属于窗口，不触发状态订阅或变量变更。外部 API 更新已保存状态时保留其原有语义，若存在脏草稿则标记冲突。

## v0.5 行为（替代 v0.4 的拖动限定）

地图规则新增 metadata.roadTypes：道路固定类型的 id/name 目录。旧路线自由文本类型在草稿准备时加入目录保留。地点和道路类型管理均位于规则页。

placementPlan/applyPlacement 实现自由拖动：在 224 图上单位以内选择任意最近地点，释放时吸附到其可用 16 方位并保留/建立唯一连接；外侧自由落点断开所有旧连接。预览点使用连续指针坐标，吸附目标单独标出。老 snapPlan 保留为历史辅助函数，新界面不调用它。

界面偏好由 src/ui/preferences.js 管理，独立于地图文档。消息末尾按钮仅为 UI，打开当前已保存地图，不写消息正文，也不保存历史楼层快照。

AI 素材适配位于 src/adapters/sources.js；使用 selected_world_info 增加已开启全局世界书，不使用 world_names 读取全部已保存书籍。

## v0.6.1 消息窗口

消息按钮在对应消息下方挂载完整地图面板。使用普通文档流，不定位到屏幕边缘。所有面板共享当前聊天的草稿会话和当前浏览器的 API 会话密钥；关闭面板移除其订阅，插件整体卸载时才销毁共享草稿。生成中的面板关闭后不再应用生成结果。


## v0.8.0 格子与层级

所有形态使用 Node.position.x/y 作为 SVG 中心坐标，不增加重复坐标来源。grid 的列行 q/r 对应 x=160q、y=160r；hex 使用尖顶六边形轴坐标，x=160(q+r/2)、y=160√3r/2，边长为 160/√3。q/r 为整数，可为负，绝对值上限 1000000。空坐标在准备文档时分配空格。格子底图根据可见范围绘制，不将空格持久化。道路实际 distance 独立于坐标。

格子移动不改变拓扑，更新路线的 16 方位描述并清除 metadata.directionLocked。layout.pinned 继续禁止拖动；形态转换会吸附坐标，多个固定地点落在同一格时拒绝转换。metadata.layout.mode 为 cells。

Map.parentMap 引用上级地图；可选 Map.metadata.parentNode 引用该上级内入口地点。父级与入口必须存在，层级不能成环。道路端点仍局限同一地图。v0.10.0 导航仅修改窗口浏览状态，activeMap 表示角色所在地图，不因浏览改变。AI 整图结果只替换当前 Map 并恢复原 ID/父级/入口；其他地图保留。入口缺失时报错，避免生成删除子地图入口。


## v0.9.0 格子属性

可选 Map.metadata.cells 为稀疏对象，键是标准化的 `q,r` 整数坐标，范围各为 ±1000000。值包含六个字符串字段：area、terrain、region、name、description、color。前三者为空或引用当前地图目录 ID，color 为空或 #RRGGBB。最多 10000 格；未记录的格子没有属性。

可选 Map.metadata.cellRules 包含 areas、terrains、regions 三个数组，每类最多 500 项。条目为 {id,name,color}，行政区域增加 parentId（上级区域 ID 或 null）。禁止悬空引用与循环；在格子中使用或存在下级的条目不得删除。无规则时采用默认区域与地形目录。与 Map.parentMap 地图导航层级独立。

坐标是格子身份；切换 hex/grid 保留 q/r，切换 graph 仅隐藏属性。颜色为独立颜色 > 区域类型 > 地形 > 行政区域。AI 完整生成由插件恢复原有 cells/cellRules，新增模式也保留两者；格子资料不进入当前对外地点摘要，不触发移动或道路距离换算。


## v0.10.0 浏览范围与生成范围

浏览地图 ID 不再写入文档。activeMap + 对应 Map.currentLocation 标识角色位置；外部 setActiveMap 是显式更改角色地图，已保存摘要仍读取 activeMap。祖先视图沿 parentMap/metadata.parentNode 投影当前位置。旧存档不猜测历史位置，沿用存储的 activeMap。

Map.metadata.generationLevel 记录最近生成层级（world/region/city/site/interior/custom），仅用于提示词范围，不决定形态或行政归属。生成时临时以目标地图构造输入，结果合并后恢复角色地图 ID。生成新子地图时只有通过校验的结果才加入草稿。导航修订号、草稿令牌及聊天令牌共同防止迟到响应错位应用。

草稿提供 applyGeneration/undoGeneration，一份生成前快照仅在未发生后续编辑或保存时可撤销，所有窗口共用草稿检查。保存提交全部地图；角色地图变更也参与冲突检查。


## v0.11.0 变量与状态栏适配

公共接口新增 getIntegrationSummary、getIntegrationStatus、openCurrentLocation、requestMove。getIntegrationSummary 仅提供已绑定且已保存地图的摘要；关闭状态栏联动时返回 null。requestMove 接收 {请求ID,地图版本,地图ID,地点ID}，要求 allowMoves 开启且版本精确匹配当前 dynamicMapV1.updatedAt。调用原子的 setActiveMap + setCurrentLocation，不是批量任意状态修改。

聊天变量「地图」只保存摘要，来源为“动态地图插件”。仅此命名空间由适配器刷新，不改变状态栏或其他变量。地图移动请求是独立输入；初始化与聊天切换时记录基线，避免重放旧请求。实际执行前验证聊天、版本、目标。默认不开启反向请求。状态栏适配组件通过 WorldStatusHudMapBridge.version=1 公布检测能力，不依赖 DOM 猜测。

位置历史保存于 chatMetadata.dynamicMapPositionHistoryV1，records 按消息 extra.dynamic_map_message_id + swipe_id 标识，sequence 记录上次楼层顺序；只保存 mapId/nodeId，不进入模型变量。不含地图拓扑的历史快照。


## Native Tool Calling v0.12

Optional adapter uses getContext().registerFunctionTool/unregisterFunctionTool, with shouldRegister gating and stealth:false. Query schema: {mapId?:string}. Update schema: {token:string,reason:string,operations:Operation[]} (1–30, total <=50000 characters). Every operation requires op/mapId/id. Node add/update accept name/description/type; add requires name. Edge add/update accept name/type/direction/distance/bidirectional; add also requires from/to. Remove and move accept only op/mapId/id. Unknown fields are rejected. Names and IDs are strings, type IDs must be in map catalogs; node descriptions and supplied text are bounded to 4000 characters. No executable code or arbitrary document replacement is accepted.

Query tokens are ephemeral and invalidated by chat binding, committed state, draft revision or settings changes. AI draft ownership prevents overwriting manual drafts. Updates compile on a cloned, normalized document and perform layout and full protocol validation before the draft/commit boundary. No new dependency is added to core modules. Settings live in extensionSettings.dynamicMapTools (enabled/autoSave/allowDelete, all false by default). Tool results distinguish applied:true from pending draft; host persistence errors remain reported by the existing persistence adapter.
