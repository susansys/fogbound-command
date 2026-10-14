import {test,expect} from '@playwright/test';
test('MB01/MB05 the current offline entry shows a complete original 10km region with trusted resources and legal Game objects',async({page},info)=>{
  const external:string[]=[];
  await page.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin===new URL(process.env.FB01_URL??'http://127.0.0.1:4175').origin)return route.continue();external.push(url.origin);return route.abort();});
  await page.goto('/');await page.getByLabel('时间方式').selectOption('research');
  await page.getByRole('button',{name:'开始演练',exact:true}).click();
  await expect(page.getByText('程序生成的虚构区域；不代表任何现实地点',{exact:true})).toBeVisible();
  await expect(page.locator('.map')).toHaveAttribute('data-region-state','ready');
  await page.getByRole('button',{name:'地图图层',exact:true}).click();
  await expect(page.getByRole('button',{name:'区域全景（仅背景阅读）',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'区域全景（仅背景阅读）',exact:true}).click();
  await page.getByRole('button',{name:'地图图层',exact:true}).click();
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const image=await page.locator('.map').screenshot({path:info.outputPath('complete-regional-panorama.png')});
  const visible=await page.evaluate(async base64=>{
    const bytes=Uint8Array.from(atob(base64),c=>c.charCodeAt(0)),bitmap=await createImageBitmap(new Blob([bytes],{type:'image/png'})),canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;
    const ctx=canvas.getContext('2d')!;ctx.drawImage(bitmap,0,0);bitmap.close();const rgba=ctx.getImageData(0,0,canvas.width,canvas.height).data,colours=new Set<string>();let terrain=0,water=0;
    for(let i=0;i<rgba.length;i+=4){const r=rgba[i],g=rgba[i+1],b=rgba[i+2];if(r>45&&g>55&&b>30&&Math.max(r,g,b)-Math.min(r,g,b)>15){terrain++;colours.add(`${r},${g},${b}`);}if(Math.abs(r-39)<3&&Math.abs(g-78)<3&&Math.abs(b-90)<3)water++;}
    return{terrain,water,colours:colours.size};
  },image.toString('base64'));
  expect(visible.terrain).toBeGreaterThan(5000);expect(visible.water).toBeGreaterThan(100);expect(visible.colours).toBeGreaterThan(100);
  await expect(page.getByRole('button',{name:'工位H',exact:true})).toBeVisible();
  await expect(page.getByTestId('position')).toHaveText('50.00, 150.00');
  await expect(page.locator('.map canvas')).toHaveCount(1);
  expect(external).toEqual([]);
  await page.getByRole('button',{name:'地图图层',exact:true}).click();
  await page.getByRole('button',{name:'区域资料与来源',exact:true}).click();
  const notices=page.getByRole('link',{name:'运行库许可与版权原文',exact:true});
  await expect(notices).toBeVisible();
  const response=await page.request.get((await notices.getAttribute('href'))!);
  expect(response.ok()).toBe(true);const text=await response.text();
  expect(text).toContain('@pixi/colord@2.9.6');expect(text).toContain('Copyright (c) 2020 Vlad Shilov');
  expect(text).toContain('murmurhash-js@1.0.0');expect(text).toContain('Copyright (c) 2011 Gary Court');
});
