import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';

test('UXF E01 E07 current action is reachable before unrelated history at representative viewports',async({page},info)=>{
 const observed=[];
 for(const viewport of [{width:1366,height:768},{width:1920,height:1080}]){
  await page.setViewportSize(viewport);await page.goto('/');
  await page.getByLabel('演练任务').selectOption('B24-OUTCOME-01');
  await expect(page.getByLabel('时间方式')).toHaveValue('command');
  await page.getByRole('button',{name:'开始演练',exact:true}).click();
  await expect(page.getByRole('heading',{name:'返回与交付任务',exact:true})).toBeVisible();
  const action=page.getByRole('region',{name:'当前行动',exact:true});
  await expect(action).toBeVisible();
  const save=action.getByRole('button',{name:'保存准备草案',exact:true});
  const box=await save.boundingBox();expect(box).not.toBeNull();
  expect(box!.y).toBeGreaterThanOrEqual(0);expect(box!.y+box!.height).toBeLessThanOrEqual(viewport.height);
  await expect(action.getByLabel('准备目的',{exact:true})).toBeVisible();
  await expect(action).toContainText('草案尚未保存');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await save.focus();await expect(save).toBeFocused();await page.keyboard.press('Shift+Tab');
  await expect(action.getByLabel('准备目的',{exact:true})).toBeFocused();
  observed.push({viewport,save_box:box,scope:'public default-command UI; no task completion or human usability claim'});
 }
 await fs.writeFile(info.outputPath('uxf-current-action-viewports.json'),JSON.stringify(observed,null,2),{flag:'wx'});
});

test('UXF E02 E07 explicit source return retains unsaved input and the initiating keyboard context while command time advances',async({page},info)=>{
 await page.setViewportSize({width:1366,height:768});await page.goto('/');
 await page.getByLabel('演练任务').selectOption('B24-OUTCOME-01');
 await page.getByRole('button',{name:'开始演练',exact:true}).click();
 const action=page.getByRole('region',{name:'当前行动',exact:true}),purpose=page.getByLabel('准备目的',{exact:true});
 await page.getByLabel('推进速度',{exact:true}).selectOption('4');
 await purpose.fill('UXF保留未提交的准备目的');
 const firstClock=await page.locator('.clock strong').innerText();
 await expect(page.locator('.clock strong')).not.toHaveText(firstClock);
 const source=action.getByRole('button',{name:'查看当前已收资料',exact:true});
 await expect(source).toBeEnabled({timeout:10000});await source.focus();await page.keyboard.press('Enter');
 await expect(page.getByRole('region',{name:'已收原文详情',exact:true})).toBeVisible();
 const back=page.getByRole('button',{name:'返回当前行动',exact:true});await back.focus();await page.keyboard.press('Enter');
 await expect(purpose).toHaveValue('UXF保留未提交的准备目的');
 await expect(source).toBeFocused();await expect(page.getByTestId('intelligence-plan')).toContainText('草案尚未保存');
 await expect(page.getByTestId('intelligence-field')).toContainText('每次只下达一个阶段');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 await fs.writeFile(info.outputPath('uxf-source-return.json'),JSON.stringify({firstClock,returnedClock:await page.locator('.clock strong').innerText(),dirty:await purpose.inputValue(),focusedReturn:true,scope:'legal source UI only; no submission or human experience claim'},null,2),{flag:'wx'});
});
