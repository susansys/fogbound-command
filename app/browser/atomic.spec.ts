import {test,expect} from '@playwright/test';
test('real Worker IndexedDB abort rolls back a 7000ms delivery and retains the last safe view and original command receipt',async({page})=>{
  await page.addInitScript(()=>{
    const Native=window.Worker;
    window.Worker=new Proxy(Native,{construct(Target,args){
      const script=`let injected=false;const native=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(value,...rest){const request=native.call(this,value,...rest);if(this.name==='runs'&&value.sim_time===7000&&!injected){injected=true;request.addEventListener('success',()=>this.transaction.abort(),{once:true});}return request;};await import(${JSON.stringify(String(args[0]))});`;
      const url=URL.createObjectURL(new Blob([script],{type:'text/javascript'}));
      return Reflect.construct(Target,[url,{type:'module'}]);
    }});
  });
  await page.goto('/');await page.getByLabel('时间方式').selectOption('research');await page.getByRole('button',{name:'开始演练',exact:true}).click();
  await page.getByRole('button',{name:'定位联络点T',exact:true}).click();await page.getByRole('button',{name:'查看通行预案',exact:true}).click();await page.getByRole('button',{name:'下达通行命令',exact:true}).click();await page.getByRole('button',{name:'确认下达',exact:true}).click();
  await expect(page.getByText('命令已登记，尚未收到编组接令回报',{exact:true})).toBeVisible();
  await page.getByLabel('推进至秒').fill('6');await page.getByRole('button',{name:'推进时间',exact:true}).click();await expect(page.locator('.clock strong')).toHaveText('00:06');
  await page.getByLabel('推进至秒').fill('7');await page.getByRole('button',{name:'推进时间',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('尚未确认保存');
  await expect(page.locator('.clock strong')).toHaveText('00:06');await expect(page.getByTestId('position')).toHaveText('50.00, 150.00');
  await page.getByRole('button',{name:'查询原命令结果',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('原命令已登记');
  await expect(page.getByRole('alert')).toContainText('尚未确认保存');
  await expect(page.getByRole('button',{name:'推进时间',exact:true})).toBeDisabled();
});
test('a second page can explicitly take over the same run only after the actual worker lock owner ends, and starts paused',async({page,context})=>{
  await page.addInitScript(()=>{const Native=window.Worker;window.Worker=new Proxy(Native,{construct(Target,args){const worker=Reflect.construct(Target,args) as Worker;(window as unknown as {ownWorker:Worker}).ownWorker=worker;return worker;}});});
  await page.goto('/');await page.getByRole('button',{name:'开始演练',exact:true}).click();
  await expect.poll(()=>page.locator('.clock strong').innerText()).not.toBe('00:00');
  const next=await context.newPage();await next.goto('/');
  await next.getByRole('button',{name:'接手这场演练',exact:true}).click();await expect(next.getByRole('alert')).toContainText('另一个窗口正在指挥');
  await page.evaluate(()=>(window as unknown as {ownWorker:Worker}).ownWorker.terminate());
  await next.getByRole('button',{name:'接手这场演练',exact:true}).click();await expect(next.locator('.clock')).toContainText('已暂停');
  const committed=await next.locator('.clock strong').innerText();const start=Date.now();await expect.poll(()=>Date.now()-start).toBeGreaterThan(1000);
  expect(await next.locator('.clock strong').innerText()).toBe(committed);
});
