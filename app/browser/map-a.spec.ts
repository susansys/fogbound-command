import {test,expect} from '@playwright/test';

test('MA01 the existing layer entry opens a labelled local synthetic map while Pixi remains the default',async({page})=>{
  const requests:string[]=[];
  page.on('request',request=>requests.push(request.url()));
  await page.goto('/');
  await page.getByLabel('时间方式').selectOption('research');
  await page.getByRole('button',{name:'开始演练',exact:true}).click();
  await expect(page.locator('.map canvas')).toHaveCount(1);
  await page.getByRole('button',{name:'地图图层',exact:true}).click();
  const synthetic=page.getByRole('checkbox',{name:'合成验证底图',exact:true});
  await expect(synthetic).not.toBeChecked();
  await synthetic.check();
  await expect(page.locator('.map')).toHaveAttribute('data-renderer','synthetic-ready');
  await expect(page.getByText('合成验证资料 · 非遥感影像',{exact:true})).toBeVisible();
  await expect(page.locator('.map canvas')).toHaveCount(1);
  await expect(page.getByRole('button',{name:'工位H',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'编组R最后确认位置',exact:true})).toBeVisible();
  const box=(await page.locator('.map').boundingBox())!;
  const png=await page.screenshot({clip:box});
  const gridPixels=await page.evaluate(async base64=>{
    const bytes=Uint8Array.from(atob(base64),character=>character.charCodeAt(0));
    const bitmap=await createImageBitmap(new Blob([bytes],{type:'image/png'})),canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;
    const context=canvas.getContext('2d')!;context.drawImage(bitmap,0,0);bitmap.close();const pixels=context.getImageData(0,0,canvas.width,canvas.height).data;
    let count=0;for(let i=0;i<pixels.length;i+=4)if(Math.abs(pixels[i]-35)<=3&&Math.abs(pixels[i+1]-62)<=3&&Math.abs(pixels[i+2]-66)<=3)count++;
    return count;
  },png.toString('base64'));
  expect(gridPixels).toBeGreaterThan(1000);
  const origin=new URL(page.url()).origin;
  expect(requests.filter(url=>/^https?:/.test(url)&&new URL(url).origin!==origin)).toEqual([]);
});

async function startSynthetic(page:import('@playwright/test').Page,definition='FB02-ENG-RECORD'){
  await page.goto('/');await page.getByLabel('演练任务').selectOption(definition);await page.getByLabel('时间方式').selectOption('research');
  await page.getByRole('button',{name:'开始演练',exact:true}).click();await page.getByRole('button',{name:'地图图层',exact:true}).click();
  await page.getByRole('checkbox',{name:'合成验证底图',exact:true}).check();await expect(page.locator('.map')).toHaveAttribute('data-renderer','synthetic-ready');
}
for(const definition of ['FB01-ENG-MOVE','FB02-ENG-RECORD','ENG-PRESTART-REPLACE']){
  test(`MA03 ${definition} only renders its legal sites and the last-confirmed team with one camera`,async({page},info)=>{
    await startSynthetic(page,definition);
    await expect(page.locator('.map canvas')).toHaveCount(1);
    await expect(page.locator('[data-marker="N"]')).toHaveCount(definition==='ENG-PRESTART-REPLACE'?1:0);
    await expect(page.locator('[data-marker="T"]')).toHaveCount(definition==='FB02-ENG-RECORD'?0:1);
    await page.getByRole('button',{name:'地图图层',exact:true}).click();
    const deltas=await page.locator('.map').evaluate(map=>{
      const [ox,oy,scale]=(map.getAttribute('data-camera')??'').split(',').map(Number);
      const points:{id:string;x:number;y:number}[]=[{id:'H',x:50,y:150},...(map.querySelector('[data-anchor="N"]')?[{id:'N',x:110,y:150}]:[]),...(map.querySelector('[data-anchor="T"]')?[{id:'T',x:170,y:150}]:[])];
      return points.map(({id,x,y})=>{const anchor=map.querySelector<HTMLElement>(`[data-anchor="${id}"]`)!;return Math.hypot(parseFloat(anchor.style.left)-(ox+x*scale),parseFloat(anchor.style.top)-(oy+y*scale));});
    });
    expect(Math.max(...deltas)).toBeLessThanOrEqual(1);
    if(definition==='FB02-ENG-RECORD')await expect(page.getByRole('button',{name:'工位H',exact:true})).toBeVisible();
    await expect(page.getByRole('button',{name:'编组R最后确认位置',exact:true})).toBeVisible();
    await page.screenshot({path:info.outputPath('legal-sites.png'),fullPage:true});
  });
}
test('MA04 game fit, independent background panorama, colour variant and return preserve selected public objects',async({page})=>{
  await startSynthetic(page,'ENG-PRESTART-REPLACE');
  await page.locator('.map-objects').getByRole('button',{name:'N · 联络点',exact:true}).click();
  const selected=page.locator('[data-marker="N"]');await expect(selected).toHaveClass(/selected/);
  const camera=await page.locator('.map').getAttribute('data-camera');
  await page.getByRole('button',{name:'合成资料与范围',exact:true}).click();
  await expect(page.locator('.map-source')).toContainText('背景范围不是可执行区域');
  await page.getByRole('button',{name:'区域全景',exact:true}).click();
  const overview=await page.locator('.map').getAttribute('data-camera');expect(overview).not.toBe(camera);
  await page.getByRole('button',{name:'切换颜色变体',exact:true}).click();
  await expect(selected).toHaveClass(/selected/);await expect(page.locator('.map')).toHaveAttribute('data-camera',overview!);
  await page.getByRole('button',{name:'返回操作范围',exact:true}).click();
  const returned=(await page.locator('.map').getAttribute('data-camera'))!.split(',').map(Number),original=camera!.split(',').map(Number);
  returned.forEach((value,index)=>expect(Math.abs(value-original[index])).toBeLessThan(0.001));
  await expect(page.locator('.scale')).toContainText('图上米');
  await page.getByRole('checkbox',{name:'合成验证底图',exact:true}).uncheck();
  await expect(page.locator('.map')).toHaveAttribute('data-renderer','pixi');await expect(page.locator('.map canvas')).toHaveCount(1);await expect(selected).toHaveClass(/selected/);
});
test('MA02 real geographic camera independently round-trips five floating control points in the readonly source panel',async({page})=>{
  await startSynthetic(page,'ENG-PRESTART-REPLACE');
  await page.getByRole('button',{name:'合成资料与范围',exact:true}).click();
  await page.getByRole('button',{name:'检验显示配准',exact:true}).click();
  const controls=page.locator('.map-coordinate-check tbody tr');await expect(controls).toHaveCount(5);
  const actual=await controls.evaluateAll(rows=>rows.map(row=>({x:Number(row.getAttribute('data-return-x')),y:Number(row.getAttribute('data-return-y')),error:Number(row.getAttribute('data-error'))})));
  const expected=[[0,0],[400,0],[0,300],[400,300],[200,150]];
  actual.forEach((point,index)=>{expect(Math.hypot(point.x-expected[index][0],point.y-expected[index][1])).toBeLessThanOrEqual(0.1);expect(point.error).toBeLessThanOrEqual(0.1);});
});
