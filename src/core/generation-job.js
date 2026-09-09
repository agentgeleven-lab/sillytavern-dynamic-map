/** Stop waiting immediately on cancellation, even if a host promise never settles. */
export function waitForSignal(task,signal){
    if(signal?.aborted)return Promise.reject(abortReason(signal));
    if(!signal)return Promise.resolve().then(task);
    return new Promise((resolve,reject)=>{
        const abort=()=>{signal.removeEventListener('abort',abort);reject(abortReason(signal));};signal.addEventListener('abort',abort,{once:true});
        Promise.resolve().then(()=>{if(signal.aborted)throw abortReason(signal);return task();})
            .then(resolve,reject).finally(()=>signal.removeEventListener('abort',abort));
    });
}
function abortReason(signal){return signal.reason instanceof Error&&signal.reason.name==='Error'?signal.reason:new Error('已取消生成，未应用结果');}
export function startGenerationJob({timeoutMs,onTick=()=>{}}){
    const controller=new AbortController(),started=Date.now();let stage='读取角色卡与世界书',finished=false;
    const report=()=>onTick({stage,seconds:Math.floor((Date.now()-started)/1000)});
    const ticker=setInterval(report,1000),timer=setTimeout(()=>controller.abort(new Error('生成总等待超时，已停止等待；地图未修改。可缩小世界书范围或检查模型服务后重试')),timeoutMs);
    return {signal:controller.signal,setStage(text){stage=text;report();},
        check(){if(controller.signal.aborted)throw abortReason(controller.signal);},
        cancel(message='已取消生成，未应用结果'){controller.abort(new Error(message));},
        wait(task){return waitForSignal(task,controller.signal);},
        finish(){if(finished)return;finished=true;clearInterval(ticker);clearTimeout(timer);},
    };
}
