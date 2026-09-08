/** UI-only message controls: never insert anything into message text or stored chat. */
export function installMessageButtons(open, preferences, root=document, surface=globalThis.__TAURITAVERN__?.api?.chatSurface) {
    const mounted=new Map();let disposed=false,queued=false;
    function mount(element){
        if(disposed||mounted.has(element))return mounted.get(element)?.dispose;
        const host=root.createElement('div');host.className='dm-message-map';
        const b=root.createElement('button');b.type='button';b.className='dm-message-button';b.textContent='🗺 地图';b.title='打开当前聊天已保存的地图';b.addEventListener('click',open);host.append(b);
        (element.querySelector('.mes_block')??element).append(host);
        const dispose=()=>{host.remove();mounted.delete(element);};mounted.set(element,{host,dispose});reflect();return dispose;
    }
    function reflect(){const p=preferences.snapshot();for(const {host}of mounted.values()){host.hidden=!p.messageButtons;host.dataset.theme=p.theme;}}
    const managed=surface?.isManagedOwnershipRequired?.()===true;
    let unregister;
    if(managed){unregister=surface.registerParticipant({id:'dynamic-map/message-button',protocolVersion:surface.protocolVersion,didMount:({element})=>mount(element)});}
    function refresh(){if(disposed)return;for(const [element,item]of mounted)if(!element.isConnected)item.dispose();if(!managed)for(const element of root.querySelectorAll('#chat .mes[mesid]'))mount(element);reflect();}
    const off=preferences.subscribe(reflect);
    const observer=new MutationObserver(()=>{if(queued||disposed)return;queued=true;queueMicrotask(()=>{queued=false;refresh();});});
    // Only child changes; updates to visibility/theme must not trigger an observer loop.
    if(!managed)observer.observe(root.querySelector('#chat')??root.body,{childList:true,subtree:true});
    refresh();return {refresh,destroy(){disposed=true;off();observer.disconnect();if(typeof unregister==='function')unregister();else unregister?.dispose?.();for(const item of [...mounted.values()])item.dispose();}};
}
