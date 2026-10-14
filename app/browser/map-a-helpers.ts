import {expect,type Page} from '@playwright/test';
import type {PlayerView} from '../src/contracts';
import type {Request} from '../src/transport';

export type GameTrace={requests:Request[];views:PlayerView[]};
export async function observeGame(page:Page){
  // Observe the real public Worker/Transport seam; never replace a response or world.
  await page.addInitScript(()=>{
    const trace={requests:[],views:[]} as GameTrace;
    (window as unknown as {mapGameTrace:GameTrace}).mapGameTrace=trace;
    const Native=window.Worker;
    window.Worker=new Proxy(Native,{construct(Target,args){
      const worker=Reflect.construct(Target,args) as Worker;
      if(String(args[0]).includes('/assets/worker-')){
        const post=worker.postMessage.bind(worker);
        worker.postMessage=(message:Request,options?:StructuredSerializeOptions|Transferable[])=>{trace.requests.push(structuredClone(message));if(Array.isArray(options))post(message,options);else post(message,options);};
        worker.addEventListener('message',(event:MessageEvent)=>{if(event.data.ok&&event.data.view)trace.views.push(structuredClone(event.data.view));});
      }
      return worker;
    }});
  });
}
export async function trace(page:Page):Promise<GameTrace>{return page.evaluate(()=>(window as unknown as {mapGameTrace:GameTrace}).mapGameTrace);}
export async function start(page:Page,definition='ENG-PRESTART-REPLACE',mode:'research'|'command'='research'){
  await page.goto('/');await page.getByLabel('演练任务').selectOption(definition);await page.getByLabel('时间方式').selectOption(mode);
  await page.getByRole('button',{name:'开始演练',exact:true}).click();await expect(page.locator('.map canvas')).toHaveCount(1);
}
export async function enableSynthetic(page:Page){
  await page.getByRole('button',{name:'地图图层',exact:true}).click();await page.getByRole('checkbox',{name:'合成验证底图',exact:true}).check();
  await expect(page.locator('.map')).toHaveAttribute('data-renderer','synthetic-ready');await page.getByRole('button',{name:'地图图层',exact:true}).click();
}
