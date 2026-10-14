import {test,expect,type Page} from '@playwright/test';
import {observeGame,trace,start} from './map-a-helpers';

async function coordinates(page:Page,points:readonly(readonly[number,number])[]){
  const map=page.locator('.map'),box=(await map.boundingBox())!,[ox,oy,s]=(await map.getAttribute('data-camera'))!.split(',').map(Number);
  const rows=[];
  for(const [x,y] of points){
    await page.mouse.move(box.x+ox+x*s,box.y+oy+y*s);
    const text=await page.locator('.map-coordinate').innerText(),match=text.match(/图上(-?[\d.]+), (-?[\d.]+)/)!;
    const actual=[Number(match[1]),Number(match[2])],error=Math.hypot(actual[0]-x,actual[1]-y);expect(error).toBeLessThanOrEqual(.1);rows.push({expected:[x,y],actual,error});
  }
  return rows;
}

async function backgroundControls(page:Page){
  // Locator screenshots include HTML layered over the canvas. Temporarily mask
  // only public labels/routes for terrain P; full UI/overlay captures remain separate.
  const map=page.locator('.map'),box=(await map.boundingBox())!,camera=(await map.getAttribute('data-camera'))!.split(',').map(Number),png=await map.locator('canvas').screenshot({style:'.map .world-overlay,.map .plan-route{visibility:hidden!important}'});
  return page.evaluate(async ({base64,camera,width,height})=>{
    const bitmap=await createImageBitmap(new Blob([Uint8Array.from(atob(base64),c=>c.charCodeAt(0))],{type:'image/png'})),canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;
    const ctx=canvas.getContext('2d')!;ctx.drawImage(bitmap,0,0);bitmap.close();const rgba=ctx.getImageData(0,0,canvas.width,canvas.height).data,ratioX=canvas.width/width,ratioY=canvas.height/height;
    // Independent river P controls and literal colour from the frozen original R.
    return [[7375,2500],[7000,5000],[6625,7500]].map(([u,v])=>{
      const px=(camera[0]+(u-4800)*camera[2])*ratioX,py=(camera[1]+(v-4850)*camera[2])*ratioY;let error=Infinity;
      for(let y=Math.floor(py-ratioY);y<=Math.ceil(py+ratioY);y++)for(let x=Math.floor(px-ratioX);x<=Math.ceil(px+ratioX);x++){
        const i=(y*canvas.width+x)*4;if(x>=0&&x<canvas.width&&y>=0&&y<canvas.height&&Math.abs(rgba[i]-39)<=3&&Math.abs(rgba[i+1]-78)<=3&&Math.abs(rgba[i+2]-90)<=3)error=Math.min(error,Math.hypot((x+.5-px)/ratioX,(y+.5-py)/ratioY));
      }return{regional:[u,v],cssError:error};
    });
  },{base64:png.toString('base64'),camera,width:box.width,height:box.height});
}

for(const width of [1366,1920])for(const dpr of [1,2])test(`MB07/08 ${width} DPR${dpr} three public scenes/complete-region P stay aligned under real camera actions`,async({browser},info)=>{
 const audit=[];
 for(const definition of ['FB01-ENG-MOVE','FB02-ENG-RECORD','ENG-PRESTART-REPLACE']){
  const context=await browser.newContext({viewport:{width,height:width===1366?768:1080},deviceScaleFactor:dpr}),page=await context.newPage();
  try{
  await observeGame(page);await start(page,definition);
  await expect(page.locator('.map')).toHaveAttribute('data-region-state','ready');
  await page.getByRole('button',{name:'任务调度',exact:true}).click();await page.getByRole('button',{name:definition==='FB02-ENG-RECORD'?'查看记录预案':'查看通行预案',exact:true}).click();
  await page.getByRole('button',{name:'态势地图',exact:true}).click();
  const map=page.locator('.map');await expect(map).toHaveAttribute('data-region-state','ready');const before=await trace(page);
  const actualDpr=await page.evaluate(()=>devicePixelRatio);expect(Math.abs(actualDpr-dpr)).toBeLessThanOrEqual(.000001);
  info.annotations.push({type:'native-density',description:JSON.stringify({definition,width,requested:dpr,actual:actualDpr})});
  await expect(page.locator('[data-anchor="H"]')).toHaveCount(1);
  await expect(page.locator('[data-marker="N"]')).toHaveCount(definition==='ENG-PRESTART-REPLACE'?1:0);
  await expect(page.locator('[data-marker="T"]')).toHaveCount(definition==='FB02-ENG-RECORD'?0:1);
  const errors=await map.evaluate((element,definition)=>{
    const rect=element.getBoundingClientRect(),[x,y,s]=element.getAttribute('data-camera')!.split(',').map(Number);
    const points=[['H',50,150],...(definition==='ENG-PRESTART-REPLACE'?[['N',110,150]]:[]),...(definition!=='FB02-ENG-RECORD'?[['T',170,150]]:[])];
    const measured=points.map(([id,u,v])=>{const anchor=element.querySelector(`[data-anchor="${id}"]`)!.getBoundingClientRect();return Math.hypot(anchor.left+anchor.width/2-rect.left-(x+Number(u)*s),anchor.top+anchor.height/2-rect.top-(y+Number(v)*s));});
    const symbol=element.querySelector('img.mil-symbol')!.getBoundingClientRect();measured.push(Math.hypot(symbol.left+symbol.width/2-rect.left-(x+50*s),symbol.top+symbol.height/2-rect.top-(y+150*s)));
    const path=element.querySelector<SVGPathElement>('.plan-route path[stroke-dasharray]');
    if(definition==='FB02-ENG-RECORD'){if(path)throw Error('Record must not acquire a movement route');}
    else{if(!path)throw Error('Missing legal plan');for(const [index,[u,v]] of [[50,150],[definition==='ENG-PRESTART-REPLACE'?110:170,150]].entries()){const screen=path.getPointAtLength(index===0?0:path.getTotalLength());measured.push(Math.hypot(screen.x-(x+u*s),screen.y-(y+v*s)));}}
    return measured;
  },definition);
  expect(Math.max(...errors)).toBeLessThanOrEqual(1);
  const gamePoints=await coordinates(page,[[0,0],[400,0],[0,300],[400,300],[200,150]]);
  await page.getByRole('button',{name:'地图图层',exact:true}).click();await page.getByRole('button',{name:'区域全景（仅背景阅读）',exact:true}).click();await page.getByRole('button',{name:'地图图层',exact:true}).click();
  // Frozen mapping: domain0..10000 centred on Game200/150. Raster seams are2560m.
  const regionPoints=await coordinates(page,[[-4800,-4850],[5200,-4850],[-4800,5150],[5200,5150],[200,150],[-2240,-2290],[320,270],[2880,2830]]);
  const pixelPoints=await backgroundControls(page);expect(Math.max(...pixelPoints.map(point=>point.cssError))).toBeLessThanOrEqual(1);
  audit.push({definition,width,dpr,actualDpr,browser:browser.version(),overlayErrors:errors,gamePoints,regionPoints,pixelPoints});
  await page.screenshot({path:info.outputPath(`${definition}-whole-region-full-workbench.png`),fullPage:true});
  await page.getByRole('button',{name:'全图',exact:true}).click();
  await page.setViewportSize({width:width-120,height:width===1366?700:960});await page.getByRole('button',{name:'全图',exact:true}).click();
  await coordinates(page,[[0,0],[400,0],[0,300],[400,300],[200,150]]);
  const initial=(await map.getAttribute('data-camera'))!.split(',').map(Number),box=(await map.boundingBox())!;
  await page.mouse.move(box.x+box.width-230,box.y+130);await page.mouse.down();await page.mouse.move(box.x+box.width-180,box.y+150,{steps:6});await page.mouse.up();
  const dragged=(await map.getAttribute('data-camera'))!.split(',').map(Number);expect(dragged[0]-initial[0]).toBeCloseTo(50,4);expect(dragged[1]-initial[1]).toBeCloseTo(20,4);
  await map.focus();await page.keyboard.press('ArrowUp');const keyed=(await map.getAttribute('data-camera'))!.split(',').map(Number);expect(keyed[1]-dragged[1]).toBeCloseTo(30,4);
  await page.getByRole('button',{name:'全图',exact:true}).click();
  const after=await trace(page);expect(after.views.at(-1)).toEqual(before.views.at(-1));expect(after.requests.slice(before.requests.length)).toEqual([]);
  await expect(map.locator('canvas')).toHaveCount(1);
  await page.screenshot({path:info.outputPath(`${definition}-action-area-full-workbench.png`),fullPage:true});
  }finally{await context.close();}
 }
 await info.attach('independent-projection-audit',{body:Buffer.from(JSON.stringify(audit,null,2)),contentType:'application/json'});
});
