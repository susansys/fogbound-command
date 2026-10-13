import {expect,test} from '@playwright/test';

async function issueRecord(page:import('@playwright/test').Page){
  await page.goto('/');
  await page.getByLabel('时间方式').selectOption('research');
  await page.getByRole('button',{name:'开始演练',exact:true}).click();
  await page.getByRole('button',{name:'拟定记录任务',exact:true}).click();
  await page.getByRole('button',{name:'查看记录预案',exact:true}).click();
  await page.getByRole('button',{name:'下达记录任务',exact:true}).click();
  await page.getByRole('button',{name:'确认下达',exact:true}).click();
  await expect(page.locator('.task-aside')).toContainText('记录任务已登记');
}

test('FB02-S09 real Worker record completion abort keeps the last safe view and original receipt unresolved',async({page})=>{
  await page.addInitScript(()=>{
    const Native=window.Worker;
    window.Worker=new Proxy(Native,{construct(Target,args){
      const script=`let injected=false;const native=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(value,...rest){const request=native.call(this,value,...rest);if(this.name==='runs'&&value.sim_time===47000&&!injected){injected=true;request.addEventListener('success',()=>this.transaction.abort(),{once:true});}return request;};await import(${JSON.stringify(String(args[0]))});`;
      const url=URL.createObjectURL(new Blob([script],{type:'text/javascript'}));
      return Reflect.construct(Target,[url,{type:'module'}]);
    }});
  });
  await issueRecord(page);
  await page.getByLabel('推进至秒').fill('7');
  await page.getByRole('button',{name:'推进时间',exact:true}).click();
  await expect(page.locator('.clock strong')).toHaveText('00:07');
  await page.getByLabel('推进至秒').fill('47');
  await page.getByRole('button',{name:'推进时间',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('尚未确认保存');
  await expect(page.locator('.clock strong')).toHaveText('00:07');
  await expect(page.locator('body')).not.toContainText('成果 artifact-');
  await expect(page.getByRole('button',{name:'返回最近记录',exact:true})).toBeVisible();
});

test('FB02-S11 private artifact fields in a record transport response are rejected until a legal query',async({page})=>{
  await page.addInitScript(()=>{
    let injected=false;const Native=window.Worker;
    window.Worker=new Proxy(Native,{construct(Target,args){const worker=Reflect.construct(Target,args) as Worker;
      return new Proxy(worker,{
        get(target,key){const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;},
        set(target,key,value){
          if(key==='onmessage'){
            target.onmessage=(event:MessageEvent)=>{
              if(!injected&&event.data.view?.artifacts?.length){
                injected=true;
                const data={...event.data,view:{...event.data.view,artifacts:[{...event.data.view.artifacts[0],private_canary:'ENGINE_ONLY'}]}};
                value(new MessageEvent('message',{data}));
              }else value(event);
            };
            return true;
          }
          return Reflect.set(target,key,value,target);
        }
      });
    }});
  });
  await issueRecord(page);
  await page.getByLabel('推进至秒').fill('7');
  await page.getByRole('button',{name:'推进时间',exact:true}).click();
  await expect(page.locator('.clock strong')).toHaveText('00:07');
  await page.getByLabel('推进至秒').fill('47');
  await page.getByRole('button',{name:'推进时间',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('暂未收到确认');
  await expect(page.locator('.clock strong')).toHaveText('00:07');
  expect(await page.locator('body').innerText()).not.toContain('ENGINE_ONLY');
  await page.getByRole('button',{name:'返回态势地图',exact:true}).click();
  await page.getByRole('button',{name:'查询原命令结果',exact:true}).click();
  await expect(page.locator('.clock')).toContainText('任务完成');
  await expect(page.locator('section').filter({hasText:'已收到的装备状态'})).toContainText('成果 artifact-');
});

test('FB02-S10 a second page cannot write a live Record run until explicit takeover restores it paused',async({page,context})=>{
  await page.addInitScript(()=>{const Native=window.Worker;window.Worker=new Proxy(Native,{construct(Target,args){const worker=Reflect.construct(Target,args) as Worker;(window as unknown as {ownWorker:Worker}).ownWorker=worker;return worker;}});});
  await page.goto('/');
  await page.getByRole('button',{name:'开始演练',exact:true}).click();
  await expect.poll(()=>page.locator('.clock strong').innerText()).not.toBe('00:00');
  const next=await context.newPage();
  await next.goto('/');
  await next.getByRole('button',{name:'接手这场演练',exact:true}).click();
  await expect(next.getByRole('alert')).toContainText('另一个窗口正在指挥');
  await page.evaluate(()=>(window as unknown as {ownWorker:Worker}).ownWorker.terminate());
  await next.getByRole('button',{name:'接手这场演练',exact:true}).click();
  await expect(next.locator('.clock')).toContainText('已暂停');
  await expect(next.getByText('固定工位 H',{exact:false})).toBeVisible();
  const committed=await next.locator('.clock strong').innerText();
  const start=Date.now();
  await expect.poll(()=>Date.now()-start).toBeGreaterThan(1000);
  expect(await next.locator('.clock strong').innerText()).toBe(committed);
});
