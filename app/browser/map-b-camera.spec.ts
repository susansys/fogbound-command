import {test,expect} from '@playwright/test';

test('MB07 stationary pointer is projected again after keyboard camera movement',async({page})=>{
  await page.goto('/');await page.getByLabel('时间方式').selectOption('research');await page.getByRole('button',{name:'开始演练',exact:true}).click();
  const map=page.locator('.map');await expect(map).toHaveAttribute('data-region-state','ready');
  const box=(await map.boundingBox())!,[x,y,s]=(await map.getAttribute('data-camera'))!.split(',').map(Number),px=x+100*s,py=y+100*s;
  await map.focus();await page.mouse.move(box.x+px,box.y+py);
  for(const key of ['+','ArrowUp']){
    await page.keyboard.press(key);
    const [cx,cy,scale]=(await map.getAttribute('data-camera'))!.split(',').map(Number);
    await expect(page.locator('.map-coordinate')).toContainText(`图上${((px-cx)/scale).toFixed(2)}, ${((py-cy)/scale).toFixed(2)}`);
  }
});

test('MB08 regional panorama zoom stays on the same camera without snapping to the small Game fit',async({page})=>{
  await page.goto('/');await page.getByLabel('时间方式').selectOption('research');
  await page.getByRole('button',{name:'开始演练',exact:true}).click();
  const map=page.locator('.map');await expect(map).toHaveAttribute('data-region-state','ready');
  await page.getByRole('button',{name:'地图图层',exact:true}).click();
  await page.getByRole('button',{name:'区域全景（仅背景阅读）',exact:true}).click();
  await page.getByRole('button',{name:'地图图层',exact:true}).click();
  const before=(await map.getAttribute('data-camera'))!.split(',').map(Number);
  await page.getByRole('button',{name:'放大地图',exact:true}).click();
  const after=(await map.getAttribute('data-camera'))!.split(',').map(Number);
  expect(after[2]/before[2]).toBeCloseTo(1.2,6);
  await page.getByRole('button',{name:'缩小地图',exact:true}).click();
  const returned=(await map.getAttribute('data-camera'))!.split(',').map(Number);
  for(let i=0;i<3;i++)expect(returned[i]).toBeCloseTo(before[i],6);
  await expect(page.locator('.map canvas')).toHaveCount(1);
  await expect(page.getByTestId('position')).toHaveText('50.00, 150.00');
  await expect(page.locator('.clock')).toContainText('已暂停');
});

test('MB09 outside the regional domain stays explicitly unknown and cannot create a decorative target',async({page})=>{
  await page.goto('/');await page.getByLabel('时间方式').selectOption('research');await page.getByRole('button',{name:'开始演练',exact:true}).click();
  const map=page.locator('.map');await expect(map).toHaveAttribute('data-region-state','ready');
  await page.getByRole('button',{name:'地图图层',exact:true}).click();await page.getByRole('button',{name:'区域全景（仅背景阅读）',exact:true}).click();await page.getByRole('button',{name:'地图图层',exact:true}).click();
  const box=(await map.boundingBox())!;await page.mouse.move(box.x+40,box.y+100);await page.mouse.click(box.x+40,box.y+100);
  await expect(page.locator('.map-coordinate')).toContainText('区域界外：无地形资料');
  await expect(page.locator('.map-objects button')).toHaveText(['R · 记录组','H · 工位']);
  await expect(page.locator('.plan')).toHaveCount(0);await expect(page.locator('.clock strong')).toHaveText('00:00');
});

test('MB11 co-located public R/H remain reachable by Tab/Enter and Escape returns focus to the map',async({page})=>{
  await page.goto('/');await page.getByLabel('时间方式').selectOption('research');await page.getByRole('button',{name:'开始演练',exact:true}).click();
  const map=page.locator('.map');await expect(map).toHaveAttribute('data-region-state','ready');
  const list=page.locator('.map-objects');await expect(list.locator('button')).toHaveText(['R · 记录组','H · 工位']);
  await list.getByRole('button',{name:'R · 记录组',exact:true}).focus();await page.keyboard.press('Enter');
  await expect(page.locator('[data-marker="R"]')).toHaveClass(/selected/);
  await page.keyboard.press('Tab');await expect(list.getByRole('button',{name:'H · 工位',exact:true})).toBeFocused();await page.keyboard.press('Enter');
  await expect(page.locator('[data-marker="H"]')).toHaveClass(/selected/);
  await page.keyboard.press('Escape');await expect(map).toBeFocused();
  await page.getByRole('button',{name:'地图图层',exact:true}).click();await page.getByRole('button',{name:'区域资料与来源',exact:true}).click();
  await page.keyboard.press('Escape');await expect(page.locator('.map-layers,.map-source')).toHaveCount(0);await expect(map).toBeFocused();
});

test('MB09 the visible scale bar remains proportional and readable in Game fit and the 10km panorama',async({page})=>{
  await page.setViewportSize({width:1920,height:1080});await page.goto('/');await page.getByLabel('时间方式').selectOption('research');
  await page.getByRole('button',{name:'开始演练',exact:true}).click();
  const map=page.locator('.map');await expect(map).toHaveAttribute('data-region-state','ready');
  for(const panorama of [false,true]){
    if(panorama){await page.getByRole('button',{name:'地图图层',exact:true}).click();await page.getByRole('button',{name:'区域全景（仅背景阅读）',exact:true}).click();await page.getByRole('button',{name:'地图图层',exact:true}).click();}
    const scale=Number((await map.getAttribute('data-camera'))!.split(',')[2]),metres=parseFloat((await page.locator('.scale').innerText()).trim());
    const bar=(await page.locator('.scale i').boundingBox())!;
    expect(Math.abs(bar.width-metres*scale)).toBeLessThanOrEqual(1);
    expect(bar.width).toBeGreaterThanOrEqual(40);expect(bar.width).toBeLessThanOrEqual(110);
  }
});

test('MB07 map pointer reads independent Game and regional P coordinates through the visible Workbench',async({page})=>{
  await page.goto('/');await page.getByLabel('时间方式').selectOption('research');
  await page.getByRole('button',{name:'开始演练',exact:true}).click();
  const map=page.locator('.map');await expect(map).toHaveAttribute('data-region-state','ready');
  const box=(await map.boundingBox())!,[x,y,s]=(await map.getAttribute('data-camera'))!.split(',').map(Number);
  await page.mouse.move(box.x+x+200*s,box.y+y+150*s);
  await expect(page.locator('.map-coordinate')).toContainText('图上200.00, 150.00');
  await expect(page.locator('.map-coordinate')).toContainText('区域5000.00, 5000.00');
});

test('MB07 real R symbol centre follows independent public position P within one CSS pixel',async({page})=>{
  await page.goto('/');await page.getByLabel('时间方式').selectOption('research');
  await page.getByRole('button',{name:'开始演练',exact:true}).click();
  const map=page.locator('.map');await expect(map).toHaveAttribute('data-region-state','ready');
  const result=await map.evaluate(element=>{
    const rect=element.getBoundingClientRect(),image=element.querySelector('img.mil-symbol')!.getBoundingClientRect();
    const [x,y,s]=element.getAttribute('data-camera')!.split(',').map(Number);
    return Math.hypot(image.left+image.width/2-rect.left-(x+50*s),image.top+image.height/2-rect.top-(y+150*s));
  });
  expect(result).toBeLessThanOrEqual(1);
});
