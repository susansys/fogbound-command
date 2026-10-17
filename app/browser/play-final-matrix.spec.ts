import {test,expect} from '@playwright/test';

for(const width of [1366,1920])for(const dpr of [1,2])test.describe(`B21 ${width} DPR${dpr}`,()=>{
  test.use({viewport:{width,height:width===1366?768:1080},deviceScaleFactor:dpr});
  test('PG14-16 keyboard and pointer issue, received fix, readonly history and return are reachable at the actual viewport',async({page},info)=>{
    await page.goto('/');await page.getByLabel('演练任务').selectOption('B21-CORRIDOR-01');await page.getByLabel('时间方式').selectOption('research');await page.getByRole('button',{name:'开始演练',exact:true}).click();
    const map=page.locator('.map-canvas');await expect(map).toHaveAttribute('data-region-state','ready',{timeout:25000});
    // Windows can expose 1.0000000149 for requested DPR1; retain the actual DPR
    // in the overlay attachment and the independent one-CSS-pixel alignment gate.
    expect(await page.evaluate(()=>devicePixelRatio)).toBeCloseTo(dpr,6);
    await page.getByRole('button',{name:'范围 pending-location',exact:true}).click();await expect(page.getByTestId('scope-detail')).toContainText('没有可用的图上位置');await expect(page.locator('[data-marker="pending-location"]')).toHaveCount(0);await page.locator('.map-objects').getByRole('button',{name:'R · 联络组',exact:true}).click();
    await page.getByRole('button',{name:'拟定移动路线',exact:true}).click();await page.getByRole('button',{name:'新增折点',exact:true}).press('Enter');await page.getByLabel('折点 2 x',{exact:true}).focus();await page.keyboard.press('Shift+Tab');await page.keyboard.press('Tab');await page.getByLabel('折点 2 x',{exact:true}).fill('150');await page.getByRole('button',{name:'预览路线',exact:true}).press('Enter');await expect(page.getByTestId('route-preview')).toContainText('29.5 秒');await page.getByLabel('折点 2 x',{exact:true}).press('Escape');await expect(page.locator('[data-route-point]')).toHaveCount(0);
    await page.getByRole('button',{name:'拟定移动路线',exact:true}).click();
    const a=await map.locator('[data-anchor="A"]').boundingBox();if(!a)throw Error('Expected independent A anchor');await page.mouse.click(a.x+a.width/2,a.y+a.height/2);await expect(page.locator('[data-route-point]')).toHaveCount(2);
    const pointer={x:Number(await page.getByLabel('折点 2 x',{exact:true}).inputValue()),y:Number(await page.getByLabel('折点 2 y',{exact:true}).inputValue())};expect(Math.hypot(pointer.x-150,pointer.y-150)).toBeLessThanOrEqual(.1);
    // Pointer rounding is tested above; the literal receive-time oracle below
    // deliberately uses an exact 100m route entered through the public editor.
    await page.getByLabel('折点 2 x',{exact:true}).fill('150');await page.getByLabel('折点 2 y',{exact:true}).fill('150');
    await page.getByRole('button',{name:'预览路线',exact:true}).click();await page.getByRole('button',{name:'下达移动任务',exact:true}).click();await page.getByRole('button',{name:'确认并下达',exact:true}).press('Enter');await expect(page.getByTestId('movement-status')).toContainText('已签发');await page.getByLabel('推进到时刻（秒）').fill('31.5');await page.getByRole('button',{name:'推进到该时刻',exact:true}).click();await expect(page.getByTestId('movement-status')).toContainText('抵达已知');await expect(page.getByTestId('scope-detail')).toContainText('150.00, 150.00');
    await page.getByRole('button',{name:'行动复盘',exact:true}).click();await page.getByLabel('回看时刻（秒）').fill('31.499');await page.getByRole('button',{name:'查看当时情况',exact:true}).press('Enter');await expect(page.getByTestId('scope-detail')).toContainText('50.00, 150.00');await expect(page.getByRole('button',{name:'保存行动',exact:true})).toBeDisabled();await page.getByRole('main').getByRole('button',{name:'返回当前行动',exact:true}).press('Enter');await expect(page.getByTestId('scope-detail')).toContainText('150.00, 150.00');await page.getByRole('button',{name:'态势地图',exact:true}).click();
    const overlay=await map.evaluate(element=>{const a=element.querySelector('[data-anchor="A"]')!.getBoundingClientRect(),r=element.querySelector('[data-marker="R"] img')!.getBoundingClientRect();return {a:{x:a.left+a.width/2,y:a.top+a.height/2},r:{x:r.left+r.width/2,y:r.top+r.height/2},dpr:devicePixelRatio};});expect(Math.hypot(overlay.a.x-overlay.r.x,overlay.a.y-overlay.r.y)).toBeLessThanOrEqual(1);
    await page.getByRole('button',{name:'保存行动',exact:true}).click();await expect(page.getByRole('status')).toContainText('行动已保存');await info.attach('actual-matrix-overlay',{body:JSON.stringify({width,dpr,overlay}),contentType:'application/json'});await page.screenshot({path:info.outputPath('matrix-received-returned.png'),fullPage:true});
  });
});
