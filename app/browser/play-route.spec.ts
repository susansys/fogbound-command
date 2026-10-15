import {test,expect,type Page} from '@playwright/test';

test.use({viewport:{width:1366,height:768},deviceScaleFactor:1});
const oracle:[[number,number],[number,number],[number,number],[number,number],[number,number]]=[[50,150],[56,158],[140,158],[146,150],[162,150]];
async function start(page:Page,holdFirstPreview=false){
  await page.addInitScript(hold=>{
    const NativeWorker=window.Worker,requests:unknown[]=[],responses:unknown[]=[];
    const control={held:false,release:()=>{}};let holdNext=hold;
    class OwnedObserver extends NativeWorker{
      constructor(url:string|URL,options?:WorkerOptions){super(url,options);if(String(url).includes('/assets/worker-')){
        const post=this.postMessage.bind(this);this.postMessage=(value:unknown)=>{requests.push(structuredClone(value));post(value);};
        this.addEventListener('message',event=>{
          if(holdNext&&event.data?.plan?.kind==='corridor_move'){
            holdNext=false;control.held=true;const data=structuredClone(event.data);event.stopImmediatePropagation();control.release=()=>{control.held=false;this.dispatchEvent(new MessageEvent('message',{data}));};return;
          }
          responses.push(structuredClone(event.data));
        });
      }}
    }
    window.Worker=OwnedObserver;Object.assign(window,{__b21RouteObservation:{requests,responses},__b21RouteControl:control});
  },holdFirstPreview);
  await page.goto('/');await page.getByLabel('演练任务').selectOption('B21-CORRIDOR-01');await page.getByLabel('时间方式').selectOption('research');await page.getByRole('button',{name:'开始演练',exact:true}).click();
  await expect(page.locator('.map-canvas')).toHaveAttribute('data-region-state','ready',{timeout:25000});
}
async function observed(page:Page){return page.evaluate(()=>Reflect.get(window,'__b21RouteObservation') as {requests:Array<{kind:string}>;responses:Array<{plan?:{path:number[][];path_digest:string;distance:number}}>});}

test('PG05 real keyboard and pointer drafts share the 120m canonical preview without issuing a task',async({page},info)=>{
  await start(page);
  await page.getByRole('button',{name:'拟定移动路线',exact:true}).click();
  for(let i=1;i<oracle.length;i++){
    await page.getByRole('button',{name:'新增折点',exact:true}).press('Enter');
    await page.getByLabel(`折点 ${i+1} x`,{exact:true}).fill(String(oracle[i][0]));
    await page.getByLabel(`折点 ${i+1} y`,{exact:true}).fill(String(oracle[i][1]));
  }
  await page.getByRole('button',{name:'预览路线',exact:true}).press('Enter');
  await expect(page.getByTestId('route-preview')).toContainText('120 图上米');
  await expect(page.getByTestId('route-preview')).toContainText('35.4 秒');
  await expect(page.getByTestId('route-preview')).toBeInViewport({ratio:0.5});
  const keyboard=(await observed(page)).responses.filter(x=>x.plan).at(-1)!.plan!;
  expect(keyboard.path).toEqual(oracle);
  await page.getByRole('button',{name:'取消路线',exact:true}).click();
  await expect(page.getByTestId('route-preview')).toHaveCount(0);
  await page.getByRole('button',{name:'拟定移动路线',exact:true}).click();
  const map=page.locator('.map-canvas'),box=(await map.boundingBox())!;
  await page.mouse.move(box.x+box.width*0.6,box.y+box.height*0.6);await page.mouse.down();await page.mouse.move(box.x+box.width*0.6+12,box.y+box.height*0.6+9,{steps:3});await page.mouse.up();
  await expect(page.locator('[data-route-point]')).toHaveCount(1);
  for(const [x,y] of oracle.slice(1)){
    const [cx,cy,s]=(await map.getAttribute('data-camera'))!.split(',').map(Number);
    await page.mouse.click(box.x+cx+x*s,box.y+cy+y*s);
  }
  await page.getByRole('button',{name:'预览路线',exact:true}).click();
  await expect(page.getByTestId('route-preview')).toContainText('120 图上米');
  const pointer=(await observed(page)).responses.filter(x=>x.plan).at(-1)!.plan!;
  expect(pointer.path).toEqual(oracle);expect(pointer.path_digest).toBe(keyboard.path_digest);
  expect((await observed(page)).requests.filter(x=>x.kind==='operate')).toEqual([]);
  await info.attach('real-preview-observation',{body:JSON.stringify(await observed(page)),contentType:'application/json'});
  await page.screenshot({path:info.outputPath('route-preview.png'),fullPage:true});
  await page.getByRole('button',{name:'撤销末点',exact:true}).click();
  await expect(page.locator('[data-route-point]')).toHaveCount(4);
  await expect(page.getByTestId('route-preview')).toHaveCount(0);
  await page.getByLabel('折点 4 x',{exact:true}).press('Escape');
  await expect(page.locator('[data-route-point]')).toHaveCount(0);
});

test('PG06 a genuinely delayed old preview cannot overwrite an edited route',async({page})=>{
  await start(page,true);await page.getByRole('button',{name:'拟定移动路线',exact:true}).click();
  await page.getByRole('button',{name:'新增折点',exact:true}).click();await page.getByLabel('折点 2 x',{exact:true}).fill('150');
  await page.getByRole('button',{name:'预览路线',exact:true}).click();
  await page.waitForFunction(()=>Reflect.get(window,'__b21RouteControl')?.held===true);
  await page.getByLabel('折点 2 x',{exact:true}).fill('180');
  await page.evaluate(()=>{const control=Reflect.get(window,'__b21RouteControl') as {release:()=>void};control.release();});
  await expect(page.getByRole('button',{name:'预览路线',exact:true})).toBeEnabled();
  await expect(page.getByTestId('route-preview')).toHaveCount(0);
  await page.getByRole('button',{name:'预览路线',exact:true}).click();
  await expect(page.getByTestId('route-preview')).toContainText('130 图上米');
  expect((await observed(page)).responses.filter(x=>x.plan).at(-1)?.plan?.path).toEqual([[50,150],[180,150]]);
  expect((await observed(page)).requests.filter(x=>x.kind==='operate')).toEqual([]);
});

test('PG06 a publicly invalid segment has no invented time and can be corrected without issuing',async({page})=>{
  await start(page);await page.getByRole('button',{name:'拟定移动路线',exact:true}).click();
  await page.getByRole('button',{name:'新增折点',exact:true}).click();
  await page.getByLabel('折点 2 x',{exact:true}).fill('100');await page.getByLabel('折点 2 y',{exact:true}).fill('200');
  await page.getByRole('button',{name:'预览路线',exact:true}).click();
  await expect(page.getByTestId('route-preview')).toContainText('规则行进估计未知');
  await expect(page.getByTestId('route-preview')).toContainText('第 1 段离开已知走廊');
  await page.getByLabel('折点 2 x',{exact:true}).fill('150');await page.getByLabel('折点 2 y',{exact:true}).fill('150');
  await expect(page.getByTestId('route-preview')).toHaveCount(0);
  await page.getByRole('button',{name:'预览路线',exact:true}).click();
  await expect(page.getByTestId('route-preview')).toContainText('100 图上米');
  await expect(page.getByTestId('route-preview')).toContainText('29.5 秒');
  expect((await observed(page)).requests.filter(x=>x.kind==='operate')).toEqual([]);
});

for(const viewport of [{width:1366,height:768},{width:1920,height:1080}])for(const dpr of [1,2])test.describe(`PG08 ${viewport.width} DPR${dpr}`,()=>{
  test.use({viewport,deviceScaleFactor:dpr});
  test('independent H/A control points verify pointer inverse and actual route overlay across zoom and resize',async({page},info)=>{
    await start(page);const map=page.locator('.map-canvas'),measurements:unknown[]=[];
    expect(await page.evaluate(()=>devicePixelRatio)).toBeCloseTo(dpr,6);
    for(const stage of ['low','fit','high','resize']){
      if(stage==='low')await page.getByRole('button',{name:'缩小地图',exact:true}).click();
      if(stage==='fit')await page.getByRole('button',{name:'全图',exact:true}).click();
      if(stage==='high'){await page.getByRole('button',{name:'放大地图',exact:true}).click();await page.getByRole('button',{name:'放大地图',exact:true}).click();}
      if(stage==='resize')await page.setViewportSize({width:viewport.width+80,height:viewport.height+40});
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      await page.getByRole('button',{name:'拟定移动路线',exact:true}).click();
      const h=(await page.locator('[data-anchor="H"]').boundingBox())!,a=(await page.locator('[data-anchor="A"]').boundingBox())!;
      const hc=[h.x+h.width/2,h.y+h.height/2],ac=[a.x+a.width/2,a.y+a.height/2];
      const scale=(ac[0]-hc[0])/100,target=[121.25,153.75],pixel=[hc[0]+(target[0]-50)*scale,hc[1]+(target[1]-150)*scale];
      await page.mouse.click(pixel[0],pixel[1]);
      const actual=[Number(await page.getByLabel('折点 2 x',{exact:true}).inputValue()),Number(await page.getByLabel('折点 2 y',{exact:true}).inputValue())];
      const inverseError=Math.hypot(actual[0]-target[0],actual[1]-target[1]);expect(inverseError).toBeLessThanOrEqual(0.1);
      const anchor=(await page.locator('[data-route-anchor="1"]').boundingBox())!;
      const overlayError=Math.hypot(anchor.x+anchor.width/2-pixel[0],anchor.y+anchor.height/2-pixel[1]);expect(overlayError).toBeLessThanOrEqual(1);
      const hit=await page.evaluate(([x,y])=>document.elementFromPoint(x,y)?.closest('.map-canvas')!==null,pixel);expect(hit).toBe(true);
      measurements.push({stage,viewport,dpr,controls:{H:hc,A:ac},target,actual,pixel,inverseError,overlayError,mapCamera:await map.getAttribute('data-camera')});
      await page.getByRole('button',{name:'取消路线',exact:true}).click();
    }
    expect((await observed(page)).requests.filter(x=>x.kind==='operate')).toEqual([]);
    await info.attach('independent-projection-measurements',{body:JSON.stringify(measurements),contentType:'application/json'});
  });
});
