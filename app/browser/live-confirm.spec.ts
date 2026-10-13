import {test,expect} from '@playwright/test';
test('a live clock aging the first preview request causes a bounded fresh preview without issuing a command',async({page})=>{
  await page.addInitScript(()=>{let delayed=false;const Native=window.Worker;window.Worker=new Proxy(Native,{construct(Target,args){const worker=Reflect.construct(Target,args) as Worker;return new Proxy(worker,{get(target,key){const value=Reflect.get(target,key,target);if(key==='postMessage')return(input:any)=>{if(input.kind==='preview'&&!delayed){delayed=true;const release=(event:MessageEvent)=>{if(event.data.view?.revision>input.revision){target.removeEventListener('message',release);target.postMessage(input);}};target.addEventListener('message',release);}else target.postMessage(input);};return typeof value==='function'?value.bind(target):value;},set(target,key,value){return Reflect.set(target,key,value,target);}});}});});
  await page.goto('/');await page.getByRole('button',{name:'开始演练',exact:true}).click();await page.getByRole('button',{name:'定位联络点T',exact:true}).click();await page.getByRole('button',{name:'查看通行预案',exact:true}).click();await expect(page.getByRole('heading',{name:'待下达预案',exact:true})).toBeVisible();await expect(page.getByText('尚未签发移动任务',{exact:true})).toBeVisible();
});
test('command players can read, edit and dwell in confirmation while time advances before explicitly issuing',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'开始演练',exact:true}).click();
  await page.getByRole('button',{name:'定位联络点T',exact:true}).click();
  await page.getByRole('button',{name:'查看通行预案',exact:true}).click();
  await expect(page.getByLabel('指挥意图（选填）')).toBeVisible();
  await page.getByLabel('指挥意图（选填）').fill('核对联络点，等待正式回报');
  const editTime=await page.locator('.clock strong').innerText();
  await expect.poll(()=>page.locator('.clock strong').innerText()).not.toBe(editTime);
  await page.getByRole('button',{name:'下达通行命令',exact:true}).click();
  const modalTime=await page.locator('.clock strong').innerText();
  await expect.poll(()=>page.locator('.clock strong').innerText()).not.toBe(modalTime);
  await page.getByRole('button',{name:'确认下达',exact:true}).click();
  await expect(page.getByText('命令已登记，尚未收到编组接令回报',{exact:true})).toBeVisible();
});
test('lost focus during a pending rate receipt queues a real pause after confirming the original control',async({page,context})=>{
  const cdp=await context.newCDPSession(page);await cdp.send('Emulation.setFocusEmulationEnabled',{enabled:false});
  await page.addInitScript(()=>{
    let held:(()=>void)|null=null;
    (window as unknown as {releaseRate:()=>void}).releaseRate=()=>{if(!held)throw Error('no held rate receipt');held();held=null;};
    (window as unknown as {hasHeldRate:()=>boolean}).hasHeldRate=()=>held!==null;
    const Native=window.Worker;window.Worker=new Proxy(Native,{construct(Target,args){const worker=Reflect.construct(Target,args) as Worker;
      return new Proxy(worker,{get(target,key){const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;},set(target,key,value){
        if(key==='onmessage'){target.onmessage=(event:MessageEvent)=>{const deliver=()=>value(event);if(event.data.receipt?.kind==='rate'&&!held)held=deliver;else deliver();};return true;}
        return Reflect.set(target,key,value,target);
      }});
    }});
  });
  await page.goto('/');await page.getByRole('button',{name:'开始演练',exact:true}).click();
  await page.getByLabel('时间速率').selectOption('2');
  await expect(page.getByRole('button',{name:'控制待确认',exact:true})).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>(window as unknown as {hasHeldRate:()=>boolean}).hasHeldRate())).toBe(true);
  const other=await context.newPage();await other.goto('/');
  await cdp.send('Emulation.setFocusEmulationEnabled',{enabled:false});
  await other.bringToFront();
  await expect.poll(()=>page.evaluate(()=>document.hidden||!document.hasFocus())).toBe(true);
  await page.evaluate(()=>(window as unknown as {releaseRate:()=>void}).releaseRate());
  await expect(page.locator('.clock')).toContainText('已暂停');
  const at=await page.locator('.clock strong').innerText();await page.bringToFront();
  const returned=Date.now();await expect.poll(()=>Date.now()-returned).toBeGreaterThan(1000);
  expect(await page.locator('.clock strong').innerText()).toBe(at);
});
