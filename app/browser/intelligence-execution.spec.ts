import {test,expect} from '@playwright/test';

test('B23 a player issues one field phase through Worker and sees only received record products',async({page})=>{
  await page.goto('/');await page.getByLabel('演练任务').selectOption('B23-INTELLIGENCE-01');await page.getByLabel('时间方式').selectOption('research');await page.getByRole('button',{name:'开始演练',exact:true}).press('Enter');
  const move=page.getByRole('button',{name:'下达R前往A',exact:true});await expect(move).toBeVisible();await move.press('Enter');
  await expect(page.getByTestId('intelligence-field')).toContainText('已签发，等待接令回报');
  const advance=async(time:string)=>{await page.getByLabel('推进到时刻（秒）').fill(time);await expect(page.getByRole('button',{name:'推进到该时刻',exact:true})).toBeEnabled();await page.getByRole('button',{name:'推进到该时刻',exact:true}).press('Enter');await expect(page.getByRole('button',{name:'推进到该时刻',exact:true})).toBeEnabled();};
  await advance('32');await expect(page.getByTestId('intelligence-field')).toContainText('完成回报已收到');
  await page.getByRole('button',{name:'下达A处记录',exact:true}).press('Enter');await expect(page.getByTestId('intelligence-artifacts')).toContainText('等待成果回报');
  await advance('78');await expect(page.locator('.clock strong')).toHaveText('01:18');await expect(page.getByTestId('intelligence-artifacts')).toContainText('等待成果回报');await expect(page.getByTestId('intelligence-artifacts')).not.toContainText('回报称现场已生成');
  await advance('79');await expect(page.getByTestId('intelligence-artifacts')).toContainText('A · 回报称现场已生成');await expect(page.getByTestId('intelligence-artifacts')).toContainText('尚未交接或终局核验');
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('B23 real Worker repair UI distinguishes preparation approval, local completion and received repair confirmation',async({page})=>{
  await page.goto('/');await page.getByLabel('演练任务').selectOption('B23-INTELLIGENCE-01');await page.getByLabel('时间方式').selectOption('research');await page.getByRole('button',{name:'开始演练',exact:true}).press('Enter');
  await page.getByRole('button',{name:'保存准备草案',exact:true}).press('Enter');await expect(page.getByTestId('intelligence-plan')).toContainText('草案第1版');await page.getByRole('button',{name:'提交准备申请',exact:true}).press('Enter');await expect(page.getByTestId('intelligence-plan')).toContainText('准备审查中');
  const advance=async(time:string,clock:string)=>{await page.getByLabel('推进到时刻（秒）').fill(time);await page.getByRole('button',{name:'推进到该时刻',exact:true}).press('Enter');await expect(page.locator('.clock strong')).toHaveText(clock);};
  await advance('146','02:26');const repair=page.getByRole('button',{name:'下达W维修B',exact:true});await expect(repair).toBeEnabled();await repair.press('Enter');await expect(page.getByTestId('intelligence-field')).toContainText('W维修B · 已签发');
  await advance('212','03:32');await expect(page.getByRole('region',{name:'总部已知的任务前提'})).toContainText('B需维修');await expect(page.getByRole('region',{name:'总部最后确认的编组'})).toContainText('维修包 2');
  await advance('213','03:33');await expect(page.getByRole('region',{name:'总部已知的任务前提'})).toContainText('B维修完成回报已收到');await expect(page.getByRole('region',{name:'总部最后确认的编组'})).toContainText('维修包 0');
  await expect(page.getByRole('alert')).toHaveCount(0);
});
