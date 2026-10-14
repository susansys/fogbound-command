import {test,expect,type Page} from '@playwright/test';
import fs from 'node:fs/promises';
import {legalKnowledge} from '../tests/fixtures/legal-knowledge';
import {valid_response} from '../src/dto';
async function showRegion(page:Page,visible:boolean){
  await expect(page.locator('.map')).toHaveAttribute('data-region-state','ready');
  await page.getByRole('button',{name:'地图图层',exact:true}).click();await page.getByRole('checkbox',{name:'虚构区域背景',exact:true}).setChecked(visible);await page.getByRole('button',{name:'地图图层',exact:true}).click();
}

for(const regionalVisible of [false,true])test(`CR03/MB12 paired private Knowledge inputs render identically through strict Transport and current Workbench, regionalVisible=${regionalVisible}`,async({browser},testInfo)=>{
  // The core Knowledge contract independently proves both authored private alternatives
  // project to this same public fixture. This browser slice proves strict Transport/UI handling.
  const projected=[structuredClone(legalKnowledge),structuredClone(legalKnowledge)];
  const evidence=[];
  for(const [index,view] of projected.entries()){
    expect(valid_response({request_id:'view-pair',ok:true,view})).toBe(true);
    const context=await browser.newContext({viewport:{width:1366,height:768}}),page=await context.newPage();
    try{
      // Approved Transport mechanism seam: project the authored Knowledge alternatives first.
      // No private world is sent to Workbench, loaded as a save, or used to fabricate Game outcomes.
      await page.addInitScript((known)=>{
        const requests:unknown[]=[];(window as unknown as {pairRequests:unknown[]}).pairRequests=requests;
        const Native=window.Worker;window.Worker=new Proxy(Native,{construct(Target,args){const worker=Reflect.construct(Target,args) as Worker;
          if(!String(args[0]).includes('/assets/worker-'))return worker;
          const post=worker.postMessage.bind(worker);worker.postMessage=message=>{requests.push(structuredClone(message));post(message);};
          return new Proxy(worker,{get(target,key){const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;},set(target,key,value){if(key==='onmessage'){
            const accept=(event:MessageEvent)=>value(event);(window as unknown as {deliver:(data:unknown)=>void}).deliver=data=>accept(new MessageEvent('message',{data}));
            target.onmessage=(event:MessageEvent)=>{if(event.data.ok&&event.data.view)accept(new MessageEvent('message',{data:{request_id:event.data.request_id,ok:true,view:known}}));else accept(event);};return true;}return Reflect.set(target,key,value,target);}});
        }});
      },view);
      await page.goto('/');await page.getByLabel('时间方式').selectOption('research');await page.getByLabel('演练任务').selectOption('FB01-ENG-MOVE');await page.getByRole('button',{name:'开始演练',exact:true}).click();await expect(page.locator('.clock strong')).toHaveText('00:06');
      await showRegion(page,regionalVisible);
      await page.getByRole('button',{name:'定位联络点T',exact:true}).click();await expect(page.locator('.inspector .facts')).toContainText('170.00, 150.00');await expect(page.getByTestId('position')).toContainText('50.00');
      const before=await page.locator('body').innerText();expect(before).not.toContain('ENGINE_ONLY');
      await page.getByRole('button',{name:'任务调度',exact:true}).click();const candidates=await page.locator('.task-main').innerText();expect(await page.getByRole('button',{name:'查看通行预案',exact:true}).isDisabled()).toBe(true);
      await page.getByRole('button',{name:'态势地图',exact:true}).click();
      await showRegion(page,regionalVisible);
      await page.evaluate((legal)=>{(window as unknown as {deliver:(data:unknown)=>void}).deliver({request_id:'clock-fault',ok:true,view:{...legal,position:{...legal.position,private_canary:'ENGINE_ONLY'}}});},view);
      await expect(page.getByRole('alert')).toContainText('暂未收到确认');await expect(page.getByTestId('position')).toContainText('50.00');const error=await page.getByRole('alert').innerText();
      const received={...view,revision:5,sim_time:7000,position:{x:68.87,y:150,observed:6000,received:7000,evidence:'legal-fix'},log:[...view.log,{id:'legal-fix',at:7000,kind:'fix_receipt' as const,text:'位置回报已收到',observed:6000,evidence:'legal-fix'}]};
      expect(valid_response({request_id:'clock-pair-received',ok:true,view:received})).toBe(true);
      await page.evaluate((known)=>{(window as unknown as {deliver:(data:unknown)=>void}).deliver({request_id:'clock-pair-received',ok:true,view:known});},received);await expect(page.getByTestId('position')).toContainText('68.87');
      await expect(page.locator('.map canvas')).toHaveCount(1);
      await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
      await page.getByRole('button',{name:'全图',exact:true}).click();
      await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
      const visible=await page.locator('.unit-marker').evaluate(element=>({left:(element as HTMLElement).style.left,top:(element as HTMLElement).style.top,selected:element.classList.contains('selected')}));
      const requests=await page.evaluate(()=>(window as unknown as {pairRequests:Array<{kind:string;envelope?:{intent:unknown}}>}).pairRequests.map(request=>({kind:request.kind,intent:request.envelope?.intent})));
      // Fractional locator clipping adds one-channel raster noise on software
      // compositors. Compare the complete integer viewport, including the map,
      // with the original exact PNG-byte assertion and no masked UI or tolerance.
      await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.querySelectorAll('img')].map(image=>image.decode()));});
      const pixels=await page.screenshot({path:testInfo.outputPath(`private-pair-${index}.png`),fullPage:true});await fs.writeFile(testInfo.outputPath(`public-workbench-pair-${index}.png`),pixels);evidence.push({before,candidates,error,visible,requests,pixels,after:await page.locator('body').innerText()});
    }finally{await context.close();}
  }
  expect(evidence[1]).toEqual(evidence[0]);
});
