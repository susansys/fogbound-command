import {test,expect} from '@playwright/test';
test('an unconfirmed pause retains its pending label and retries the identical original control before claiming paused',async({page})=>{
  await page.addInitScript(()=>{
    let dropped=false;const inputs:unknown[]=[];(window as unknown as {controls:unknown[]}).controls=inputs;
    const Native=window.Worker;window.Worker=new Proxy(Native,{construct(Target,args){const worker=Reflect.construct(Target,args) as Worker;
      return new Proxy(worker,{get(target,key){const value=Reflect.get(target,key,target);if(key==='postMessage')return(input:{kind?:string;envelope?:{intent?:{kind?:string}}})=>{if(input.envelope?.intent?.kind==='pause')inputs.push(structuredClone(input.envelope));target.postMessage(input);};return typeof value==='function'?value.bind(target):value;},set(target,key,value){if(key==='onmessage'){target.onmessage=(event:MessageEvent)=>{if(!dropped&&event.data.receipt?.kind==='pause'){dropped=true;value(new MessageEvent('message',{data:{request_id:event.data.request_id,ok:false,code:'CHANNEL_UNCERTAIN'}}));}else value(event);};return true;}return Reflect.set(target,key,value,target);}});
    }});
  });
  await page.goto('/');await page.getByRole('button',{name:'开始演练',exact:true}).click();await page.getByRole('button',{name:'暂停',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('暂未收到确认');await expect(page.getByRole('button',{name:'暂停待确认',exact:true})).toBeVisible();
  expect(await page.locator('.clock').innerText()).not.toContain('已暂停');
  await page.getByRole('button',{name:'重试原控制',exact:true}).click();await expect(page.locator('.clock')).toContainText('已暂停');
  const inputs=await page.evaluate(()=>(window as unknown as {controls:unknown[]}).controls);expect(inputs).toHaveLength(2);expect(inputs[1]).toEqual(inputs[0]);
});
test('a nested private field in a transport response is rejected, preserving the safe view until a legal query',async({page})=>{
  await page.addInitScript(()=>{
    let injected=false;const Native=window.Worker;
    window.Worker=new Proxy(Native,{construct(Target,args){const worker=Reflect.construct(Target,args) as Worker;
      return new Proxy(worker,{
        get(target,key){const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;},
        set(target,key,value){
          if(key==='onmessage'){
            target.onmessage=(event:MessageEvent)=>{
              if(!injected&&event.data.view?.sim_time===7000){
                injected=true;
                const data={...event.data,view:{...event.data.view,position:{...event.data.view.position,constructor:'ENGINE_ONLY_CANARY'}}};
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
  await page.goto('/');await page.getByLabel('时间方式').selectOption('research');await page.getByRole('button',{name:'开始演练',exact:true}).click();
  await page.getByRole('button',{name:'定位联络点T',exact:true}).click();await page.getByRole('button',{name:'查看通行预案',exact:true}).click();await page.getByRole('button',{name:'下达通行命令',exact:true}).click();await page.getByRole('button',{name:'确认下达',exact:true}).click();await expect(page.getByText('命令已登记，尚未收到编组接令回报',{exact:true})).toBeVisible();
  await page.getByLabel('推进至秒').fill('6');await page.getByRole('button',{name:'推进时间',exact:true}).click();await expect(page.locator('.clock strong')).toHaveText('00:06');
  await page.getByLabel('推进至秒').fill('7');await page.getByRole('button',{name:'推进时间',exact:true}).click();await expect(page.getByRole('alert')).toContainText('暂未收到确认');
  await expect(page.locator('.clock strong')).toHaveText('00:06');await expect(page.getByTestId('position')).toHaveText('50.00, 150.00');expect(await page.locator('body').innerText()).not.toContain('ENGINE_ONLY');
  await page.getByRole('button',{name:'查询原命令结果',exact:true}).click();await expect(page.getByTestId('position')).toHaveText('68.87, 150.00');
});
