import {test,expect} from '@playwright/test';
import {observeGame,trace,start,enableSynthetic} from './map-a-helpers';

test('MA05 physical map gestures and source reading preserve every paused public field and create no operation or arbitrary plan',async({page})=>{
  await observeGame(page);await start(page);const before=await trace(page);
  await enableSynthetic(page);
  const map=page.getByRole('region',{name:'公开态势地图'}),box=(await map.boundingBox())!;
  const camera=await map.getAttribute('data-camera');
  await page.mouse.move(box.x+box.width-190,box.y+200);await page.mouse.down();await page.mouse.move(box.x+box.width-140,box.y+220,{steps:10});await page.mouse.up();
  expect(await map.getAttribute('data-camera')).not.toBe(camera);
  await map.focus();await page.keyboard.press('ArrowLeft');await page.keyboard.press('+');await page.keyboard.press('-');
  await page.mouse.move(box.x+box.width-190,box.y+220);await page.mouse.wheel(0,-120);
  await page.getByRole('button',{name:'全图',exact:true}).click();
  await page.getByRole('button',{name:'近联络点N',exact:true}).click();await expect(page.locator('.inspector .facts')).toContainText('110.00, 150.00');
  await page.mouse.click(box.x+box.width-190,box.y+250);await expect(page.locator('.inspector .facts')).toContainText('110.00, 150.00');
  await page.getByRole('button',{name:'地图图层',exact:true}).click();await page.getByRole('button',{name:'合成资料与范围',exact:true}).click();
  await page.getByRole('button',{name:'区域全景',exact:true}).click();await page.getByRole('button',{name:'切换颜色变体',exact:true}).click();await page.getByRole('button',{name:'返回操作范围',exact:true}).click();
  const after=await trace(page);expect(after.views.at(-1)).toEqual(before.views.at(-1));expect(after.requests.slice(before.requests.length)).toEqual([]);
  await expect(page.locator('.plan')).toHaveCount(0);await expect(page.locator('.clock strong')).toHaveText('00:00');
});

for(const kind of ['near','replace','record'] as const)test(`MA06 ${kind} fixed intents have identical real Worker outcomes with default or synthetic display`,async({browser})=>{
  const results=[];
  for(const synthetic of [false,true]){
    const context=await browser.newContext(),page=await context.newPage();
    try{
      await observeGame(page);await start(page,kind==='record'?'FB02-ENG-RECORD':'ENG-PRESTART-REPLACE');
      if(synthetic)await enableSynthetic(page);
      await page.getByRole('button',{name:'任务调度',exact:true}).click();
      await page.getByRole('button',{name:kind==='record'?'查看记录预案':'查看通行预案',exact:true}).click();
      await page.getByRole('button',{name:'态势地图',exact:true}).click();
      if(synthetic)await enableSynthetic(page);
      await expect(page.locator('.plan-route path[stroke-dasharray]')).toHaveCount(kind==='record'?0:1);
      await page.getByRole('button',{name:'任务调度',exact:true}).click();
      await page.getByRole('button',{name:kind==='record'?'下达记录任务':'下达通行命令',exact:true}).click();await page.getByRole('button',{name:'确认下达',exact:true}).click();
      await expect(page.getByTestId('frozen-command').locator('article')).toHaveCount(1);
      if(kind==='replace'){
        await expect(page.getByRole('button',{name:'请求改到T',exact:true})).toBeEnabled();
        await page.getByLabel('推进至秒').fill('2');await page.getByRole('button',{name:'推进时间',exact:true}).click();
        await expect(page.locator('.clock strong')).toHaveText('00:02');
        await page.getByRole('button',{name:'请求改到T',exact:true}).click();await page.getByRole('button',{name:'下达替代请求',exact:true}).click();await page.getByRole('button',{name:'确认下达',exact:true}).click();
        await expect(page.getByTestId('frozen-command').locator('article')).toHaveCount(2);
      }
      await page.getByRole('button',{name:'态势地图',exact:true}).click();if(synthetic)await enableSynthetic(page);
      await page.getByLabel('推进至秒').fill('120');await page.getByRole('button',{name:'推进时间',exact:true}).click();
      const expected=kind==='record'?47000:kind==='replace'?40800:22900;
      await expect(page.locator('.clock strong')).toHaveText(kind==='record'?'00:47':kind==='replace'?'00:40.800':'00:22.900');
      const view=(await trace(page)).views.at(-1)!;expect(view.finished).toBe(true);expect(view.sim_time).toBe(expected);
      expect([view.resources.hq_energy,view.resources.hq_wear]).toEqual(kind==='replace'?[14,98]:[15,99]);
      expect([view.resources.equipment_energy,view.resources.equipment_wear]).toEqual(kind==='record'?[13,97]:kind==='replace'?[6,90]:[10,94]);
      if(kind==='record'){expect([view.resources.record_energy,view.resources.record_wear,view.resources.record_packs]).toEqual([16,97,1]);expect(view.artifacts).toHaveLength(1);}else expect(view.resources.movement_energy).toBe(kind==='replace'?18:19);
      const {x,y,observed,received}=view.position;
      // Only independently registered command IDs differ between these two fresh runs.
      const normalize=(text:string)=>view.issued_orders.reduce((value,order,index)=>value.replaceAll(order.command_id,`registered-command-${index}`),text);
      results.push({sim_time:view.sim_time,status:view.status,resources:view.resources,position:{x,y,observed,received},artifacts:view.artifacts?.map(({completed,verified})=>({completed,verified})),log:view.log.map(({at,kind,observed,sender,request_kind,rejection,text})=>({at,kind,observed,sender,request_kind,rejection,text:normalize(text)}))});
    }finally{await context.close();}
  }
  expect(results[1]).toEqual(results[0]);
});

test('MA07 command map reading advances normally and real lost focus pauses only through the existing Game receipt',async({page,context})=>{
  const cdp=await context.newCDPSession(page);await cdp.send('Emulation.setFocusEmulationEnabled',{enabled:false});
  await observeGame(page);await start(page,'ENG-PRESTART-REPLACE','command');await enableSynthetic(page);
  await page.getByRole('button',{name:'地图图层',exact:true}).click();await page.getByRole('button',{name:'合成资料与范围',exact:true}).click();
  const reading=await page.locator('.clock strong').innerText();await expect.poll(()=>page.locator('.clock strong').innerText()).not.toBe(reading);
  expect((await trace(page)).requests.filter(request=>request.kind==='operate'&&request.envelope.intent.kind==='pause')).toEqual([]);
  const other=await context.newPage();await other.goto('/');await other.bringToFront();
  await expect.poll(()=>page.evaluate(()=>document.hidden||!document.hasFocus())).toBe(true);await expect(page.locator('.clock')).toContainText('已暂停');
  const paused=await page.locator('.clock strong').innerText();await page.bringToFront();
  const returned=Date.now();await expect.poll(()=>Date.now()-returned).toBeGreaterThan(1000);expect(await page.locator('.clock strong').innerText()).toBe(paused);
  expect((await trace(page)).requests.some(request=>request.kind==='operate'&&request.envelope.intent.kind==='pause'&&request.envelope.intent.reason==='application_hidden'||request.kind==='operate'&&request.envelope.intent.kind==='pause'&&request.envelope.intent.reason==='focus_lost')).toBe(true);
  await page.getByRole('button',{name:'继续',exact:true}).click();await expect.poll(()=>page.locator('.clock strong').innerText()).not.toBe(paused);await other.close();
});

for(const width of [1366,1920])for(const dpr of [1,2])for(const definition of ['ENG-PRESTART-REPLACE','FB02-ENG-RECORD'])for(const doubled of [false,true])test(`MA08 ${definition} CSS hit/overlay at ${width}, DPR${dpr}, doubled=${doubled}`,async({browser},info)=>{
  const context=await browser.newContext({viewport:{width,height:width===1366?768:1080},deviceScaleFactor:dpr}),page=await context.newPage();
  try{
    await start(page,definition);await enableSynthetic(page);
    if(doubled)await page.evaluate(()=>{const elements=[...document.querySelectorAll<HTMLElement>('*')],sizes=elements.map(element=>parseFloat(getComputedStyle(element).fontSize));elements.forEach((element,index)=>{if(Number.isFinite(sizes[index]))element.style.fontSize=`${sizes[index]*2}px`;});});
    const actualDpr=await page.evaluate(()=>devicePixelRatio);expect(Math.abs(actualDpr-dpr)).toBeLessThanOrEqual(0.000001);
    info.annotations.push({type:'display-density',description:JSON.stringify({requested:dpr,actual:actualDpr})});
    for(const level of ['low','fit','high'] as const){
      await page.getByRole('button',{name:'全图',exact:true}).click();
      const target=definition==='FB02-ENG-RECORD'?'工位H':'近联络点N';
      if(level==='low')for(let count=0;count<3;count++)await page.getByRole('button',{name:'缩小地图',exact:true}).click();
      if(level==='high'){
        await page.locator('.map-objects').getByRole('button',{name:definition==='FB02-ENG-RECORD'?'H · 工位':'N · 联络点',exact:true}).click();
        await page.getByRole('button',{name:'定位选中',exact:true}).click();for(let count=0;count<3;count++)await page.getByRole('button',{name:'放大地图',exact:true}).click();
      }
      await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
      const errors=await page.locator('.map').evaluate(map=>{
        const box=map.getBoundingClientRect(),[ox,oy,scale]=(map.getAttribute('data-camera')??'').split(',').map(Number);
        const literal:{id:string;x:number;y:number}[]=[{id:'H',x:50,y:150},...(map.querySelector('[data-anchor="N"]')?[{id:'N',x:110,y:150},{id:'T',x:170,y:150}]:[])];
        return literal.map(({id,x,y})=>{const anchor=map.querySelector(`[data-anchor="${id}"]`)!.getBoundingClientRect();return Math.hypot(anchor.left+anchor.width/2-box.left-(ox+x*scale),anchor.top+anchor.height/2-box.top-(oy+y*scale));});
      });expect(Math.max(...errors)).toBeLessThanOrEqual(1);
      await page.getByRole('button',{name:target,exact:true}).click({position:{x:14,y:18}});
      await expect(page.locator('.inspector .facts')).toContainText(definition==='FB02-ENG-RECORD'?'50.00, 150.00':'110.00, 150.00');
      await page.getByRole('button',{name:target,exact:true}).focus();await page.keyboard.press('Enter');
      await expect(page.locator('.map canvas')).toHaveCount(1);
      await page.getByRole('button',{name:'地图图层',exact:true}).click();await page.getByRole('button',{name:'合成资料与范围',exact:true}).click();await page.getByRole('button',{name:'检验显示配准',exact:true}).click();
      const returns=await page.locator('.map-coordinate-check tbody tr').evaluateAll(rows=>rows.map(row=>[Number(row.getAttribute('data-return-x')),Number(row.getAttribute('data-return-y'))]));
      const controls=[[0,0],[400,0],[0,300],[400,300],[200,150]];expect(returns).toHaveLength(5);returns.forEach((point,index)=>expect(Math.hypot(point[0]-controls[index][0],point[1]-controls[index][1])).toBeLessThanOrEqual(0.1));
      await page.getByRole('button',{name:'合成资料与范围',exact:true}).click();await page.getByRole('button',{name:'地图图层',exact:true}).click();
    }
    await page.setViewportSize({width:width-120,height:width===1366?700:960});await page.getByRole('button',{name:'全图',exact:true}).click();
    await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
    const boxes=await page.locator('.site-marker').evaluateAll(elements=>elements.map(element=>element.getBoundingClientRect().toJSON()));
    for(const [index,a] of boxes.entries())for(const b of boxes.slice(index+1))expect(a.right<=b.left||b.right<=a.left||a.bottom<=b.top||b.bottom<=a.top).toBe(true);
    await page.screenshot({path:info.outputPath('dpr-text-resize.png'),fullPage:true});
  }finally{await context.close();}
});
