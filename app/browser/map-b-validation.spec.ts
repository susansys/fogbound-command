import {test,expect} from '@playwright/test';
for(const fault of ['version','manifest-hash','png-hash','missing','path','length','schema','dimensions','nonfinite'] as const)test(`MB04 ${fault} refuses owned corrupt resources before using them and keeps legal objects`,async({page})=>{
  await page.addInitScript(()=>{
    const state=window as unknown as {regionPngDecodes:number};state.regionPngDecodes=0;
    const native=window.createImageBitmap;
    window.createImageBitmap=((...args:any[])=>{if(args[0] instanceof Blob&&args[0].type==='image/png')state.regionPngDecodes++;return Reflect.apply(native,window,args);}) as typeof createImageBitmap;
  });
  await page.route('**/*',async route=>{
    const url=route.request().url();
    if(!['png-hash','missing'].includes(fault)&&/\/manifest-[^/]+\.json$/.test(url)){
      const response=await route.fetch(),body=await response.text();
      const changed=fault==='version'?body.replace('"version": 1','"version": 2'):
        fault==='path'?body.replace('height.bin','../bad.bin'):
        fault==='length'?body.slice(0,-1):
        fault==='schema'?body.replace('"schema": 1','"schema": 2'):
        fault==='dimensions'?body.replace('"width": 401','"width": 402'):
        fault==='nonfinite'?body.replace('"scale": 1','"scale": 1e999'):
        body.replace('MAP-B-RURAL-20261014-1','MAP-B-RURAL-20261014-2');
      return route.fulfill({response,body:changed});
    }
    if((fault==='png-hash'||fault==='missing')&&/\/surface-0-0-[^/]+\.png$/.test(url)){
      if(fault==='missing')return route.fulfill({status:404,body:''});
      const response=await route.fetch(),body=await response.body();body[body.length-1]^=1;return route.fulfill({response,body});
    }
    return route.continue();
  });
  await page.goto('/');await page.getByLabel('时间方式').selectOption('research');await page.getByRole('button',{name:'开始演练',exact:true}).click();
  await expect(page.locator('.map')).toHaveAttribute('data-region-state','unavailable');
  await expect(page.getByRole('alert')).toContainText(fault==='version'||fault==='schema'?'版本':fault==='missing'?'缺失':fault==='dimensions'?'尺寸':['path','nonfinite','length'].includes(fault)?'长度':'hash');
  await expect(page.getByRole('button',{name:'工位H',exact:true})).toBeVisible();
  await expect(page.locator('.clock')).toContainText('已暂停');
  if(!['png-hash','missing'].includes(fault))expect(await page.evaluate(()=>(window as unknown as {regionPngDecodes:number}).regionPngDecodes)).toBe(0);
});
