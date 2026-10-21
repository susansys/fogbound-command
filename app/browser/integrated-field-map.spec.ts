import {test,expect,type Page} from '@playwright/test';

async function displayRecord(page:Page,run:string):Promise<{id:string;run_id:string;identity:{geometryDigest:string};preferences:unknown}|null>{
 return page.evaluate(async run=>{const name='fogbound-map-b-display-1';if(!(await indexedDB.databases()).some(database=>database.name===name))return null;return new Promise<{id:string;run_id:string;identity:{geometryDigest:string};preferences:unknown}|null>((resolve,reject)=>{const open=indexedDB.open(name);open.onerror=()=>reject(open.error);open.onsuccess=()=>{const db=open.result,transaction=db.transaction(['heads','records'],'readonly'),head=transaction.objectStore('heads').get(run);transaction.onerror=()=>{db.close();reject(transaction.error);};head.onsuccess=()=>{if(!head.result){db.close();resolve(null);return;}const record=transaction.objectStore('records').get(head.result.id);record.onsuccess=()=>{db.close();resolve(record.result??null);};};};});},run);
}
async function observeMapView(page:Page){await page.addInitScript(()=>{const Native=Worker;window.Worker=new Proxy(Native,{construct(Type,args){const worker=Reflect.construct(Type,args);worker.addEventListener('message',(event:MessageEvent)=>{if(event.data.ok&&event.data.view)Reflect.set(window,'__b33MapView',event.data.view);});return worker;}});});}

test('B33 map foundation uses verified regional terrain without changing action geometry',async({page},info)=>{
 await observeMapView(page);
 await page.goto('/');await page.getByLabel('演练任务').selectOption('INTEGRATED-FIELD-PACK-3');await page.getByLabel('时间方式').selectOption('research');await page.getByRole('button',{name:'开始演练',exact:true}).click();
 const map=page.getByRole('region',{name:'综合现场地图',exact:true});await expect(map).toHaveAttribute('data-regional-state','ready');await expect(map.locator('canvas').first()).toBeVisible();
 const run=await page.evaluate(()=>Reflect.get(window,'__b33MapView').run_id as string);await expect.poll(()=>displayRecord(page,run)).not.toBeNull();expect((await displayRecord(page,run))?.run_id).toBe(run);
 await expect(map).toContainText('局部行动米');await expect(map.getByLabel('虚构区域背景')).toBeChecked();await expect(map.getByLabel('地形显示')).toBeChecked();await expect(map.getByLabel('地点标签')).toBeChecked();
 await map.getByRole('button',{name:'区域全景',exact:true}).click();await expect(map).toContainText('10 × 10 图上公里');await map.getByRole('button',{name:'返回活动范围',exact:true}).click();
 await map.getByLabel('虚构区域背景').uncheck();await expect(map.getByRole('button',{name:'H',exact:true})).toBeVisible();await expect(map.getByRole('button',{name:'A',exact:true})).toBeVisible();await expect(map.getByRole('button',{name:'B',exact:true})).toBeVisible();
 await map.getByLabel('虚构区域背景').check();await map.getByRole('button',{name:'阴影地形',exact:true}).click();await expect(map).toHaveAttribute('data-terrain-mode','shade');
  await map.getByRole('button',{name:'图层设置',exact:true}).click();await map.getByLabel('合成网格显示').check();await expect(map).toHaveAttribute('data-regional-state','ready');await expect(map.locator('.geographic-surface canvas')).toBeVisible();await map.getByLabel('合成网格显示').uncheck();await expect(map).toHaveAttribute('data-regional-state','ready');await map.getByRole('button',{name:'图层设置',exact:true}).click();
 await map.getByRole('button',{name:'地图资料与图例',exact:true}).click();await expect(map).toContainText('人为模拟参照');await expect(map).toContainText('不参与速度、能耗、通行或雾判定');
 await page.screenshot({path:info.outputPath('b33-regional-foundation.png'),fullPage:true});
});

test('B33 map binds new runs after legacy navigation without rewriting prior associations',async({page},info)=>{
 await observeMapView(page);await page.goto('/');await page.getByLabel('演练任务').selectOption('B32-CONFLICTING-ACTION-01');await page.getByLabel('时间方式').selectOption('research');await page.getByRole('button',{name:'开始演练',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>Reflect.get(window,'__b33MapView')?.run_id)).toBeTruthy();const oldRun=await page.evaluate(()=>Reflect.get(window,'__b33MapView').run_id as string);await expect.poll(()=>displayRecord(page,oldRun)).not.toBeNull();const oldRecord=await displayRecord(page,oldRun);
 await page.getByRole('button',{name:'更换演练任务',exact:true}).click();await page.getByLabel('演练任务').selectOption('INTEGRATED-FIELD-PACK-3');await page.getByRole('button',{name:'开始演练',exact:true}).click();const map=page.getByRole('region',{name:'综合现场地图',exact:true});await expect(map).toHaveAttribute('data-regional-state','ready');
 const run=await page.evaluate(()=>Reflect.get(window,'__b33MapView').run_id as string);expect(run).not.toBe(oldRun);await expect.poll(()=>displayRecord(page,run)).not.toBeNull();const created=await displayRecord(page,run);expect(created?.run_id).toBe(run);expect(created?.identity.geometryDigest).not.toBe(oldRecord?.identity.geometryDigest);expect(await displayRecord(page,oldRun)).toEqual(oldRecord);
 // A deliberate renderer fault exposes the actual explicit rebind control;
 // it is a fault injection, not proof of a physical GPU failure.
 await map.locator('canvas').first().evaluate(canvas=>canvas.dispatchEvent(new Event('webglcontextlost',{cancelable:true})));await expect(map).toHaveAttribute('data-regional-state','unavailable');await map.getByRole('button',{name:'重新关联当前区域',exact:true}).click();await expect(map).toHaveAttribute('data-regional-state','ready');
 const rebound=await displayRecord(page,run);expect(rebound?.run_id).toBe(run);expect(rebound?.id).not.toBe(created?.id);expect(await displayRecord(page,oldRun)).toEqual(oldRecord);await info.attach('actual-separate-run-map-associations.json',{body:JSON.stringify({oldRun,run,oldRecord,created,rebound,oldAfter:await displayRecord(page,oldRun),renderer_fault:'synthetic contextlost'}),contentType:'application/json'});
});
