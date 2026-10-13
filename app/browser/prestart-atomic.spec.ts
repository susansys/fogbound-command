import {test,expect} from '@playwright/test';

test('CR18 actual Worker IndexedDB acceptance abort preserves the original safe view and resumes the same registered replacement once',async({page},testInfo)=>{
  await page.addInitScript(()=>{
    const Native=window.Worker;
    window.Worker=new Proxy(Native,{construct(Target,args){
      const script=`let injected=false;const native=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(value,...rest){const request=native.call(this,value,...rest);if(this.name==='runs'&&value.sim_time===3000&&!injected){injected=true;request.addEventListener('success',()=>this.transaction.abort(),{once:true});}return request;};await import(${JSON.stringify(String(args[0]))});`;
      const url=URL.createObjectURL(new Blob([script],{type:'text/javascript'}));
      return Reflect.construct(Target,[url,{type:'module'}]);
    }});
  });
  await page.goto('/');await page.getByLabel('演练任务').selectOption('ENG-PRESTART-REPLACE');await page.getByLabel('时间方式').selectOption('research');await page.getByRole('button',{name:'开始演练',exact:true}).click();
  await page.getByRole('button',{name:'任务调度',exact:true}).click();await page.getByRole('button',{name:'查看通行预案',exact:true}).click();
  await page.getByRole('button',{name:'下达通行命令',exact:true}).click();await page.getByRole('button',{name:'确认下达',exact:true}).click();await expect(page.getByTestId('frozen-command').locator('article')).toHaveCount(1);
  await page.getByLabel('推进至秒').fill('2');await page.getByRole('button',{name:'推进时间',exact:true}).click();await expect(page.locator('.clock strong')).toHaveText('00:02');
  await page.getByRole('button',{name:'请求改到T',exact:true}).click();await page.getByRole('button',{name:'下达替代请求',exact:true}).click();await page.getByRole('button',{name:'确认下达',exact:true}).click();await expect(page.getByTestId('frozen-command').locator('article')).toHaveCount(2);
  const orders=await page.getByTestId('frozen-command').innerText();
  await page.getByLabel('推进至秒').fill('3');await page.getByRole('button',{name:'推进时间',exact:true}).click();await expect(page.getByRole('alert')).toContainText('尚未确认保存');
  await expect(page.locator('.clock strong')).toHaveText('00:02');expect(await page.getByTestId('frozen-command').innerText()).toBe(orders);await expect(page.locator('.task-aside')).not.toContainText('替代已确认');
  await page.screenshot({path:testInfo.outputPath('aborted-safe-view.png'),fullPage:true});
  // A reload removes the one-shot fault injector. The persisted replacement identity is retained;
  // core CR18 separately checks byte-identical failed operation retry before a restore revision.
  const context=page.context();await page.close();const restored=await context.newPage();
  await restored.goto('/');await restored.getByRole('button',{name:'接手这场演练',exact:true}).click();
  await expect(restored.locator('.clock strong')).toHaveText('00:02');await expect(restored.locator('.clock')).toContainText('已暂停');
  await restored.getByRole('button',{name:'任务调度',exact:true}).click();expect(await restored.getByTestId('frozen-command').innerText()).toBe(orders);
  await restored.getByLabel('推进至秒').fill('4');await restored.getByRole('button',{name:'推进时间',exact:true}).click();await expect(restored.locator('.clock strong')).toHaveText('00:04');await expect(restored.locator('.task-aside')).toContainText('替代已确认');
  await restored.getByLabel('推进至秒').fill('120');await restored.getByRole('button',{name:'推进时间',exact:true}).click();await expect(restored.locator('.clock strong')).toHaveText('00:40.800');await expect(restored.locator('.clock')).toContainText('任务完成');
  await restored.getByRole('button',{name:'指挥记录',exact:true}).click();await expect(restored.locator('.content-view p').filter({hasText:'对目标 T 的替代确认及重新准备回报已收到'})).toHaveCount(1);
  await restored.screenshot({path:testInfo.outputPath('restored-single-completion.png'),fullPage:true});
});
