import {test,expect} from '@playwright/test';

test('B33 map foundation uses verified regional terrain without changing action geometry',async({page},info)=>{
 await page.goto('/');await page.getByLabel('演练任务').selectOption('INTEGRATED-FIELD-PACK-3');await page.getByLabel('时间方式').selectOption('research');await page.getByRole('button',{name:'开始演练',exact:true}).click();
 const map=page.getByRole('region',{name:'综合现场地图',exact:true});await expect(map).toHaveAttribute('data-regional-state','ready');await expect(map.locator('canvas').first()).toBeVisible();
 await expect(map).toContainText('局部行动米');await expect(map.getByLabel('虚构区域背景')).toBeChecked();await expect(map.getByLabel('地形显示')).toBeChecked();await expect(map.getByLabel('地点标签')).toBeChecked();
 await map.getByRole('button',{name:'区域全景',exact:true}).click();await expect(map).toContainText('10 × 10 图上公里');await map.getByRole('button',{name:'返回活动范围',exact:true}).click();
 await map.getByLabel('虚构区域背景').uncheck();await expect(map.getByRole('button',{name:'H',exact:true})).toBeVisible();await expect(map.getByRole('button',{name:'A',exact:true})).toBeVisible();await expect(map.getByRole('button',{name:'B',exact:true})).toBeVisible();
 await map.getByLabel('虚构区域背景').check();await map.getByRole('button',{name:'阴影地形',exact:true}).click();await expect(map).toHaveAttribute('data-terrain-mode','shade');
  await map.getByRole('button',{name:'图层设置',exact:true}).click();await map.getByLabel('合成网格显示').check();await expect(map).toHaveAttribute('data-regional-state','ready');await expect(map.locator('.geographic-surface canvas')).toBeVisible();await map.getByLabel('合成网格显示').uncheck();await expect(map).toHaveAttribute('data-regional-state','ready');await map.getByRole('button',{name:'图层设置',exact:true}).click();
 await map.getByRole('button',{name:'地图资料与图例',exact:true}).click();await expect(map).toContainText('人为模拟参照');await expect(map).toContainText('不参与速度、能耗、通行或雾判定');
 await page.screenshot({path:info.outputPath('b33-regional-foundation.png'),fullPage:true});
});
