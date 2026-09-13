export const MAP_REGEX_ID = '29a3974c-00c7-4b47-bb0b-053c8d3a457c';
export const MAP_REGEX = Object.freeze({
    id: MAP_REGEX_ID,
    scriptName: '动态地图 · 隐藏正文更新块',
    findRegex: '/<map_update>[\\s\\S]*?<\\/map_update>/g',
    replaceString: '', trimStrings: [], placement: [2],
    disabled: false, markdownOnly: true, promptOnly: false,
    runOnEdit: true, substituteRegex: 0, minDepth: null, maxDepth: null,
});

function settings(getContext) {
    const ctx = getContext();
    if (!ctx?.extensionSettings || typeof ctx.saveSettingsDebounced !== 'function') throw Error('当前酒馆缺少正则设置保存接口');
    const list = ctx.extensionSettings.regex;
    if (list !== undefined && !Array.isArray(list)) throw Error('酒馆正则列表格式异常，未修改');
    if ((list ?? []).filter(x => x?.id === MAP_REGEX_ID).length > 1) throw Error('发现重复的地图正则 ID，请先在酒馆正则设置中整理');
    return {ctx, list:list ?? []};
}

export function inspectMapRegex(getContext) {
    const {ctx,list} = settings(getContext), entry = list.find(x => x?.id === MAP_REGEX_ID);
    return {exists:!!entry, message:ctx.extensionSettings.disabledExtensions?.includes('regex') ? '酒馆正则扩展已关闭，请先手动启用' : !entry ? '尚未添加隐藏正则' : Object.entries(MAP_REGEX).every(([k,v])=>JSON.stringify(entry[k])===JSON.stringify(v)) ? '隐藏正则已添加并启用' : '地图正则已被修改或禁用，可点击重新添加恢复'};
}

/** Global display-only rule: never modifies chat.mes or generation input. */
export async function syncMapRegex(getContext, remove = false) {
    const {ctx,list} = settings(getContext);
    if (!remove && ctx.extensionSettings.disabledExtensions?.includes('regex')) throw Error('请先在酒馆中启用正则扩展，再添加地图正则');
    const index = list.findIndex(x=>x?.id===MAP_REGEX_ID), next = list.slice();
    if (remove) { if(index<0)return '没有本插件添加的正则，无需删除'; next.splice(index,1); }
    else if(index<0)next.push(structuredClone(MAP_REGEX));
    else next[index]={...list[index],...structuredClone(MAP_REGEX)};
    if(JSON.stringify(next)===JSON.stringify(list))return '隐藏正则已是最新，无需重复添加';
    const previous=ctx.extensionSettings.regex;
    ctx.extensionSettings.regex=next;
    try { await ctx.saveSettingsDebounced(); }
    catch { if(ctx.extensionSettings.regex===next)ctx.extensionSettings.regex=previous;throw Error('正则保存请求失败，请重试'); }
    return (remove?'已移除地图隐藏正则':'已添加地图隐藏正则')+'；已请求保存设置。刷新聊天显示可更新已有消息';
}
