import {test,expect} from '@playwright/test';
test.use({viewport:{width:1366,height:768}});
test('B24 E12 one keyboard confirmation schedules W return/reception/verification and reload preserves the owned run',async({page})=>{
 test.setTimeout(45000);page.setDefaultTimeout(10000);
 await page.goto('/');await page.getByLabel('演练任务').selectOption('B24-OUTCOME-01');await page.getByLabel('时间方式').selectOption('research');await page.getByRole('button',{name:'开始演练',exact:true}).press('Enter');
 await expect(page.getByRole('heading',{name:'返回与交付任务',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'安排R返回交付',exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'安排W返回交付',exact:true}).press('Enter');const dialog=page.getByRole('dialog',{name:'确认返回交付'});await expect(dialog).toContainText('W');await expect(dialog).toContainText('返回总部');await dialog.getByRole('button',{name:'确认返回交付',exact:true}).press('Enter');
 await expect(page.getByTestId('outcome-return-W')).toContainText('已签发');
 await page.getByLabel('推进到时刻（秒）').fill('86');await page.getByRole('button',{name:'推进到该时刻',exact:true}).press('Enter');await expect(page.getByTestId('outcome-reception')).toContainText('已确认接收 3 人');await expect(page.getByText('W组交接回报已收到，等待核验回报',{exact:true})).toBeVisible();
 await page.getByLabel('推进到时刻（秒）').fill('87');await page.getByRole('button',{name:'推进到该时刻',exact:true}).press('Enter');await expect(page.getByText('W组核验岗位已接令，等待完成回报',{exact:true})).toBeVisible();
 await page.getByLabel('推进到时刻（秒）').fill('107');await page.getByRole('button',{name:'推进到该时刻',exact:true}).press('Enter');await expect(page.getByTestId('outcome-verification')).toContainText('已核验 3 人');await expect(page.getByRole('alert')).toHaveCount(0);
 await page.getByRole('button',{name:'保存行动',exact:true}).press('Enter');await page.reload();await page.getByRole('button',{name:'接手这场演练',exact:true}).press('Enter');await expect(page.getByRole('heading',{name:'返回与交付任务',exact:true})).toBeVisible();await expect(page.getByTestId('outcome-reception')).toContainText('已确认接收 3 人');await expect(page.getByTestId('outcome-verification')).toContainText('已核验 3 人');
});

for(const sample of [{requests:1,status:'W组核验排队：处理席位占用，等待核验'},{requests:10,status:'W组核验暂缓：处理能源不足，等待核验条件'}])test('B24 E12 received verification feedback and saved recovery with '+sample.requests+' earlier source requests',async({page})=>{
 test.setTimeout(60000);page.setDefaultTimeout(10000);
 await page.goto('/');await page.getByLabel('演练任务').selectOption('B24-OUTCOME-01');await page.getByLabel('时间方式').selectOption('research');await page.getByRole('button',{name:'开始演练',exact:true}).press('Enter');
 const clocks:Record<string,string>={'1':'00:01','86':'01:26','87':'01:27','88':'01:28','107':'01:47','127':'02:07','901':'15:01'};
 const advance=async(seconds:string)=>{await page.getByLabel('推进到时刻（秒）').fill(seconds);const button=page.getByRole('button',{name:'推进到该时刻',exact:true});await expect(button).toBeEnabled();await button.press('Enter');await expect(page.locator('.clock strong')).toHaveText(clocks[seconds]);};
 await advance('1');const returnButton=page.getByRole('button',{name:'安排W返回交付',exact:true});await expect(returnButton).toBeEnabled();await returnButton.press('Enter');await page.getByRole('dialog').getByRole('button',{name:'确认返回交付',exact:true}).press('Enter');await expect(page.getByTestId('outcome-return-W')).toContainText('已签发');await advance('86');
 const source=page.getByTestId('intelligence-source-R3');for(let i=0;i<sample.requests;i++){await source.getByRole('button',{name:'请求核实这份原文',exact:true}).press('Enter');await expect(page.getByTestId('intelligence-processing')).toContainText('已预留 '+(2*(i+1)));}
 await advance('87');await expect(page.getByText(sample.status,{exact:true})).toHaveCount(0);await advance('88');await expect(page.getByText(sample.status,{exact:true})).toBeVisible();await expect(page.getByTestId('outcome-verification')).toContainText('已核验 0 人');
 await page.getByRole('button',{name:'保存行动',exact:true}).press('Enter');await page.reload();await page.getByRole('button',{name:'接手这场演练',exact:true}).press('Enter');await expect(page.getByText(sample.status,{exact:true})).toBeVisible();
 if(sample.requests===1){await advance('107');await expect(page.getByText('W组核验岗位已接令，等待完成回报',{exact:true})).toBeVisible();await advance('127');await expect(page.getByTestId('outcome-verification')).toContainText('已核验 3 人');}
 else{await advance('901');await expect(page.getByText('W组已收到核验时限回报',{exact:true})).toBeVisible();await expect(page.getByTestId('outcome-verification')).toContainText('已核验 0 人');}
 await expect(page.getByRole('alert')).toHaveCount(0);
});

test('B24 a handover at deadline reports verification cutoff only after the manifest actually arrives',async({page})=>{
 await page.goto('/');await page.getByLabel('演练任务').selectOption('B24-OUTCOME-01');await page.getByLabel('时间方式').selectOption('research');await page.getByRole('button',{name:'开始演练',exact:true}).press('Enter');
 const advance=async(seconds:string,clock:string)=>{await page.getByLabel('推进到时刻（秒）').fill(seconds);const button=page.getByRole('button',{name:'推进到该时刻',exact:true});await expect(button).toBeEnabled();await button.press('Enter');await expect(page.locator('.clock strong')).toHaveText(clock);};
 await advance('815','13:35');const returning=page.getByRole('button',{name:'安排W返回交付',exact:true});await expect(returning).toBeEnabled();await returning.press('Enter');await page.getByRole('dialog').getByRole('button',{name:'确认返回交付',exact:true}).press('Enter');await expect(page.getByTestId('outcome-return-W')).toContainText('已签发');
 await advance('900','15:00');await advance('901','15:01');await expect(page.getByTestId('outcome-reception')).toContainText('已确认接收 3 人');await expect(page.getByText('W组已收到核验时限回报',{exact:true})).toHaveCount(0);
 await advance('902','15:02');await expect(page.getByText('W组已收到核验时限回报',{exact:true})).toBeVisible();await expect(page.getByTestId('outcome-verification')).toContainText('已核验 0 人');await expect(page.getByRole('alert')).toHaveCount(0);
});

test('B24 saved list opens the latest auto-committed clock record without a later manual save',async({page})=>{
 await page.goto('/');await page.getByLabel('演练任务').selectOption('B24-OUTCOME-01');await page.getByLabel('时间方式').selectOption('research');await page.getByRole('button',{name:'开始演练',exact:true}).press('Enter');
 await page.getByRole('button',{name:'安排W返回交付',exact:true}).press('Enter');await page.getByRole('dialog').getByRole('button',{name:'确认返回交付',exact:true}).press('Enter');await expect(page.getByTestId('outcome-return-W')).toContainText('已签发');
 await page.getByLabel('推进到时刻（秒）').fill('30');const advance=page.getByRole('button',{name:'推进到该时刻',exact:true});await expect(advance).toBeEnabled();await advance.press('Enter');await expect(page.locator('.clock strong')).toHaveText('00:30');
 await page.reload();await page.getByLabel('演练任务').selectOption('B24-OUTCOME-01');await page.getByRole('button',{name:'查看记录',exact:true}).press('Enter');
 await expect(page.getByRole('heading',{name:'返回与交付任务',exact:true})).toBeVisible();await expect(page.locator('.clock strong')).toHaveText('00:30');await expect(page.getByRole('button',{name:'安排W返回交付',exact:true})).toBeDisabled();await expect(page.getByRole('button',{name:'保存行动',exact:true})).toBeDisabled();await expect(page.getByRole('alert')).toHaveCount(0);
});
