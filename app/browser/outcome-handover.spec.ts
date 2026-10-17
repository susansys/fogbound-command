import {test,expect} from '@playwright/test';
test.use({viewport:{width:1366,height:768}});
test('B24 E12 one keyboard confirmation schedules W return/reception/verification and reload preserves the owned run',async({page})=>{
 test.setTimeout(45000);page.setDefaultTimeout(10000);
 await page.goto('/');await page.getByLabel('演练任务').selectOption('B24-OUTCOME-01');await page.getByLabel('时间方式').selectOption('research');await page.getByRole('button',{name:'开始演练',exact:true}).press('Enter');
 await expect(page.getByRole('heading',{name:'返回与交付任务',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'安排R返回交付',exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'安排W返回交付',exact:true}).press('Enter');const dialog=page.getByRole('dialog',{name:'确认返回交付'});await expect(dialog).toContainText('W');await expect(dialog).toContainText('返回总部');await dialog.getByRole('button',{name:'确认返回交付',exact:true}).press('Enter');
 await expect(page.getByTestId('outcome-return-W')).toContainText('已签发');
 await page.getByLabel('推进到时刻（秒）').fill('86');await page.getByRole('button',{name:'推进到该时刻',exact:true}).press('Enter');await expect(page.getByTestId('outcome-reception')).toContainText('已确认接收 3 人');await expect(page.getByText('W组交接回报已收到，等待核验回报',{exact:true})).toBeVisible();
 await page.getByLabel('推进到时刻（秒）').fill('107');await page.getByRole('button',{name:'推进到该时刻',exact:true}).press('Enter');await expect(page.getByTestId('outcome-verification')).toContainText('已核验 3 人');await expect(page.getByRole('alert')).toHaveCount(0);
 await page.getByRole('button',{name:'保存行动',exact:true}).press('Enter');await page.reload();await page.getByRole('button',{name:'接手这场演练',exact:true}).press('Enter');await expect(page.getByRole('heading',{name:'返回与交付任务',exact:true})).toBeVisible();await expect(page.getByTestId('outcome-reception')).toContainText('已确认接收 3 人');await expect(page.getByTestId('outcome-verification')).toContainText('已核验 3 人');
});
