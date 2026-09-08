export const THEMES = [{id:'forest',name:'青绿'}, {id:'midnight',name:'深蓝'}, {id:'paper',name:'浅色'}];
export function createPreferences(getContext, storage, namespace) {
    const key='dynamicMapPreferences', fallback=`dynamic-map.preferences:${namespace}`, listeners=new Set();
    let raw=getContext()?.extensionSettings?.[key];
    if(!raw)try{raw=JSON.parse(storage.getItem(fallback)||'null');}catch{}
    let value={messageButtons:raw?.messageButtons!==false,theme:THEMES.some(t=>t.id===raw?.theme)?raw.theme:'forest'};
    return {snapshot:()=>({...value}), update(patch){
        const next={...value,...patch};
        if(typeof next.messageButtons!=='boolean'||!THEMES.some(t=>t.id===next.theme))throw new Error('无效界面设置');
        const ctx=getContext();
        if(ctx?.extensionSettings){ctx.extensionSettings[key]={...next};ctx.saveSettingsDebounced?.();}
        storage.setItem(fallback,JSON.stringify(next));value=next;for(const fn of listeners)fn({...value});
    },subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);}};
}
