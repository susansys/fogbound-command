import {test,expect,type Page} from '@playwright/test';
import {observeGame,trace,start,enableSynthetic} from './map-a-helpers';

for(const fault of ['missing','hash','mapping','geometry','gl-init','context-loss'])test(`MA10 ${fault} falls back to selectable public Pixi/text without a Game operation`,async({page})=>{
  if(fault==='gl-init')await page.addInitScript(()=>{const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(this:HTMLCanvasElement,id:string,options?:unknown){if(id==='webgl2'&&this.closest('.geographic-surface'))return null;return Reflect.apply(get,this,[id,options]);} as typeof get;});
  if(fault==='geometry')await page.addInitScript(()=>{
    const Native=window.Worker;window.Worker=new Proxy(Native,{construct(Target,args){const worker=Reflect.construct(Target,args) as Worker;if(!String(args[0]).includes('/assets/worker-'))return worker;
      return new Proxy(worker,{get(target,key){const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;},set(target,key,value){if(key==='onmessage'){target.onmessage=(event:MessageEvent)=>{const data=structuredClone(event.data);if(data.ok&&data.view)data.view.geometry.extent=[401,300];value(new MessageEvent('message',{data}));};return true;}return Reflect.set(target,key,value,target);}});
    }});
  });
  await observeGame(page);await start(page);const before=await trace(page);
  if(fault==='missing')await page.route('**/assets/grid-*.png',route=>route.fulfill({status:404,body:'unavailable'}));
  if(fault==='hash')await page.route('**/assets/grid-*.png',async route=>{const response=await route.fetch(),bytes=await response.body();bytes[bytes.length-1]^=1;await route.fulfill({response,body:bytes});});
  if(fault==='mapping')await page.route('**/assets/manifest-*.json',async route=>{const response=await route.fetch(),body=await response.json();body.mapping.image_corners[0][0]+=0.001;await route.fulfill({response,json:body});});
  await page.getByRole('button',{name:'地图图层',exact:true}).click();await page.getByRole('checkbox',{name:'合成验证底图',exact:true}).click();
  if(fault==='context-loss'){
    await expect(page.locator('.map')).toHaveAttribute('data-renderer','synthetic-ready');
    const lost=await page.locator('.geographic-surface canvas').evaluate((element)=>{const gl=(element as HTMLCanvasElement).getContext('webgl2')!,extension=gl.getExtension('WEBGL_lose_context');if(!extension)return false;extension.loseContext();return true;});expect(lost).toBe(true);
  }
  await expect(page.locator('.map-fallback')).toContainText('已返回原示意图');await expect(page.locator('.map')).toHaveAttribute('data-renderer','pixi');await expect(page.locator('.map canvas')).toHaveCount(1);
  await page.getByRole('button',{name:'地图图层',exact:true}).click();await page.locator('.map-objects').getByRole('button',{name:'N · 联络点',exact:true}).click();await expect(page.locator('.inspector .facts')).toContainText('110.00, 150.00');
  const after=await trace(page);expect(after.requests.slice(before.requests.length)).toEqual([]);expect(after.views.at(-1)).toEqual(before.views.at(-1));
});

test('MA11 delayed old-run image cannot replace a real restarted run, restored same-run state or readonly history',async({page})=>{
  await watchDisplayResources(page);await observeGame(page);await start(page);
  const original=(await trace(page)).views.at(-1)!;
  let release!:()=>void,entered!:()=>void;const held=new Promise<void>(resolve=>{release=resolve;}),requested=new Promise<void>(resolve=>{entered=resolve;});let first=true;
  await page.route('**/assets/grid-*.png',async route=>{if(first){first=false;entered();await held;}await route.continue();});
  await page.getByRole('button',{name:'地图图层',exact:true}).click();await page.getByRole('checkbox',{name:'合成验证底图',exact:true}).check();await requested;
  await page.getByRole('button',{name:'重开行动',exact:true}).click();await page.getByRole('button',{name:'确认重开',exact:true}).click();
  await expect.poll(async()=>(await trace(page)).views.at(-1)?.run_id).not.toBe(original.run_id);
  await expect(page.locator('.map')).toHaveAttribute('data-renderer','synthetic-ready');release();
  await expect(page.locator('.map canvas')).toHaveCount(1);await expect(page.locator('.map-fallback')).toHaveCount(0);
  const fresh=(await trace(page)).views.at(-1)!;expect(fresh.source_run).toBe(original.run_id);expect(fresh.position).toEqual(original.position);
  await page.getByRole('button',{name:'地图图层',exact:true}).click();
  await page.getByRole('button',{name:'任务调度',exact:true}).click();await page.getByRole('button',{name:'查看通行预案',exact:true}).click();await page.getByRole('button',{name:'下达通行命令',exact:true}).click();await page.getByRole('button',{name:'确认下达',exact:true}).click();await expect(page.getByTestId('frozen-command').locator('article')).toHaveCount(1);
  await page.getByLabel('推进至秒').fill('7');await page.getByRole('button',{name:'推进时间',exact:true}).click();await expect(page.locator('.clock strong')).toHaveText('00:07');
  await page.getByRole('button',{name:'态势地图',exact:true}).click();await enableSynthetic(page);const saved=(await trace(page)).views.at(-1)!;
  await page.getByRole('button',{name:'保存记录',exact:true}).click();await expect(page.getByRole('status')).toContainText('已保存');
  await page.reload();await page.getByRole('button',{name:'接手这场演练',exact:true}).click();await expect(page.locator('.clock strong')).toHaveText('00:07');await expect(page.locator('.clock')).toContainText('已暂停');
  const restored=(await trace(page)).views.at(-1)!;expect(restored.run_id).toBe(saved.run_id);expect(restored.position).toEqual(saved.position);expect(restored.resources).toEqual(saved.resources);expect(restored.issued_orders).toEqual(saved.issued_orders);await enableSynthetic(page);
  await page.getByLabel('推进至秒').fill('120');await page.getByRole('button',{name:'推进时间',exact:true}).click();await expect(page.locator('.clock strong')).toHaveText('00:22.900');const completed=(await trace(page)).views.at(-1)!;
  expect(completed.resources).toMatchObject({hq_energy:15,equipment_energy:10,movement_energy:19});expect(completed.log.filter(entry=>entry.kind==='complete_receipt')).toHaveLength(1);
  await page.getByRole('button',{name:'行动复盘',exact:true}).click();await page.getByLabel('回看时刻（秒）').fill('0');await page.getByRole('button',{name:'查看当时情况',exact:true}).click();await expect(page.locator('.clock')).toContainText('历史记录 · 只读');await page.getByRole('button',{name:'态势地图',exact:true}).click();await enableSynthetic(page);
  await expect(page.getByTestId('position')).toContainText('50.00');await expect(page.locator('.map canvas')).toHaveCount(1);expect((await trace(page)).views.at(-1)?.position.x).toBe(50);
  await page.getByRole('button',{name:'返回当前行动',exact:true}).click();await expect(page.locator('.clock strong')).toHaveText('00:22.900');await expect(page.getByTestId('position')).toContainText('110.00');await expect(page.locator('.map canvas')).toHaveCount(1);
});

type DisplayResources={blobs:number;workers:number;workerUrls:string[];observations:number};
async function watchDisplayResources(page:Page){
  // Observe native lifecycle resources; do not replace rendering or Game responses.
  await page.addInitScript(()=>{
    const blobs=new Set<string>(),workers=new Map<Worker,string>();
    const create=URL.createObjectURL.bind(URL),revoke=URL.revokeObjectURL.bind(URL);
    URL.createObjectURL=object=>{const url=create(object);blobs.add(url);return url;};URL.revokeObjectURL=url=>{blobs.delete(url);revoke(url);};
    const Native=Worker;window.Worker=new Proxy(Native,{construct(Target,args){const worker=Reflect.construct(Target,args) as Worker;workers.set(worker,String(args[0]));const terminate=worker.terminate.bind(worker);worker.terminate=()=>{workers.delete(worker);terminate();};return worker;}});
    const observations=new Map<ResizeObserver,Set<Element>>(),NativeObserver=ResizeObserver;
    window.ResizeObserver=new Proxy(NativeObserver,{construct(Target,args){const observer=Reflect.construct(Target,args) as ResizeObserver,targets=new Set<Element>();observations.set(observer,targets);const observe=observer.observe.bind(observer),unobserve=observer.unobserve.bind(observer),disconnect=observer.disconnect.bind(observer);observer.observe=(target,options)=>{targets.add(target);observe(target,options);};observer.unobserve=target=>{targets.delete(target);unobserve(target);};observer.disconnect=()=>{targets.clear();disconnect();};return observer;}});
    (window as unknown as {displayResources:()=>DisplayResources}).displayResources=()=>({blobs:blobs.size,workers:workers.size,workerUrls:[...workers.values()],observations:[...observations.values()].reduce((sum,targets)=>sum+targets.size,0)});
  });
}
async function displayResources(page:Page){return page.evaluate(()=>(window as unknown as {displayResources:()=>DisplayResources}).displayResources());}

test('MA11 delayed image is ignored and map canvas/observers/blobs release with only the bounded SDK global Worker',async({page})=>{
  await watchDisplayResources(page);await observeGame(page);await start(page);const baseline=await displayResources(page),before=await trace(page);
  let release!:()=>void,entered!:()=>void;const held=new Promise<void>(resolve=>{release=resolve;}),requested=new Promise<void>(resolve=>{entered=resolve;});let first=true;
  await page.route('**/assets/grid-*.png',async route=>{if(first){first=false;entered();await held;}await route.continue();});
  await page.getByRole('button',{name:'地图图层',exact:true}).click();await page.getByRole('checkbox',{name:'合成验证底图',exact:true}).check();await requested;
  await page.getByRole('checkbox',{name:'合成验证底图',exact:true}).uncheck();await expect(page.locator('.map')).toHaveAttribute('data-renderer','pixi');await expect(page.locator('.map canvas')).toHaveCount(1);
  await page.getByRole('checkbox',{name:'合成验证底图',exact:true}).check();await expect(page.locator('.map')).toHaveAttribute('data-renderer','synthetic-ready');release();
  await expect(page.locator('.map canvas')).toHaveCount(1);await expect(page.locator('.map-fallback')).toHaveCount(0);
  await page.getByRole('checkbox',{name:'合成验证底图',exact:true}).uncheck();
  // MapLibre6.14.0 getGlobalDispatcher retains ONE SDK-global resource Worker.
  // It is not a per-Map instance; subsequent removals must return to this same bounded state.
  await expect.poll(async()=>{const resources=await displayResources(page);return {blobs:resources.blobs,observations:resources.observations,sdk:resources.workerUrls.filter(url=>url.includes('maplibre-gl-worker')).length,game:resources.workerUrls.filter(url=>url.includes('/assets/worker-')).length};}).toEqual({blobs:baseline.blobs,observations:baseline.observations,sdk:1,game:1});
  const released=await displayResources(page);
  for(let count=0;count<3;count++){
    await page.getByRole('checkbox',{name:'合成验证底图',exact:true}).check();await expect(page.locator('.map')).toHaveAttribute('data-renderer','synthetic-ready');
    await page.getByRole('checkbox',{name:'合成验证底图',exact:true}).uncheck();await expect(page.locator('.map canvas')).toHaveCount(1);await expect.poll(()=>displayResources(page)).toEqual(released);
  }
  const after=await trace(page);expect(after.requests.slice(before.requests.length)).toEqual([]);expect(after.views.at(-1)).toEqual(before.views.at(-1));
});
