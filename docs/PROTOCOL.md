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
| metadata | 普通 JSON 对象；供扩展使用，不进入摘要。hex/grid 坐标约定尚未定稿 |

ID 不随显示名变化；对象键必须与对象 id 一致；连接只引用同一地图内地点。direction 描述从 from 到 to 的布局方向，允许八方位英文值、up/down 或 null。direction 与 bidirectional 独立，前者是布局提示，后者决定可达方向。parentMap 允许嵌套，但不能形成循环。

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
