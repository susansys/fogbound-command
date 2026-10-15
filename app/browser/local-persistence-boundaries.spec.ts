import {test,expect} from '@playwright/test';

test('PC05/06 an empty entry identifies this browser profile and exact origin without claiming other records were deleted',async({page})=>{
  await page.goto('/');
  await expect(page.getByText('此入口暂无演练记录。',{exact:true})).toBeVisible();
  await expect(page.getByText(/当前浏览器的用户配置/)).toContainText(new URL(page.url()).origin);
  await expect(page.getByText(/不代表原记录已删除/)).toBeVisible();
  await expect(page.getByRole('button',{name:'接手这场演练',exact:true})).toHaveCount(0);
});

test('PC08 a real save transaction abort preserves the last committed run and does not announce a successful save',async({page,context})=>{
  await page.addInitScript(()=>{
    const Native=Worker;
    window.Worker=new Proxy(Native,{construct(Target,args){
      if(!String(args[0]).includes('/assets/worker-'))return Reflect.construct(Target,args);
      const script=`const native=IDBObjectStore.prototype.put;let injected=false;IDBObjectStore.prototype.put=function(value,...rest){const request=native.call(this,value,...rest);if(this.name==='runs'&&value.inputs?.at(-1)?.envelope.intent.kind==='save'&&!injected){injected=true;request.addEventListener('success',()=>this.transaction.abort(),{once:true});}return request;};await import(${JSON.stringify(String(args[0]))});`;
      return Reflect.construct(Target,[URL.createObjectURL(new Blob([script],{type:'text/javascript'})),{type:'module'}]);
    }});
  });
  await page.goto('/');await page.getByLabel('时间方式').selectOption('research');await page.getByRole('button',{name:'开始演练',exact:true}).click();
  await expect(page.getByRole('button',{name:'保存记录',exact:true})).toBeVisible();
  const committed=()=>page.evaluate(()=>new Promise<unknown[]>((resolve,reject)=>{
    const open=indexedDB.open('fogbound-map-b-game-1');open.onerror=()=>reject(open.error);open.onsuccess=()=>{
      const db=open.result,tx=db.transaction('runs','readonly'),read=tx.objectStore('runs').getAll();tx.oncomplete=()=>{db.close();resolve(read.result);};tx.onabort=()=>{db.close();reject(tx.error);};
    };
  }));
  const safe=await committed();expect(safe).toHaveLength(1);
  await page.getByRole('button',{name:'保存记录',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('尚未确认保存');
  expect(await committed()).toEqual(safe);
  await expect(page.getByRole('status').filter({hasText:'已保存至'})).toHaveCount(0);
  // End the page-scoped injector before readback, retaining the same real DB.
  // Dynamic import wrappers can lose the bootstrap list request on reload;
  // that harness failure is retained separately rather than retried blindly.
  await page.close();const restored=await context.newPage();await restored.goto('/');
  await restored.getByRole('button',{name:'接手这场演练',exact:true}).click();
  await expect(restored.locator('.clock strong')).toHaveText('00:00');
  await expect(restored.locator('.clock')).toContainText('已暂停');
});

test('PC08 a lost real save reply keeps the original control pending until its receipt is read back',async({page})=>{
  await page.addInitScript(()=>{
    let dropped=false;const requests:unknown[]=[];
    (window as unknown as {saveRequests:unknown[]}).saveRequests=requests;
    const Native=Worker;window.Worker=new Proxy(Native,{construct(Target,args){
      const worker=Reflect.construct(Target,args) as Worker;
      return new Proxy(worker,{get(target,key){
        if(key==='postMessage')return(message:unknown)=>{requests.push(structuredClone(message));target.postMessage(message);};
        const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
      },set(target,key,value){
        if(key==='onmessage'){target.onmessage=(event:MessageEvent)=>{if(!dropped&&event.data.ok&&event.data.receipt?.kind==='save'){dropped=true;return;}value(event);};return true;}
        return Reflect.set(target,key,value,target);
      }});
    }});
  });
  await page.goto('/');await page.getByLabel('时间方式').selectOption('research');await page.getByRole('button',{name:'开始演练',exact:true}).click();
  await page.getByRole('button',{name:'保存记录',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('暂未收到确认',{timeout:15000});
  await expect(page.getByRole('button',{name:'保存待确认',exact:true})).toBeDisabled();
  await expect(page.getByRole('status').filter({hasText:'已保存至'})).toHaveCount(0);
  await page.getByRole('button',{name:'查询控制结果',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('原控制已登记');
  await expect(page.getByRole('button',{name:'保存记录',exact:true})).toBeEnabled();
  const requests=await page.evaluate(()=>(window as unknown as {saveRequests:Array<{kind:string;operation_id?:string;envelope?:{operation_id:string;intent:{kind:string}}}>}).saveRequests);
  const saves=requests.filter(r=>r.kind==='operate'&&r.envelope?.intent.kind==='save');expect(saves).toHaveLength(1);
  expect(requests.find(r=>r.kind==='receipt')?.operation_id).toBe(saves[0].envelope!.operation_id);
});

test('PC07 an unconfirmed list stays unknown rather than claiming no records',async({page})=>{
  await page.addInitScript(()=>{
    const Native=Worker;
    window.Worker=new Proxy(Native,{construct(Target,args){
      const worker=Reflect.construct(Target,args) as Worker;
      const post=worker.postMessage.bind(worker);
      worker.postMessage=(message:unknown,...rest:[])=>{
        // Real outbound transport failure only; no forged response or State.
        if((message as {kind?:string}).kind!=='list')post(message,...rest);
      };
      return worker;
    }});
  });
  await page.goto('/');
  await expect(page.getByRole('status')).toHaveText('正在读取此入口的演练记录。');
  await expect(page.getByRole('status')).toContainText('列表尚未确认',{timeout:15000});
  await expect(page.getByRole('alert')).toContainText('暂未收到确认');
  await expect(page.getByText('此入口暂无演练记录。',{exact:true})).toHaveCount(0);
});

test('PC07 a failed refresh after retained history does not present an older list as current',async({page})=>{
  await page.addInitScript(()=>{
    let lists=0;const Native=Worker;
    window.Worker=new Proxy(Native,{construct(Target,args){
      const worker=Reflect.construct(Target,args) as Worker,post=worker.postMessage.bind(worker);
      worker.postMessage=(message:unknown,...rest:[])=>{
        if((message as {kind?:string}).kind==='list'&&++lists===3)return;
        post(message,...rest);
      };return worker;
    }});
  });
  await page.goto('/');await page.getByLabel('时间方式').selectOption('research');
  await page.getByRole('button',{name:'开始演练',exact:true}).click();
  await page.getByRole('button',{name:'更换演练',exact:true}).click();
  await page.getByRole('button',{name:'查看记录',exact:true}).click();
  await expect(page.getByText('历史记录 · 只读',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'返回演练选择',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('暂未收到确认',{timeout:15000});
  await expect(page.getByRole('status')).toContainText('列表尚未确认');
  await expect(page.getByRole('button',{name:'接手这场演练',exact:true})).toHaveCount(0);
});
