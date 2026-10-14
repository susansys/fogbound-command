import {test,expect} from '@playwright/test';
import {observeGame,trace,start} from './map-a-helpers';

test('MB18 failed third native bitmap decode releases earlier and late images before explicit repair',async({page})=>{
 await page.addInitScript(()=>{
  const active=new Set<ImageBitmap>(),native=window.createImageBitmap;let count=0;
  (window as any).ownedRegionImages=()=>active.size;
  window.createImageBitmap=(async(...args:any[])=>{if(args[0] instanceof Blob&&args[0].type==='image/png'&&++count===3)throw Error('owned decode fault');const image=await Reflect.apply(native,window,args);active.add(image);const close=image.close.bind(image);image.close=()=>{active.delete(image);close();};return image;}) as typeof createImageBitmap;
 });
 await observeGame(page);await start(page,'FB02-ENG-RECORD');const map=page.locator('.map');await expect(map).toHaveAttribute('data-region-state','unavailable');const before=await trace(page);
 await expect.poll(()=>page.evaluate(()=>(window as any).ownedRegionImages())).toBe(0);
 await page.getByRole('button',{name:'修复本地地图显示',exact:true}).click();await expect(map).toHaveAttribute('data-region-state','ready');await expect.poll(()=>page.evaluate(()=>(window as any).ownedRegionImages())).toBe(34);
 await page.getByRole('button',{name:'任务调度',exact:true}).click();await expect.poll(()=>page.evaluate(()=>(window as any).ownedRegionImages())).toBe(0);
 const after=await trace(page);expect(after.requests.slice(before.requests.length)).toEqual([]);expect(after.views.at(-1)).toEqual(before.views.at(-1));
});

test('MB18 real GL context loss releases the failed map and explicit local repair preserves Game and text focus',async({page})=>{
  await observeGame(page);await start(page,'FB02-ENG-RECORD');
  const map=page.locator('.map');await expect(map).toHaveAttribute('data-region-state','ready');const before=await trace(page);
  const lost=await map.locator('canvas').evaluate(element=>{const gl=(element as HTMLCanvasElement).getContext('webgl2')!,extension=gl.getExtension('WEBGL_lose_context');if(!extension)return false;extension.loseContext();return true;});expect(lost).toBe(true);
  await expect(map).toHaveAttribute('data-region-state','unavailable');
  await expect(map.locator('canvas')).toHaveCount(0);
  await page.locator('.map-objects').getByRole('button',{name:'H · 工位',exact:true}).click();
  await expect(page.locator('[data-marker="H"]')).toHaveClass(/selected/);
  await page.getByRole('button',{name:'修复本地地图显示',exact:true}).click();await expect(map).toHaveAttribute('data-region-state','ready');await expect(map.locator('canvas')).toHaveCount(1);
  const after=await trace(page);expect(after.requests.slice(before.requests.length)).toEqual([]);expect(after.views.at(-1)).toEqual(before.views.at(-1));
});

test('MB16 complete R surface and shade cover all16 tiles and every internal seam without clear-background gaps',async({page},info)=>{
 await page.goto('/');await page.getByLabel('时间方式').selectOption('research');await page.getByRole('button',{name:'开始演练',exact:true}).click();
 const map=page.locator('.map');await expect(map).toHaveAttribute('data-region-state','ready');
 for(const mode of ['surface','shade']){
  await page.getByRole('button',{name:'地图图层',exact:true}).click();await page.getByLabel('地形表现',{exact:true}).selectOption(mode);await page.getByRole('button',{name:'区域全景（仅背景阅读）',exact:true}).click();await page.getByRole('button',{name:'地图图层',exact:true}).click();
  await page.evaluate(()=>new Promise<void>(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r()))));
  const box=(await map.boundingBox())!,camera=(await map.getAttribute('data-camera'))!.split(',').map(Number),png=await map.locator('canvas').screenshot({style:'.map [data-ui],.map .world-overlay,.map .plan-route{visibility:hidden!important}'});
  const controls=await page.evaluate(async({base64,camera,width,height,mode})=>{
   const bitmap=await createImageBitmap(new Blob([Uint8Array.from(atob(base64),c=>c.charCodeAt(0))],{type:'image/png'})),canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;const ctx=canvas.getContext('2d')!;ctx.drawImage(bitmap,0,0);bitmap.close();const rgba=ctx.getImageData(0,0,canvas.width,canvas.height).data,rx=canvas.width/width,ry=canvas.height/height;
   const points:number[][]=[];for(const u of [1280,3840,6400,8840])for(const v of [1280,3840,6400,8840])points.push([u,v]);
   for(const seam of [2560,5120,7680])for(const along of [1250,3750,6250,8750])for(const delta of [-.5,0,.5]){points.push([seam+delta/(camera[2]*rx),along],[along,seam+delta/(camera[2]*ry)]);}
   return points.map(([u,v])=>{const x=Math.floor((camera[0]+(u-4800)*camera[2])*rx),y=Math.floor((camera[1]+(v-4850)*camera[2])*ry),i=(y*canvas.width+x)*4,col=Array.from(rgba.slice(i,i+4));return{u,v,col,covered:col.length===4&&col[3]===255&&col.slice(0,3).some((c,k)=>Math.abs(c-[28,41,41][k])>8),gray:mode!=='shade'||Math.max(...col.slice(0,3))-Math.min(...col.slice(0,3))<=1};});
  },{base64:png.toString('base64'),camera,width:box.width,height:box.height,mode});
  for(const point of controls){expect(point.covered,JSON.stringify(point)).toBe(true);expect(point.gray,JSON.stringify(point)).toBe(true);}
  await info.attach(`${mode}-full-R`,{body:png,contentType:'image/png'});await info.attach(`${mode}-independent-seams`,{body:JSON.stringify(controls),contentType:'application/json'});
 }
});

test('MB14 same-camera shade and surface show honest simulation bands and authoritative river zero/negative values',async({page})=>{
  await page.goto('/');await page.getByLabel('时间方式').selectOption('research');await page.getByRole('button',{name:'开始演练',exact:true}).click();
  const map=page.locator('.map');await expect(map).toHaveAttribute('data-region-state','ready');
  await page.getByRole('button',{name:'地图图层',exact:true}).click();
  await page.getByLabel('地形表现',{exact:true}).selectOption('shade');
  await expect(map).toHaveAttribute('data-terrain-mode','shade');
  await page.getByRole('button',{name:'区域全景（仅背景阅读）',exact:true}).click();await page.getByRole('button',{name:'地图图层',exact:true}).click();
  await page.getByRole('button',{name:'图例 展开',exact:true}).click();
  await expect(page.locator('.map-legend')).toContainText('模拟高程（相对虚构基准，图上米）');
  await expect(page.locator('.height-bands li')).toHaveCount(7);
  await page.getByRole('button',{name:'图例 收起',exact:true}).click();
  for(const [u,v,value] of [[7000,5000,0],[6625,7500,-30],[7375,2500,30]]){
    const box=(await map.boundingBox())!,[x,y,s]=(await map.getAttribute('data-camera'))!.split(',').map(Number);
    await page.mouse.move(box.x+x+(u-4800)*s,box.y+y+(v-4850)*s);
    await expect(page.locator('.map-coordinate')).toContainText(`模拟高程（相对虚构基准，图上米）：${value.toFixed(2)}`);
  }
  const camera=await map.getAttribute('data-camera');
  await page.getByRole('button',{name:'地图图层',exact:true}).click();await page.getByLabel('地形表现',{exact:true}).selectOption('surface');
  await expect(map).toHaveAttribute('data-terrain-mode','surface');expect(await map.getAttribute('data-camera')).toBe(camera);
  await expect(map.locator('canvas')).toHaveCount(1);await expect(page.locator('.clock')).toContainText('已暂停');
});
