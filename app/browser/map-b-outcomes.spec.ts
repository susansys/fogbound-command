import {test,expect,type Page} from '@playwright/test';
import {observeGame,trace,start} from './map-a-helpers';

async function observeCommittedGame(page:Page){
  await page.addInitScript(()=>{
    // Fixed UUIDs are an owned randomness-boundary fixture, never a patched State.
    let next=1;Object.defineProperty(crypto,'randomUUID',{value:()=>`00000000-0000-4000-8000-${(next++).toString(16).padStart(12,'0')}`});
    const committed:unknown[]=[];(window as unknown as {committedGameProof:unknown[]}).committedGameProof=committed;
    const Native=window.Worker;
    window.Worker=new Proxy(Native,{construct(Target,args){
      const url=String(args[0]);if(!url.includes('/assets/worker-'))return Reflect.construct(Target,args);
      const script=`let next=4096;Object.defineProperty(crypto,'randomUUID',{value:()=> '00000000-0000-4000-8000-'+(next++).toString(16).padStart(12,'0')});
const put=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(value,...rest){const request=Reflect.apply(put,this,[value,...rest]);if(this.name==='runs'){const proof=structuredClone(value);this.transaction.addEventListener('complete',()=>self.postMessage({ownedCommittedGameProof:proof}),{once:true});}return request;};await import(${JSON.stringify(url)});`;
      const worker=Reflect.construct(Target,[URL.createObjectURL(new Blob([script],{type:'text/javascript'})),{type:'module'}]) as Worker;
      worker.addEventListener('message',event=>{if(event.data?.ownedCommittedGameProof){event.stopImmediatePropagation();committed.push(event.data.ownedCommittedGameProof);}});
      return worker;
    }});
  });
  await observeGame(page);
}

for(const kind of ['near','replace','record','move'])test(`MB13 real ${kind} committed events/phases/RNG/hash/resources remain identical with full background on, off or refused`,async({browser})=>{
  const results=[];
  for(const display of ['on','off','refused','shade-query']){
    const context=await browser.newContext(),page=await context.newPage();
    try{
      await observeCommittedGame(page);
      if(display==='refused')await page.route('**/assets/surface-0-0-*.png',route=>route.fulfill({status:404,body:''}));
      await start(page,kind==='record'?'FB02-ENG-RECORD':kind==='move'?'FB01-ENG-MOVE':'ENG-PRESTART-REPLACE');await expect(page.locator('.map')).toHaveAttribute('data-region-state',display==='refused'?'unavailable':'ready');
      if(display==='off'){await page.getByRole('button',{name:'地图图层',exact:true}).click();await page.getByRole('checkbox',{name:'虚构区域背景',exact:true}).uncheck();await page.getByRole('button',{name:'地图图层',exact:true}).click();}
      if(display==='shade-query'){await page.getByRole('button',{name:'地图图层',exact:true}).click();await page.getByLabel('地形表现',{exact:true}).selectOption('shade');await page.getByRole('button',{name:'地图图层',exact:true}).click();const box=(await page.locator('.map').boundingBox())!;await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await expect(page.locator('.map-coordinate')).toContainText('模拟高程');}
      await page.getByRole('button',{name:'任务调度',exact:true}).click();await page.getByRole('button',{name:kind==='record'?'查看记录预案':'查看通行预案',exact:true}).click();
      await page.getByRole('button',{name:kind==='record'?'下达记录任务':'下达通行命令',exact:true}).click();await page.getByRole('button',{name:'确认下达',exact:true}).click();
      await expect(page.getByTestId('frozen-command').locator('article')).toHaveCount(1);
      if(kind==='replace'){
        await page.getByLabel('推进至秒').fill('2');await page.getByRole('button',{name:'推进时间',exact:true}).click();await expect(page.locator('.clock strong')).toHaveText('00:02');
        await page.getByRole('button',{name:'请求改到T',exact:true}).click();await page.getByRole('button',{name:'下达替代请求',exact:true}).click();await page.getByRole('button',{name:'确认下达',exact:true}).click();
        await expect(page.getByTestId('frozen-command').locator('article')).toHaveCount(2);
      }
      await page.getByLabel('推进至秒').fill('120');await page.getByRole('button',{name:'推进时间',exact:true}).click();
      const expected=kind==='record'?47000:kind==='replace'?40800:kind==='move'?33800:22900;
      await expect(page.locator('.clock strong')).toHaveText(kind==='record'?'00:47':kind==='replace'?'00:40.800':kind==='move'?'00:33.800':'00:22.900');
      const view=(await trace(page)).views.at(-1)!;expect(view.finished).toBe(true);expect(view.sim_time).toBe(expected);
      if(kind==='move'){expect(view.resources.hq_energy).toBeUndefined();expect(view.resources.hq_wear).toBeUndefined();}
      else expect([view.resources.hq_energy,view.resources.hq_wear]).toEqual(kind==='replace'?[14,98]:[15,99]);
      expect([view.resources.equipment_energy,view.resources.equipment_wear]).toEqual(kind==='record'?[13,97]:kind==='replace'?[6,90]:kind==='move'?[8,92]:[10,94]);
      if(kind==='record'){expect([view.resources.record_energy,view.resources.record_wear,view.resources.record_packs]).toEqual([16,97,1]);expect(view.artifacts).toHaveLength(1);}else expect(view.resources.movement_energy).toBe(kind==='near'?19:18);
      const states=await page.evaluate(()=>(window as unknown as {committedGameProof:Array<{sim_time:number}>}).committedGameProof);
      expect(states.at(-1)?.sim_time).toBe(expected);results.push(states);
    }finally{await context.close();}
  }
  for(const result of results.slice(1))expect(result).toEqual(results[0]);
});
