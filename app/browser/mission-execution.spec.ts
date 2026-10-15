import {test,expect,type Page} from '@playwright/test';

async function begin(page:Page){
  await page.goto('/');await page.getByLabel('演练任务').selectOption('B22-MISSION-01');await page.getByLabel('时间方式').selectOption('research');await page.getByRole('button',{name:'开始演练',exact:true}).press('Enter');
  await page.getByLabel('任务目的',{exact:true}).fill('核对两处联络点');await page.getByLabel('期望结果',{exact:true}).fill('总部收到两阶段合法抵达凭证');
  await page.getByRole('button',{name:'预览任务',exact:true}).press('Enter');await expect(page.getByTestId('mission-preview')).toBeVisible();await page.getByRole('button',{name:'保存草案',exact:true}).press('Enter');await expect(page.getByTestId('mission-save-state')).toContainText('已保存版本 1');
}
async function issue(page:Page,id:string){await page.getByRole('button',{name:'核对当前阶段',exact:true}).press('Enter');await expect(page.getByRole('button',{name:'确认下达 '+id,exact:true})).toBeEnabled();await page.getByRole('button',{name:'确认下达 '+id,exact:true}).press('Enter');await expect(page.getByTestId('issued-plan-line')).toHaveCount(id==='P1'?1:2);}
async function advance(page:Page,seconds:string){await page.getByLabel('推进到时刻（秒）').fill(seconds);await page.getByRole('button',{name:'推进到该时刻',exact:true}).press('Enter');await expect(page.getByRole('button',{name:'推进到该时刻',exact:true})).toBeEnabled();}

for(const [width,height] of [[1366,768],[1920,1080]])test(`B22 lawful received reports distinguish acceptance and goal confirmation at ${width}`,async({page})=>{
  await page.setViewportSize({width,height});await begin(page);await issue(page,'P1');
  await advance(page,'2');await expect(page.getByTestId('mission-orders')).toContainText('接令已知');await expect(page.getByTestId('mission-orders')).toContainText('等待完成回报，结果尚未确认');
  await advance(page,'30.5');await expect(page.getByTestId('mission-orders')).toContainText('等待完成回报，结果尚未确认');await expect(page.getByTestId('mission-phase-results')).not.toContainText('P1 · 版本 1 · 合法抵达已确认');
  await advance(page,'31.5');await expect(page.getByTestId('mission-phase-results')).toContainText('P1 · 版本 1 · 合法抵达已确认');
  await page.getByRole('button',{name:'情报报告',exact:true}).press('Enter');await expect(page.getByTestId('mission-reports')).toContainText('抵达回报');await expect(page.getByTestId('mission-reports')).toContainText('源事件时间：未知');await expect(page.getByTestId('mission-reports')).toContainText('观察时刻');await expect(page.getByTestId('mission-reports')).toContainText('发送时刻');await expect(page.getByTestId('mission-reports')).toContainText('总部收到');
  await expect(page.getByTestId('mission-report')).toHaveCount(2);
  await page.getByRole('button',{name:'任务规划',exact:true}).press('Enter');await advance(page,'32');await issue(page,'P2');
  await advance(page,'62.5');await expect(page.getByTestId('mission-orders')).toContainText('等待完成回报，结果尚未确认');await expect(page.getByTestId('mission-readiness')).not.toContainText('移动目标已确认');
  await advance(page,'63.5');await expect(page.getByTestId('mission-readiness')).toContainText('移动目标已确认');await expect(page.getByTestId('mission-phase-results')).toContainText('P2 · 版本 1 · 合法抵达已确认');await expect(page.getByTestId('mission-resources')).toContainText('移动能量 18 · 联络能量 12 · 总部能量 14');
  await page.getByRole('button',{name:'情报报告',exact:true}).press('Enter');await expect(page.getByTestId('mission-report')).toHaveCount(4);await expect(page.getByTestId('mission-reports')).toContainText('来源 R → 总部');
});

test('B22 an already received pause has its turn before a queued automatic tick',async({page})=>{
  await page.addInitScript(()=>{
    const times:Record<string,{sent:number;received?:number}>={};
    const Native=window.Worker,requests:Array<{kind:string;request_id:string;envelope?:{intent:{kind:string}}}>=[],responses:Array<{request_id:string;ok:boolean;code?:string;view?:{sim_time:number;paused:boolean;run_id:string}}>=[];
    class Observed extends Native{
      constructor(url:string|URL,options?:WorkerOptions){
        const actual=String(url),owned=actual.includes('/assets/worker-');
        // Delay one real readonly IDB result, never its value or a write. The
        // public read holds the Worker queue while a natural 250ms tick queues.
        const prefix=`import ${JSON.stringify(actual)};let arm=false;const receive=self.onmessage;self.onmessage=function(e){if(e.data?.kind==='view'&&String(e.data.request_id).startsWith('queue-read-'))arm=true;return receive.call(this,e);};const get=IDBObjectStore.prototype.get;const success=Object.getOwnPropertyDescriptor(IDBRequest.prototype,'onsuccess');IDBObjectStore.prototype.get=function(...args){const request=get.apply(this,args);if(arm&&this.name==='runs'&&this.transaction.mode==='readonly'&&this.transaction.db.name==='fogbound-map-b-game-1'){arm=false;let handler=null;Object.defineProperty(request,'onsuccess',{configurable:true,get:()=>handler,set:callback=>{handler=callback;success.set.call(request,typeof callback==='function'?event=>setTimeout(()=>callback.call(request,event),800):callback);}});}return request;};`;
        super(owned?URL.createObjectURL(new Blob([prefix],{type:'text/javascript'})):url,options);
        if(owned){Reflect.set(window,'__b22QueueWorker',this);const post=this.postMessage.bind(this);this.postMessage=(message:typeof requests[number])=>{times[message.request_id]={sent:performance.now()};requests.push(structuredClone(message));post(message);};this.addEventListener('message',event=>{if(times[event.data.request_id])times[event.data.request_id].received=performance.now();responses.push(structuredClone(event.data));});}
      }
    }
    window.Worker=Observed;Reflect.set(window,'__b22QueueTrace',{requests,responses,times});
  });
  await page.goto('/');await page.getByLabel('演练任务').selectOption('B22-MISSION-01');await page.getByLabel('时间方式').selectOption('command');await page.getByRole('button',{name:'开始演练',exact:true}).press('Enter');await expect(page.getByRole('button',{name:'暂停行动',exact:true})).toBeEnabled();
  await page.evaluate(()=>{
    const t=Reflect.get(window,'__b22QueueTrace') as {responses:Array<{ok:boolean;view?:{run_id:string}}>},worker=Reflect.get(window,'__b22QueueWorker') as Worker,run=[...t.responses].reverse().find(r=>r.ok&&r.view)?.view?.run_id;if(!run)throw Error('Real current run absent');
    Reflect.set(window,'__b22QueueReadStarted',performance.now());worker.postMessage({kind:'view',run_id:run,request_id:'queue-read-'+crypto.randomUUID()});
  });
  await page.waitForTimeout(350);await page.getByRole('button',{name:'暂停行动',exact:true}).press('Enter');await expect(page.getByRole('button',{name:'继续行动',exact:true})).toBeEnabled();
  const trace=await page.evaluate(()=>Reflect.get(window,'__b22QueueTrace') as {times:Record<string,{sent:number;received:number}>;requests:Array<{request_id:string;kind:string;envelope?:{intent:{kind:string}}}>;responses:Array<{request_id:string;ok:boolean;code?:string;view?:{sim_time:number;paused:boolean}}>});
  const requests=trace.requests.filter(r=>r.kind==='operate_mission'&&r.envelope?.intent.kind==='pause');const probe=trace.requests.find(r=>r.request_id.startsWith('queue-read-'))!;expect(trace.times[probe.request_id].received-trace.times[probe.request_id].sent).toBeGreaterThanOrEqual(750);expect(trace.times[requests[0].request_id].sent).toBeLessThan(trace.times[probe.request_id].received);expect(requests).toHaveLength(1);expect(trace.responses.find(r=>r.request_id===requests[0].request_id)).toMatchObject({ok:true,view:{paused:true}});
  const read=trace.responses.find(r=>r.request_id.startsWith('queue-read-'));expect(read?.ok).toBe(true);expect(trace.responses.find(r=>r.request_id===requests[0].request_id)!.view!.sim_time).toBeGreaterThan(read!.view!.sim_time);
});
