const entries = data => Object.values(data??{}).filter(e=>e&&!e.disable&&e.enabled!==false&&typeof e.content==='string'&&e.content.trim()).map(e=>({标题:e.comment||e.name||'',关键词:e.key||e.keys||[],内容:e.content}));
/** Pure, injected reader for testability. No writes to cards, books or chat. */
export async function collectMapSources(ctx, wi, {includeGlobal=false, guard=()=>{}, maxChars=200000}={}) {
    guard();
    if(ctx.groupId!=null)throw new Error('请在单角色聊天中生成地图，群聊暂不支持角色素材读取');
    const character=ctx.characters?.[ctx.characterId];if(!character)throw new Error('请先打开角色卡的聊天');
    const cd=character.data??{}, card={};
    for(const [key,label]of [['name','名称'],['description','描述'],['personality','性格'],['scenario','场景'],['first_mes','开场白'],['mes_example','对话示例'],['creator_notes','作者备注']])card[label]=cd[key]??character[key]??'';
    const names=new Set(),add=name=>{if(typeof name==='string'&&name.trim())names.add(name);};
    add(cd.extensions?.world);
    const filename=String(character.avatar??'').replace(/\.[^.]+$/,'');
    const extra=wi.world_info?.charLore?.find(x=>x.name===filename);for(const name of extra?.extraBooks??[])add(name);
    add(ctx.chatMetadata?.[wi.METADATA_KEY??'world_info']);
    if(includeGlobal){if(!Array.isArray(wi.selected_world_info))throw new Error('酒馆未提供已开启的全局世界书列表');wi.selected_world_info.forEach(add);}
    const source={角色卡:card,世界书:[]};
    const checkSize=()=>{if(JSON.stringify(source).length>maxChars)throw new Error(`角色卡与世界书超过 ${maxChars} 字符，请取消读取全局世界书或减少绑定素材；未截断内容，也未开始生成`);};
    checkSize();
    for(const name of names){guard();if(typeof wi.loadWorldInfo!=='function')throw new Error('酒馆缺少世界书读取接口');const book=await wi.loadWorldInfo(name);guard();if(!book?.entries)throw new Error(`世界书「${name}」读取失败，未开始生成`);source.世界书.push({名称:name,条目:entries(book.entries)});checkSize();}
    if(!cd.extensions?.world&&cd.character_book?.entries){source.世界书.push({名称:cd.character_book.name||'角色卡内嵌世界书',条目:entries(cd.character_book.entries)});checkSize();}
    return {source,books:source.世界书.map(b=>b.名称),characters:JSON.stringify(source).length};
}
export async function readMapSources(ctx, options) {
    const wi=await import('/scripts/world-info.js');
    return collectMapSources(ctx,wi,options);
}

