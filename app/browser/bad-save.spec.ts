import {test,expect} from '@playwright/test';
test('a real incompatible latest snapshot is refused and kept intact without a partial resume',async({page})=>{
  await page.goto('/');await page.getByLabel('时间方式').selectOption('research');await page.getByLabel('演练任务').selectOption('FB01-ENG-MOVE');await page.getByRole('button',{name:'开始演练',exact:true}).click();await page.getByRole('button',{name:'保存记录',exact:true}).click();await expect(page.getByRole('status')).toContainText('已保存至');
  await page.evaluate(()=>new Promise<void>((resolve,reject)=>{
    const open=indexedDB.open('fogbound-fb01-schema4');open.onerror=()=>reject(open.error);open.onsuccess=()=>{const db=open.result,tx=db.transaction('snapshots','readwrite'),store=tx.objectStore('snapshots'),read=store.getAll();
      read.onsuccess=()=>{const latest=read.result.sort((a,b)=>b.state.revision-a.state.revision)[0];latest.state.contract='0.5';store.put(latest);};tx.oncomplete=()=>{db.close();resolve();};tx.onabort=()=>reject(tx.error);
    };
  }));
  await page.reload();await page.getByRole('button',{name:'接手这场演练',exact:true}).click();await expect(page.getByRole('alert')).toContainText('存档资料无法核对，原记录仍保留');await expect(page.getByRole('button',{name:'开始演练',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'态势地图',exact:true})).toHaveCount(0);
  const contract=await page.evaluate(()=>new Promise<string>((resolve,reject)=>{const open=indexedDB.open('fogbound-fb01-schema4');open.onerror=()=>reject(open.error);open.onsuccess=()=>{const db=open.result,read=db.transaction('snapshots').objectStore('snapshots').getAll();read.onsuccess=()=>{resolve(read.result.sort((a,b)=>b.state.revision-a.state.revision)[0].state.contract);db.close();};};}));expect(contract).toBe('0.5');
  expect(await page.locator('body').innerText()).not.toMatch(/contract|schema|INVALID_SAVE|FB01/);
});
