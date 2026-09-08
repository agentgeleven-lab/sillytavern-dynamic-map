# SillyTavern 动态地图 · 0.1.0

第一阶段：可扩展的数据核心 + SVG 节点地图最小演示。纯 JavaScript ES Modules，无第三方运行依赖、无需构建。

## 安装与打开

推荐在酒馆「扩展 → 安装扩展」中输入仓库地址：

```text
https://github.com/agentgeleven-lab/sillytavern-dynamic-map
```

安装完成后刷新页面，在扩展设置找到「动态地图」并点击「🗺 打开地图」。也可以手动安装：

1. 解压交付 ZIP，将整个 `sillytavern-dynamic-map` 文件夹复制到酒馆的 `data/<用户标识>/extensions/` 下；或安装给所有用户，放在 `public/scripts/extensions/third-party/` 下。两种方式只选一种。
2. 确认路径为 `…/sillytavern-dynamic-map/manifest.json`，不要多嵌套一层文件夹。
3. 刷新酒馆页面，在扩展设置中找到「动态地图」，点击「🗺 打开地图」。若扩展被禁用，请在扩展管理中启用后刷新。
4. 应看到青云宗、龙门市、白沙镇，山路和官道两条连接；龙门市有金色光圈和「当前位置」标记。点击节点查看描述，右上角 × 或 Esc 关闭。

扩展安装框应填写上面的 GitHub 仓库地址，不能填写本地 ZIP 路径。卸载时删除上述插件目录并刷新即可，本版没有写入聊天或全局设置。

## 本版边界

- 已完成：v1 协议、运行时校验、原子更新、状态订阅、graph SVG 面板、地点详情、摘要导出、可选适配器注册接口。
- 已预留：hex / grid 类型、地图层级、ViewState、空坐标与固定坐标、方向提示、AI 白名单更新入口、可替换存储接口。
- 尚未实现：缩放/拖拽交互、方向自动布局、聊天独立保存与切换、实际小白X/状态栏桥接、模型消息解析和 Tool Calling 注册。
- 数据只在本次页面中存在，刷新会恢复示例。切换聊天仍显示同一份演示数据，不能用作真实剧情的持久地图。
- hex / grid 可通过协议校验，但面板会显示尚未实现提示。位置为空时使用简单排列占位，不解释地理方向。
- 当前仅内存存储；`src/adapters/memory.js` 是未来仓储契约的示例，尚未接入酒馆聊天。

## 文件结构

```text
manifest.json / index.js       酒馆加载与设置入口
src/core/protocol.js           协议类型、工厂、引用及数值校验
src/core/demo.js               三地点示例数据
src/core/store.js              原子命令与状态订阅
src/core/selectors.js          地点查询与摘要投影
src/ui/graph.js / panel.js     SVG 渲染与面板生命周期
src/integrations/api.js        可选桥接与未来 AI 更新边界
src/adapters/memory.js         异步 load/save 存储契约示例
docs/PROTOCOL.md               字段约定和 API 用法
demo.html                     独立浏览器演示
test/                         核心行为检查
```

## 本地检查与独立演示

在插件目录运行（Node.js 18 或更高，不用 npm install）：

```sh
npm run check
npm test
python -m http.server 8765 --bind 127.0.0.1
```

打开 `http://127.0.0.1:8765/demo.html`，点击「打开地图」。请通过 HTTP 访问，直接双击 HTML 可能因浏览器的模块安全限制而失败。

独立页复用真实入口和渲染代码，但不等于 SillyTavern 运行验证。实际酒馆验收还需确认入口可见、面板可开关、无控制台错误、手机窄屏可读。

## 后续开发顺序

1. 在渲染器与 ViewState 上接入缩放、拖拽；独立布局模块计算坐标，保留固定节点。
2. 增加聊天仓储适配器，通过当前上下文读取 chatMetadata，在 CHAT_CHANGED 时切换 store；处理异步保存与聊天切换竞态。
3. 根据实际小白X/状态栏版本编写桥接，仅发布摘要，状态栏使用 API 的 open 打开地图。
4. 给 Tool Calling 增加参数 schema、能力检测及聊天作用域检查，将已解析命令交给 applyUpdate。
5. 增加 hex / grid 渲染器与类型专用数据；不支持的新协议版本先迁移再加载。

扩展加载方式与上下文入口参考：[SillyTavern 官方 UI 扩展文档](https://docs.sillytavern.app/for-contributors/writing-extensions/)（2026-09-08 核对）。
