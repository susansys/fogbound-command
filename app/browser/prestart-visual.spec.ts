import {test,expect} from '@playwright/test';
for(const width of [1366,1920])for(const doubled of [false,true])test(`CR28 preparation map labels stay distinct and selectable at ${width}, doubled text=${doubled}`,async({page},testInfo)=>{
  await page.setViewportSize({width,height:width===1366?768:1080});await page.goto('/');await page.getByLabel('演练任务').selectOption('ENG-PRESTART-REPLACE');await page.getByLabel('时间方式').selectOption('research');await page.getByRole('button',{name:'开始演练',exact:true}).click();await expect(page.getByRole('region',{name:'公开态势地图'}).locator('canvas')).toHaveCount(1);
  if(doubled)await page.evaluate(()=>{const elements=[...document.querySelectorAll<HTMLElement>('*')],sizes=elements.map(element=>parseFloat(getComputedStyle(element).fontSize));elements.forEach((element,index)=>{if(Number.isFinite(sizes[index]))element.style.fontSize=`${sizes[index]*2}px`;});});
  const markers=await page.locator('.world-overlay .site-marker').evaluateAll(elements=>elements.map(element=>({id:(element as HTMLElement).dataset.marker,box:element.getBoundingClientRect().toJSON()})));
  for(const [index,left] of markers.entries())for(const right of markers.slice(index+1)){
    const a=left.box,b=right.box;expect(a.right<=b.left||b.right<=a.left||a.bottom<=b.top||b.bottom<=a.top,`${left.id}/${right.id} visual marker overlap`).toBe(true);
  }
  await page.getByRole('button',{name:'近联络点N',exact:true}).focus();await page.keyboard.press('Enter');await expect(page.locator('.inspector .facts')).toContainText('110.00, 150.00');
  await page.getByRole('button',{name:'定位选中',exact:true}).click();await page.getByRole('button',{name:'放大地图',exact:true}).click();await page.getByRole('button',{name:'缩小地图',exact:true}).click();await page.getByRole('button',{name:'全图',exact:true}).click();
  await page.screenshot({path:testInfo.outputPath('preparation-map.png'),fullPage:true});
  await page.getByRole('button',{name:'任务调度',exact:true}).click();await page.getByRole('button',{name:'查看通行预案',exact:true}).click();await page.getByLabel('指挥意图（选填）').fill('字号调整后能阅读并编辑');await page.getByRole('button',{name:'取消预案',exact:true}).click();await expect(page.locator('.clock strong')).toHaveText('00:00');
});
