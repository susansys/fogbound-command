import {test,expect} from '@playwright/test';
import type {Request,Response} from '../src/transport';
import legacy from '../tests/fixtures/legacy-move.json' with {type:'json'};
test('FB02-S01 defaults to a fixed-station record choice without starting before confirmation',async({page})=>{
  await page.goto('/');
  await expect(page.getByLabel('演练任务')).toHaveValue('FB02-ENG-RECORD');
  await expect(page.getByRole('heading',{name:'记录档案，等待编组完成回报'})).toBeVisible();
  await expect(page.getByTestId('position')).toHaveCount(0);
  await page.getByLabel('时间方式').selectOption('research');
  await page.getByRole('button',{name:'开始演练',exact:true}).click();
  await expect(page.locator('.contextbar')).toContainText('档案 A');
  await expect(page.getByTestId('position')).toHaveText('50.00, 150.00');
  await expect(page.locator('.clock')).toContainText('已暂停');
  await page.reload();
  await expect(page.getByText(/已保存的演练记录 · 工位记录/)).toBeVisible();
  await page.getByRole('button',{name:'接手这场演练',exact:true}).click();
  await expect(page.locator('.contextbar')).toContainText('档案 A');
  await expect(page.locator('.clock')).toContainText('已暂停');
});

test('FB02-S01 creation retry and a conflicting definition do not pause or replace the active command run',async({page})=>{
  await page.addInitScript(()=>{
    const Native=window.Worker;window.Worker=new Proxy(Native,{construct(Target,args){const worker=Reflect.construct(Target,args) as Worker;(window as unknown as {ownWorker:Worker}).ownWorker=worker;return worker;}});
  });
  await page.goto('/');await expect.poll(()=>page.workers().length).toBe(1);
  const result=await page.evaluate(async()=>{
    const worker=(window as unknown as {ownWorker:Worker}).ownWorker;
    const ask=(request:Request)=>new Promise<Response>(resolve=>{
      const request_id=crypto.randomUUID();const listener=(event:MessageEvent<Response>)=>{if(event.data.request_id===request_id){worker.removeEventListener('message',listener);resolve(event.data);}};
      worker.addEventListener('message',listener);worker.postMessage({...request,request_id});
    });
    const creation={kind:'create' as const,definition_ref:'FB01-ENG-MOVE' as const,mode:'command' as const,operation_id:'creation-identity'};
    const first=await ask(creation);if(!first.ok||!first.view)throw Error('initial creation failed');
    const duplicate=await ask(creation);
    const afterDuplicate=await ask({kind:'view',run_id:first.view.run_id});
    const conflict=await ask({...creation,definition_ref:'FB02-ENG-RECORD'});
    const afterConflict=await ask({kind:'view',run_id:first.view.run_id});
    return {first,duplicate,afterDuplicate,conflict,afterConflict};
  });
  expect(result.duplicate.ok&&result.duplicate.view?.run_id).toBe(result.first.ok&&result.first.view?.run_id);
  expect(result.afterDuplicate.ok&&result.afterDuplicate.view?.paused).toBe(false);
  expect(result.conflict).toMatchObject({ok:false,code:'OPERATION_CONFLICT'});
  expect(result.afterConflict.ok&&result.afterConflict.view?.paused).toBe(false);
});

test('FB02-S02 loads the actual FB01 saved package as Move and preserves its original snapshots and creation receipt',async({page})=>{
  await page.addInitScript(()=>{
    const Native=window.Worker;
    window.Worker=new Proxy(Native,{construct(Target,args){
      const worker=Reflect.construct(Target,args) as Worker;
      worker.addEventListener('message',event=>{if(event.data.ok&&Array.isArray(event.data.runs))(window as unknown as {fixtureStoreReady:boolean}).fixtureStoreReady=true;});
      return worker;
    }});
  });
  await page.goto('/');await expect(page.getByLabel('演练任务')).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>(window as unknown as {fixtureStoreReady?:boolean}).fixtureStoreReady===true)).toBe(true);
  await page.evaluate(data=>new Promise<void>((resolve,reject)=>{
    const open=indexedDB.open('fogbound-map-b-game-1');open.onerror=()=>reject(open.error);
    open.onsuccess=()=>{
      const db=open.result,transaction=db.transaction(['runs','snapshots','operations','metadata'],'readwrite');
      for(const table of ['runs','snapshots','operations','metadata'] as const)for(const item of data[table])transaction.objectStore(table).put(item);
      transaction.oncomplete=()=>{db.close();resolve();};transaction.onabort=()=>reject(transaction.error);
    };
  }),legacy);
  await page.reload();
  await expect(page.getByLabel('演练任务')).toHaveValue('FB02-ENG-RECORD');
  await page.getByText(/已保存的演练记录 · 走廊移动/).getByRole('button',{name:'接手这场演练',exact:true}).click();
  await expect(page.locator('.contextbar')).toContainText('目标联络点 T');
  await expect(page.locator('.clock')).toContainText('已暂停');
  const retained=await page.evaluate(()=>new Promise<{snapshots:typeof legacy.snapshots;operations:typeof legacy.operations}>((resolve,reject)=>{
    const open=indexedDB.open('fogbound-map-b-game-1');open.onerror=()=>reject(open.error);
    open.onsuccess=()=>{
      const db=open.result,transaction=db.transaction(['snapshots','operations']),snapshots=transaction.objectStore('snapshots').getAll(),operations=transaction.objectStore('operations').getAll();
      transaction.oncomplete=()=>{db.close();resolve({snapshots:snapshots.result,operations:operations.result});};transaction.onabort=()=>reject(transaction.error);
    };
  }));
  for(const original of legacy.snapshots)expect(retained.snapshots.find(x=>x.key===original.key)).toEqual(original);
  const creation=legacy.operations.find(x=>x.key.startsWith('create:'))!;
  expect(retained.operations.find(x=>x.key===creation.key)).toEqual(creation);
});

test('FB02-S01 a page without the writer lock can read a retained run and return to selection without write controls',async({page,context})=>{
  await page.goto('/');await page.getByLabel('演练任务').selectOption('FB01-ENG-MOVE');await page.getByLabel('时间方式').selectOption('research');
  await page.getByRole('button',{name:'开始演练',exact:true}).click();await expect(page.getByTestId('position')).toBeVisible();
  const reader=await context.newPage();await reader.goto('/');
  await reader.getByRole('button',{name:'查看记录',exact:true}).click();
  await expect(reader.locator('.clock')).toContainText('历史记录 · 只读');
  await expect(reader.getByRole('button',{name:'推进时间',exact:true})).toHaveCount(0);
  await expect(reader.getByRole('button',{name:'重开行动',exact:true})).toBeDisabled();
  await reader.getByRole('button',{name:'返回演练选择',exact:true}).click();
  await expect(reader.getByLabel('演练任务')).toBeVisible();
  await reader.getByRole('button',{name:'开始演练',exact:true}).click();
  await expect(reader.getByRole('alert')).toContainText('另一个窗口正在指挥');
});

test('FB02-S01 shows the fixed H station with readable R/H labels and no Move destination',async({page})=>{
  await page.goto('/');await page.getByLabel('时间方式').selectOption('research');
  await page.getByRole('button',{name:'开始演练',exact:true}).click();
  await expect(page.getByRole('button',{name:'工位H',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'联络点T',exact:true})).toHaveCount(0);
  const unit=await page.getByRole('button',{name:'编组R最后确认位置',exact:true}).boundingBox();
  const station=await page.getByRole('button',{name:'工位H',exact:true}).boundingBox();
  expect(unit).not.toBeNull();expect(station).not.toBeNull();
  expect(station!.y+station!.height).toBeLessThanOrEqual(unit!.y);
  await expect(page.locator('.facts')).toContainText('记录档案');
});

test('FB02-S01 the actual Worker confirms pause of an active run before another create request',async({page})=>{
  await page.addInitScript(()=>{
    const Native=window.Worker;
    window.Worker=new Proxy(Native,{construct(Target,args){
      const worker=Reflect.construct(Target,args) as Worker;
      const state=window as unknown as {ownWorker:Worker;firstRun?:string};state.ownWorker=worker;
      worker.addEventListener('message',event=>{if(event.data.ok&&event.data.view&&!state.firstRun)state.firstRun=event.data.view.run_id;});
      return worker;
    }});
  });
  await page.goto('/');await page.getByLabel('演练任务').selectOption('FB01-ENG-MOVE');
  await page.getByRole('button',{name:'开始演练',exact:true}).click();
  await expect.poll(()=>page.locator('.clock strong').innerText()).not.toBe('00:00');
  const original=await page.evaluate(async()=>{
    const state=window as unknown as {ownWorker:Worker;firstRun:string};
    const ask=(request:Request)=>new Promise<Response>(resolve=>{
      const request_id=crypto.randomUUID();
      const listener=(event:MessageEvent<Response>)=>{if(event.data.request_id===request_id){state.ownWorker.removeEventListener('message',listener);resolve(event.data);}};
      state.ownWorker.addEventListener('message',listener);state.ownWorker.postMessage({...request,request_id});
    });
    const created=await ask({kind:'create',definition_ref:'FB02-ENG-RECORD',mode:'research',operation_id:'worker-switch'});
    if(!created.ok)throw Error(created.code);
    return ask({kind:'view',run_id:state.firstRun});
  });
  expect(original.ok&&original.view?.paused).toBe(true);
});

test('FB02-S01 switches only after confirmed pause and restores the saved Move rather than the current new-scene choice',async({page})=>{
  await page.addInitScript(()=>{
    const state=window as unknown as {scenePause:{stale:boolean;confirmed:boolean}};
    state.scenePause={stale:false,confirmed:false};
    let firstPause=true,agedRequest:string|null=null;
    const Native=window.Worker;
    window.Worker=new Proxy(Native,{construct(Target,args){
      const worker=Reflect.construct(Target,args) as Worker;
      worker.addEventListener('message',(event:MessageEvent)=>{
        if(event.data.request_id===agedRequest)state.scenePause.stale=!event.data.ok&&event.data.code==='STALE_REVISION';
        if(event.data.ok&&event.data.receipt?.kind==='pause')state.scenePause.confirmed=true;
      });
      return new Proxy(worker,{get(target,key){
        const value=Reflect.get(target,key,target);
        if(key==='postMessage')return(input:any)=>{
          if(input.kind==='operate'&&input.envelope.intent.kind==='pause'&&firstPause){
            firstPause=false;agedRequest=input.request_id;
            const release=(event:MessageEvent)=>{
              if(event.data.view?.revision>input.envelope.expected_revision){
                target.removeEventListener('message',release);target.postMessage(input);
              }
            };
            target.addEventListener('message',release);return;
          }
          target.postMessage(input);
        };
        return typeof value==='function'?value.bind(target):value;
      },set(target,key,value){return Reflect.set(target,key,value,target);}});
    }});
  });
  await page.goto('/');
  await page.getByLabel('演练任务').selectOption('FB01-ENG-MOVE');
  await page.getByRole('button',{name:'开始演练',exact:true}).click();
  await expect.poll(()=>page.locator('.clock strong').innerText()).not.toBe('00:00');
  await page.getByRole('button',{name:'更换演练',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>(window as unknown as {scenePause:{stale:boolean;confirmed:boolean}}).scenePause)).toEqual({stale:true,confirmed:true});
  await expect(page.getByText(/已保存的演练记录 · 走廊移动/)).toBeVisible();
  await page.getByLabel('演练任务').selectOption('FB02-ENG-RECORD');
  await page.getByLabel('时间方式').selectOption('research');
  await page.getByRole('button',{name:'开始演练',exact:true}).click();
  await expect(page.locator('.contextbar')).toContainText('档案 A');
  await page.getByRole('button',{name:'更换演练',exact:true}).click();
  await expect(page.getByText(/已保存的演练记录 · 工位记录/)).toBeVisible();
  await page.getByText(/已保存的演练记录 · 走廊移动/).getByRole('button',{name:'接手这场演练',exact:true}).click();
  await expect(page.locator('.contextbar')).toContainText('目标联络点 T');
  await expect(page.locator('.clock')).toContainText('已暂停');
});
