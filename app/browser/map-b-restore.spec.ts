import {test,expect} from '@playwright/test';
import {observeGame,trace,start} from './map-a-helpers';

test('MB20 a restored explicit rebind confirmed after readback uncertainty uses current association audit without rejecting the older restore source',async({page})=>{
 await page.addInitScript(()=>{(window as any).ownedRebindReadFailure=false;let nextRead=false;const native=IDBDatabase.prototype.transaction;
  IDBDatabase.prototype.transaction=function(this:IDBDatabase,...args:any[]){if(this.name==='fogbound-map-b-display-1'&&args[1]!=='readwrite'&&nextRead){nextRead=false;throw new DOMException('owned rebind readback failure','UnknownError');}const tx=Reflect.apply(native,this,args);if(this.name==='fogbound-map-b-display-1'&&args[1]==='readwrite'&&(window as any).ownedRebindReadFailure){(window as any).ownedRebindReadFailure=false;tx.addEventListener('complete',()=>nextRead=true,{once:true});}return tx;} as typeof IDBDatabase.prototype.transaction;
 });
 await observeGame(page);await start(page,'FB02-ENG-RECORD');await expect(page.locator('.display-record-status')).toContainText('地图关联已保存');
 await page.evaluate(()=>new Promise<void>((resolve,reject)=>{const open=indexedDB.open('fogbound-map-b-display-1');open.onerror=()=>reject(open.error);open.onsuccess=()=>{const db=open.result,tx=db.transaction('records','readwrite'),store=tx.objectStore('records'),read=store.getAll();read.onsuccess=()=>{const record=read.result[0];record.identity.version=2;store.put(record);};tx.oncomplete=()=>{db.close();resolve();};};}));
 await page.reload();await page.getByRole('button',{name:'接手这场演练',exact:true}).click();await expect(page.locator('.map')).toHaveAttribute('data-region-state','unavailable');const restored=(await trace(page)).views.at(-1)!;
 await page.evaluate(()=>(window as any).ownedRebindReadFailure=true);await page.getByRole('button',{name:'重新关联当前区域',exact:true}).click();await expect(page.locator('.display-record-status')).toContainText('待核查');await page.getByRole('button',{name:'核查地图保存结果',exact:true}).click();await expect(page.locator('.map')).toHaveAttribute('data-region-state','ready');expect((await trace(page)).views.at(-1)).toEqual(restored);
 await page.getByRole('button',{name:'任务调度',exact:true}).click();await page.getByRole('button',{name:'态势地图',exact:true}).click();await expect(page.locator('.map')).toHaveAttribute('data-region-state','ready');expect((await trace(page)).views.at(-1)).toEqual(restored);
});

test('MB19 a real queued display write that is definitively cancelled allows explicit rebind without reload',async({page})=>{
 await page.goto('/');await page.evaluate(()=>new Promise<void>((resolve,reject)=>{const open=indexedDB.open('fogbound-map-b-display-1',10);open.onupgradeneeded=()=>{open.result.createObjectStore('records',{keyPath:'id'}).createIndex('run_id','run_id');open.result.createObjectStore('heads',{keyPath:'run_id'});};open.onerror=()=>reject(open.error);open.onsuccess=()=>{const db=open.result,tx=db.transaction(['records','heads'],'readonly'),store=tx.objectStore('heads');(window as any).ownedQueueHold=true;const keep=()=>{if(!(window as any).ownedQueueHold)return;const request=store.get('__hold__');request.onsuccess=keep;};keep();tx.oncomplete=()=>db.close();resolve();};}));
 await page.getByLabel('时间方式').selectOption('research');await page.getByRole('button',{name:'开始演练',exact:true}).click();await expect(page.locator('.display-record-status')).toContainText('正在保存');
 await page.getByRole('button',{name:'任务调度',exact:true}).click();await page.evaluate(()=>(window as any).ownedQueueHold=false);await page.waitForTimeout(150);await page.getByRole('button',{name:'态势地图',exact:true}).click();await expect(page.locator('.map')).toHaveAttribute('data-region-state','unavailable');
 await page.getByRole('button',{name:'重新关联当前区域',exact:true}).click();await expect(page.locator('.map')).toHaveAttribute('data-region-state','ready');await expect(page.locator('.clock')).toContainText('已暂停');
});

async function holdOwnedDisplayDatabase(page:import('@playwright/test').Page){
 await page.addInitScript(()=>{const active=new Set<ImageBitmap>(),native=createImageBitmap;(window as any).ownedMapImages=()=>active.size;window.createImageBitmap=(async(...args:any[])=>{const image=await Reflect.apply(native,window,args);active.add(image);const close=image.close.bind(image);image.close=()=>{active.delete(image);close();};return image;}) as typeof createImageBitmap;});
 await page.goto('/');await page.evaluate(()=>new Promise<void>((resolve,reject)=>{const open=indexedDB.open('fogbound-map-b-display-1',9);open.onupgradeneeded=()=>{open.result.createObjectStore('records',{keyPath:'id'}).createIndex('run_id','run_id');open.result.createObjectStore('heads',{keyPath:'run_id'});};open.onerror=()=>reject(open.error);open.onsuccess=()=>{(window as any).ownedBlockedDB=open.result;open.result.onversionchange=()=>{};resolve();};}));
 await page.getByLabel('时间方式').selectOption('research');await page.getByRole('button',{name:'开始演练',exact:true}).click();await expect.poll(()=>page.evaluate(()=>(window as any).ownedMapImages())).toBe(34);
}
test('MB24 actual blocked display DB cannot retain decoded images after map unmount',async({page})=>{
 await holdOwnedDisplayDatabase(page);await page.getByRole('button',{name:'任务调度',exact:true}).click();await expect.poll(()=>page.evaluate(()=>(window as any).ownedMapImages())).toBe(0);
 await page.evaluate(()=>(window as any).ownedBlockedDB.close());
});

test('MB19 a real held map readback does not hold the confirmed Game save or management pause controls',async({page})=>{
 await page.addInitScript(()=>{
  (window as any).ownedHoldMapReadback=false;const native=IDBDatabase.prototype.transaction;
  IDBDatabase.prototype.transaction=function(this:IDBDatabase,...args:any[]){const tx=Reflect.apply(native,this,args);if(this.name==='fogbound-map-b-display-1'&&args[1]!=='readwrite'&&(window as any).ownedHoldMapReadback){const store=tx.objectStore(tx.objectStoreNames[0]);const keep=()=>{if(!(window as any).ownedHoldMapReadback)return;const request=store.get('__owned_hold__');request.onsuccess=keep;};keep();}return tx;} as typeof IDBDatabase.prototype.transaction;
 });
 await start(page,'FB02-ENG-RECORD','command');await expect(page.locator('.display-record-status')).toContainText('地图关联已保存');
 await page.evaluate(()=>(window as any).ownedHoldMapReadback=true);await page.getByRole('button',{name:'保存记录',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'已保存至'})).toBeVisible();
 await expect(page.getByRole('button',{name:'暂停',exact:true})).toBeEnabled({timeout:2000});await page.getByRole('button',{name:'暂停',exact:true}).click();await expect(page.locator('.clock')).toContainText('已暂停');
 await expect(page.locator('.display-record-status')).toContainText('正在保存');await page.evaluate(()=>(window as any).ownedHoldMapReadback=false);await expect(page.locator('.display-record-status')).toContainText('地图关联已保存');
});
test('MB21 actual blocked display DB fails within its local bound and explicit rebind leaves Game paused',async({page})=>{
 test.setTimeout(25000);await holdOwnedDisplayDatabase(page);await expect(page.locator('.map')).toHaveAttribute('data-region-state','unavailable',{timeout:17000});await expect.poll(()=>page.evaluate(()=>(window as any).ownedMapImages())).toBe(0);
 await page.evaluate(()=>(window as any).ownedBlockedDB.close());await page.getByRole('button',{name:'重新关联当前区域',exact:true}).click();await expect(page.locator('.map')).toHaveAttribute('data-region-state','ready');await expect(page.locator('.clock')).toContainText('已暂停');
});

test('MB19 a timed-out head read before rebind never becomes a permanently unknown write',async({page})=>{
 test.setTimeout(45000);await holdOwnedDisplayDatabase(page);await expect(page.locator('.map')).toHaveAttribute('data-region-state','unavailable',{timeout:17000});
 await page.getByRole('button',{name:'重新关联当前区域',exact:true}).click();await expect(page.locator('.display-record-status')).toContainText(/待核查|尚未写入/,{timeout:17000});
 await page.evaluate(()=>(window as any).ownedBlockedDB.close());await page.getByRole('button',{name:'重新关联当前区域',exact:true}).click();await expect(page.locator('.map')).toHaveAttribute('data-region-state','ready');
});

test('MB19 two concurrent real readbacks confirm the same pending map record without erasing it',async({page})=>{
 await page.addInitScript(()=>{
  (window as any).ownedFailRead=false;(window as any).ownedHoldReads=false;(window as any).ownedHeldReads=0;const native=IDBDatabase.prototype.transaction;
  IDBDatabase.prototype.transaction=function(this:IDBDatabase,...args:any[]){if(this.name==='fogbound-map-b-display-1'&&args[1]!=='readwrite'&&(window as any).ownedFailRead){(window as any).ownedFailRead=false;throw new DOMException('owned readback failure','UnknownError');}const tx=Reflect.apply(native,this,args);if(this.name==='fogbound-map-b-display-1'&&args[1]!=='readwrite'&&(window as any).ownedHoldReads){(window as any).ownedHeldReads++;const store=tx.objectStore(tx.objectStoreNames[0]),keep=()=>{if(!(window as any).ownedHoldReads)return;store.get('__held__').onsuccess=keep;};keep();}return tx;} as typeof IDBDatabase.prototype.transaction;
 });
 await start(page,'FB02-ENG-RECORD');await expect(page.locator('.display-record-status')).toContainText('地图关联已保存');await page.evaluate(()=>(window as any).ownedFailRead=true);await page.getByRole('button',{name:'保存记录',exact:true}).click();await expect(page.locator('.display-record-status')).toContainText('待核查');
 await page.evaluate(()=>{(window as any).ownedHoldReads=true;(window as any).ownedStatusMessages=[];new MutationObserver(()=>{(window as any).ownedStatusMessages.push(document.querySelector('.display-record-status')?.textContent);}).observe(document.querySelector('.display-record-status')!,{childList:true,subtree:true,characterData:true});});await page.getByRole('button',{name:'地图图层',exact:true}).click();const button=page.getByRole('button',{name:'核查地图保存结果',exact:true});await button.click();await button.click();await expect.poll(()=>page.evaluate(()=>(window as any).ownedHeldReads)).toBe(2);await page.evaluate(()=>(window as any).ownedHoldReads=false);
 await expect(page.locator('.map')).toHaveAttribute('data-region-state','ready');await expect(page.locator('.display-record-status')).toContainText(/已核查保存|已保存并读回核验/);
 expect(await page.evaluate(()=>(window as any).ownedStatusMessages)).not.toContain('地图关联仍无法核查；不重复写入。');
});

test('MB21 a stalled local tile has a bounded failure and explicit repair does not continue Game',async({page})=>{
 test.setTimeout(25000);let release!:()=>void;const held=new Promise<void>(resolve=>release=resolve);let count=0;
 await page.route('**/assets/surface-0-0-*.png',async route=>{count++;await held;try{await route.continue();}catch{}});
 await observeGame(page);await start(page,'FB02-ENG-RECORD');
 await expect(page.locator('.map')).toHaveAttribute('data-region-state','unavailable',{timeout:17000});
 const before=await trace(page);expect(count).toBe(1);release();await page.unroute('**/assets/surface-0-0-*.png');
 await page.getByRole('button',{name:'修复本地地图显示',exact:true}).click();await expect(page.locator('.map')).toHaveAttribute('data-region-state','ready');
 const after=await trace(page);expect(after.requests.slice(before.requests.length)).toEqual([]);expect(after.views.at(-1)).toEqual(before.views.at(-1));await expect(page.locator('.clock')).toContainText('已暂停');
});

test('MB24 late old-run tiles cannot replace a real clone and all native per-map images release across workspace cycles',async({page})=>{
 await page.addInitScript(()=>{const native=window.createImageBitmap,active=new Set<ImageBitmap>();(window as any).ownedMapImages=()=>active.size;window.createImageBitmap=(async(...args:any[])=>{const image=await Reflect.apply(native,window,args);active.add(image);const close=image.close.bind(image);image.close=()=>{active.delete(image);close();};return image;}) as typeof createImageBitmap;});
 let release!:()=>void,entered!:()=>void;const held=new Promise<void>(r=>release=r),requested=new Promise<void>(r=>entered=r);let first=true;
 await page.route('**/assets/surface-0-0-*.png',async route=>{if(first){first=false;entered();await held;}try{await route.continue();}catch{}});
 await observeGame(page);await start(page,'FB02-ENG-RECORD');await requested;const original=(await trace(page)).views.at(-1)!;
 await page.getByRole('button',{name:'重开行动',exact:true}).click();await page.getByRole('button',{name:'确认重开',exact:true}).click();await expect(page.locator('.map')).toHaveAttribute('data-region-state','ready');const clone=(await trace(page)).views.at(-1)!;expect(clone.source_run).toBe(original.run_id);expect(clone.run_id).not.toBe(original.run_id);
 release();await page.waitForTimeout(150);await expect(page.locator('.map')).toHaveAttribute('data-map-run',clone.run_id);await expect(page.locator('.map canvas')).toHaveCount(1);await expect.poll(()=>page.evaluate(()=>(window as any).ownedMapImages())).toBe(34);
 for(let n=0;n<3;n++){await page.getByRole('button',{name:'任务调度',exact:true}).click();await expect.poll(()=>page.evaluate(()=>(window as any).ownedMapImages())).toBe(0);await page.getByRole('button',{name:'态势地图',exact:true}).click();await expect(page.locator('.map')).toHaveAttribute('data-region-state','ready');await expect.poll(()=>page.evaluate(()=>(window as any).ownedMapImages())).toBe(34);await expect(page.locator('.map canvas')).toHaveCount(1);}
 expect((await trace(page)).views.at(-1)).toEqual(clone);
});

test('MB20 uncertain real restore has no invented source revision and retry confirms the original idempotent receipt',async({page})=>{
 test.setTimeout(25000);
 await page.addInitScript(()=>{
  const Native=Worker;(window as any).ownedRestores=[];let hidden=false;
  window.Worker=new Proxy(Native,{construct(Target,args){const worker=Reflect.construct(Target,args) as Worker;worker.addEventListener('message',event=>{if(event.data?.receipt?.kind==='restore')(window as any).ownedRestores.push(structuredClone(event.data.receipt));});
   return new Proxy(worker,{get(target,key){const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;},set(target,key,value){if(key==='onmessage'){target.onmessage=(event:MessageEvent)=>{if(event.data?.receipt?.kind==='restore'&&!hidden){hidden=true;return;}value(event);};return true;}return Reflect.set(target,key,value,target);}});
  }});
 });
 await start(page,'FB02-ENG-RECORD');await expect(page.locator('.display-record-status')).toContainText('地图关联已保存');await page.getByRole('button',{name:'保存记录',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'已保存至'})).toBeVisible();
 await page.reload();await page.getByRole('button',{name:'接手这场演练',exact:true}).click();await expect(page.getByRole('button',{name:'接手这场演练',exact:true})).toBeEnabled({timeout:12000});await expect(page.locator('.display-record-status')).toHaveCount(0);
 await page.getByRole('button',{name:'接手这场演练',exact:true}).click();await expect(page.locator('.map')).toHaveAttribute('data-region-state','ready');const receipts=await page.evaluate(()=>(window as any).ownedRestores);expect(receipts).toHaveLength(2);expect(receipts[1]).toEqual(receipts[0]);
 await expect(page.locator('.display-record-status')).toContainText(`真实恢复快照 ${receipts[0].snapshot_revision}`);
});

test('MB20 a newer committed Game snapshot restores with the original constant map identity and exact saved preferences',async({page})=>{
 await page.addInitScript(()=>{
  (window as any).ownedRestoreReceipts=[];const Native=Worker;window.Worker=new Proxy(Native,{construct(Target,args){const worker=Reflect.construct(Target,args) as Worker;worker.addEventListener('message',event=>{if(event.data?.ok&&event.data.receipt)(window as any).ownedRestoreReceipts.push(structuredClone(event.data.receipt));});return worker;}});
 });
 await observeGame(page);await start(page,'FB02-ENG-RECORD');
 await expect(page.locator('.map')).toHaveAttribute('data-region-state','ready');await expect(page.locator('.display-record-status')).toContainText('地图关联已保存');
 const first=(await trace(page)).views.at(-1)!;
 await page.getByRole('button',{name:'地图图层',exact:true}).click();await page.getByLabel('地形表现',{exact:true}).selectOption('shade');await page.getByRole('button',{name:'区域全景（仅背景阅读）',exact:true}).click();await page.getByRole('button',{name:'地图图层',exact:true}).click();
 const camera=await page.locator('.map').getAttribute('data-camera');
 await page.getByLabel('推进至秒').fill('2');await page.getByRole('button',{name:'推进时间',exact:true}).click();await expect(page.locator('.clock strong')).toHaveText('00:02');
 await page.getByRole('button',{name:'保存记录',exact:true}).click();await expect(page.locator('.display-record-status')).toContainText('地图关联已保存');
 const saved=(await trace(page)).views.at(-1)!;expect(saved.revision).toBeGreaterThan(first.revision);
 await page.reload();await page.getByRole('button',{name:'接手这场演练',exact:true}).click();
 await expect(page.locator('.map')).toHaveAttribute('data-region-state','ready');await expect(page.locator('.map')).toHaveAttribute('data-terrain-mode','shade');
 expect(await page.locator('.map').getAttribute('data-camera')).toBe(camera);
 const restored=(await trace(page)).views.at(-1)!;expect(restored.run_id).toBe(saved.run_id);expect(restored.sim_time).toBe(2000);expect(restored.paused).toBe(true);expect(restored.resources).toEqual(saved.resources);
 const receipt=await page.evaluate(()=>(window as any).ownedRestoreReceipts.findLast((r:any)=>r.kind==='restore'));
 expect(receipt.snapshot_revision).toBe(saved.revision);expect(receipt.revision).toBeGreaterThan(saved.revision);
 await expect(page.locator('.display-record-status')).toContainText(`真实恢复快照 ${saved.revision}`);
});

for(const fault of ['denied','abort','readback'] as const)test(`MB19 ${fault} display save is separate from Game and retains the last good immutable original`,async({page})=>{
 await page.addInitScript(()=>{
  (window as any).ownedDisplayFault='';const native=IDBDatabase.prototype.transaction;
  IDBDatabase.prototype.transaction=function(this:IDBDatabase,...args:any[]){const fault=(window as any).ownedDisplayFault;
   if(this.name==='fogbound-map-b-display-1'&&fault){const write=args[1]==='readwrite';if(fault==='denied'&&write){(window as any).ownedDisplayFault='';throw new DOMException('owned denied','QuotaExceededError');}if(fault==='readback'&&!write){(window as any).ownedDisplayFault='';throw new DOMException('owned readback failure','UnknownError');}const tx=Reflect.apply(native,this,args);if(fault==='abort'&&write){(window as any).ownedDisplayFault='';queueMicrotask(()=>tx.abort());}return tx;}return Reflect.apply(native,this,args);
  } as typeof IDBDatabase.prototype.transaction;
 });
 await observeGame(page);await start(page,'FB02-ENG-RECORD');await expect(page.locator('.display-record-status')).toContainText('地图关联已保存');
 const readRecords=()=>page.evaluate(()=>new Promise<any[]>((resolve,reject)=>{const open=indexedDB.open('fogbound-map-b-display-1');open.onerror=()=>reject(open.error);open.onsuccess=()=>{const db=open.result,request=db.transaction('records').objectStore('records').getAll();request.onsuccess=()=>{db.close();resolve(request.result);};request.onerror=()=>reject(request.error);};}));
 const original=await readRecords();expect(original).toHaveLength(1);
 await page.evaluate(fault=>(window as any).ownedDisplayFault=fault,fault);await page.getByRole('button',{name:'保存记录',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'已保存至'})).toBeVisible();
 await expect(page.locator('.display-record-status')).toContainText(fault==='readback'?'待核查':'失败');const records=await readRecords();expect(records).toContainEqual(original[0]);expect(records).toHaveLength(fault==='readback'?2:1);
 if(fault==='readback'){
  await page.getByRole('button',{name:'任务调度',exact:true}).click();await page.getByRole('button',{name:'态势地图',exact:true}).click();await expect(page.locator('.map')).toHaveAttribute('data-region-state','ready');
  await expect(page.locator('.display-record-status')).toContainText('待核查');
  await page.getByRole('button',{name:'地图图层',exact:true}).click();await page.getByRole('button',{name:'核查地图保存结果',exact:true}).click();await expect(page.locator('.display-record-status')).toContainText('已核查保存');expect(await readRecords()).toHaveLength(2);
 }
});

for(const fault of ['region','domain','axes','unit','version','manifest','mapping','config','geometry','run','missing'] as const)test(`MB20 ${fault} association mismatch degrades only display and explicit rebind keeps the restored current Game`,async({page})=>{
 await observeGame(page);await start(page,'FB02-ENG-RECORD');await expect(page.locator('.display-record-status')).toContainText('地图关联已保存');
 const original=(await trace(page)).views.at(-1)!;
 await page.evaluate(fault=>new Promise<void>((resolve,reject)=>{
  const open=indexedDB.open('fogbound-map-b-display-1');open.onerror=()=>reject(open.error);open.onsuccess=()=>{const db=open.result,tx=db.transaction(['heads','records'],'readwrite'),heads=tx.objectStore('heads'),records=tx.objectStore('records'),read=heads.getAll();read.onsuccess=()=>{const head=read.result[0];if(fault==='missing'){heads.delete(head.run_id);return;}const get=records.get(head.id);get.onsuccess=()=>{const record=get.result,i=record.identity;if(fault==='region')i.region_id='unknown';if(fault==='domain')i.domain[2]=9999;if(fault==='axes')i.axes.reverse();if(fault==='unit')i.unit='unknown';if(fault==='version')i.version=2;if(fault==='manifest')i.manifestHash='0'.repeat(64);if(fault==='mapping')i.mapping='unknown';if(fault==='config')i.configHash='0'.repeat(64);if(fault==='geometry')i.geometryDigest='0'.repeat(64);if(fault==='run')record.run_id='other-run';records.put(record);};};tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>{db.close();reject(tx.error);};};
 }),fault);
 await page.reload();await page.getByRole('button',{name:'接手这场演练',exact:true}).click();await expect(page.locator('.map')).toHaveAttribute('data-region-state','unavailable');await expect(page.locator('.display-record-status')).toContainText('不匹配');
 const restored=(await trace(page)).views.at(-1)!;expect(restored.run_id).toBe(original.run_id);expect(restored.resources).toEqual(original.resources);expect(restored.sim_time).toBe(original.sim_time);expect(restored.paused).toBe(true);
 await page.getByRole('button',{name:'重新关联当前区域',exact:true}).click();await expect(page.locator('.map')).toHaveAttribute('data-region-state','ready');const after=(await trace(page)).views.at(-1)!;expect(after).toEqual(restored);
});
