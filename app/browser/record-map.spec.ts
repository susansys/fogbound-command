import {test,expect} from '@playwright/test';

test('FB02-S16 Record co-located labels and task controls remain reachable with doubled text',async({page})=>{
  await page.setViewportSize({width:1366,height:768});
  await page.goto('/');await page.getByLabel('时间方式').selectOption('research');
  await page.getByRole('button',{name:'开始演练',exact:true}).click();
  const map=page.getByRole('region',{name:'公开态势地图'});
  await expect(map.locator('canvas')).toHaveCount(1);
  await page.evaluate(()=>{
    const elements=Array.from(document.querySelectorAll<HTMLElement>('*'));
    const sizes=elements.map(e=>parseFloat(getComputedStyle(e).fontSize));
    elements.forEach((e,i)=>{if(Number.isFinite(sizes[i]))e.style.fontSize=`${sizes[i]*2}px`;});
  });
  const h=await page.locator('.site-marker').boundingBox(),r=await page.locator('.unit-marker').boundingBox();
  expect(h!.y+h!.height).toBeLessThan(r!.y);
  await page.getByRole('button',{name:'定位工位H',exact:true}).click();
  await page.getByRole('button',{name:'任务调度',exact:true}).click();
  await page.getByRole('button',{name:'查看记录预案',exact:true}).click();
  await page.getByLabel('指挥意图（选填）').fill('放大文字后仍可编辑');
  await page.getByRole('button',{name:'取消预案',exact:true}).click();
  await expect(page.locator('.clock strong')).toHaveText('00:00');
  await page.getByRole('button',{name:'查看记录预案',exact:true}).click();
  await expect(page.getByLabel('指挥意图（选填）')).toHaveValue('放大文字后仍可编辑');
});
