import {test,expect,type Page} from '@playwright/test';

async function begin(page:Page){
  await page.goto('/');await page.getByLabel('演练任务').selectOption('B22-MISSION-01');await page.getByLabel('时间方式').selectOption('research');await page.getByRole('button',{name:'开始演练',exact:true}).press('Enter');
  await page.getByLabel('任务目的',{exact:true}).fill('核对两处联络点');await page.getByLabel('期望结果',{exact:true}).fill('总部收到两阶段合法抵达凭证');
  await page.getByRole('button',{name:'预览任务',exact:true}).press('Enter');await expect(page.getByTestId('mission-preview')).toBeVisible();await page.getByRole('button',{name:'保存草案',exact:true}).press('Enter');await expect(page.getByTestId('mission-save-state')).toContainText('已保存版本 1');
}
async function issue(page:Page,id:string){await page.getByRole('button',{name:'核对当前阶段',exact:true}).press('Enter');await expect(page.getByRole('button',{name:'确认下达 '+id,exact:true})).toBeEnabled();await page.getByRole('button',{name:'确认下达 '+id,exact:true}).press('Enter');await expect(page.getByTestId('issued-plan-line')).toHaveCount(id==='P1'?1:2);}
async function advance(page:Page,seconds:string){await page.getByLabel('推进到时刻（秒）').fill(seconds);await page.getByRole('button',{name:'推进到该时刻',exact:true}).press('Enter');await expect(page.getByRole('button',{name:'推进到该时刻',exact:true})).toBeEnabled();}

for(const [width,height] of [[1366,768],[1920,1080]])test(`B22 lawful received reports distinguish acceptance and goal confirmation at ${width}`,async({page})=>{
  await page.setViewportSize({width,height});await begin(page);await issue(page,'P1');
  await advance(page,'2');await expect(page.getByTestId('mission-orders')).toContainText('接令已知');await expect(page.getByTestId('mission-orders')).toContainText('等待完成回报，结果尚未确认');
  await advance(page,'30.5');await expect(page.getByTestId('mission-orders')).toContainText('等待完成回报，结果尚未确认');await expect(page.getByTestId('mission-phase-results')).not.toContainText('P1 · 版本 1 · 合法抵达已确认');
  await advance(page,'31.5');await expect(page.getByTestId('mission-phase-results')).toContainText('P1 · 版本 1 · 合法抵达已确认');
  await page.getByRole('button',{name:'情报报告',exact:true}).press('Enter');await expect(page.getByTestId('mission-reports')).toContainText('抵达回报');await expect(page.getByTestId('mission-reports')).toContainText('源事件时间：未知');await expect(page.getByTestId('mission-reports')).toContainText('观察时刻');await expect(page.getByTestId('mission-reports')).toContainText('发送时刻');await expect(page.getByTestId('mission-reports')).toContainText('总部收到');
  await expect(page.getByTestId('mission-report')).toHaveCount(2);
  await page.getByRole('button',{name:'任务规划',exact:true}).press('Enter');await advance(page,'32');await issue(page,'P2');
  await advance(page,'62.5');await expect(page.getByTestId('mission-orders')).toContainText('等待完成回报，结果尚未确认');await expect(page.getByTestId('mission-readiness')).not.toContainText('移动目标已确认');
  await advance(page,'63.5');await expect(page.getByTestId('mission-readiness')).toContainText('移动目标已确认');await expect(page.getByTestId('mission-phase-results')).toContainText('P2 · 版本 1 · 合法抵达已确认');await expect(page.getByTestId('mission-resources')).toContainText('移动能量 18 · 联络能量 12 · 总部能量 14');
  await page.getByRole('button',{name:'情报报告',exact:true}).press('Enter');await expect(page.getByTestId('mission-report')).toHaveCount(4);await expect(page.getByTestId('mission-reports')).toContainText('来源 R → 总部');
});
