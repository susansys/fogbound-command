import {test,expect} from '@playwright/test';
test('command reading keeps the real worker clock running; manual and lost-focus pause need explicit continue',async({page,context})=>{
  const cdp=await context.newCDPSession(page);
  await cdp.send('Emulation.setFocusEmulationEnabled',{enabled:false});
  await page.addInitScript(()=>{
    const records:string[]=[];(window as unknown as {focusRecords:string[]}).focusRecords=records;
    window.addEventListener('blur',()=>records.push('blur'));
    document.addEventListener('visibilitychange',()=>records.push(`visibility:${document.visibilityState}`));
  });
  await page.goto('/');
  await page.getByRole('button',{name:'开始演练',exact:true}).click();
  await page.getByRole('button',{name:'查看原件',exact:true}).click();
  await expect.poll(()=>page.locator('.clock strong').innerText()).not.toBe('00:00');
  const readingTime=await page.locator('.clock strong').innerText();
  await expect.poll(()=>page.locator('.clock strong').innerText()).not.toBe(readingTime);
  await page.getByRole('button',{name:'暂停',exact:true}).click();
  await expect(page.locator('.clock')).toContainText('已暂停');
  const pausedTime=await page.locator('.clock strong').innerText();
  const start=Date.now();await expect.poll(()=>Date.now()-start).toBeGreaterThan(1000);
  expect(await page.locator('.clock strong').innerText()).toBe(pausedTime);
  await page.getByRole('button',{name:'继续',exact:true}).click();
  await expect.poll(()=>page.locator('.clock strong').innerText()).not.toBe(pausedTime);
  const other=await context.newPage();await other.goto('/');await other.bringToFront();
  await expect.poll(()=>page.evaluate(()=>document.hidden||!document.hasFocus())).toBe(true);
  await expect(page.locator('.clock')).toContainText('已暂停');
  const hiddenTime=await page.locator('.clock strong').innerText();
  await page.bringToFront();
  const returned=Date.now();await expect.poll(()=>Date.now()-returned).toBeGreaterThan(1000);
  expect(await page.locator('.clock strong').innerText()).toBe(hiddenTime);
  await page.getByRole('button',{name:'继续',exact:true}).click();
  await expect.poll(()=>page.locator('.clock strong').innerText()).not.toBe(hiddenTime);
});
test('public 1x/2x/4x rates follow elapsed wall time rather than UI frames',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'开始演练',exact:true}).click();
  function ms(text:string){const [m,s]=text.split(':');return Math.round((Number(m)*60+Number(s))*1000);}
  for(const rate of [1,2,4]){
    await page.getByRole('button',{name:'暂停',exact:true}).click();
    await expect(page.locator('.clock')).toContainText('已暂停');
    await page.getByLabel('时间速率').selectOption(String(rate));
    await expect(page.getByRole('button',{name:'继续',exact:true})).toBeEnabled();
    const before=ms(await page.locator('.clock strong').innerText());
    await page.getByRole('button',{name:'继续',exact:true}).click();
    const wallStart=Date.now();
    await expect.poll(async()=>ms(await page.locator('.clock strong').innerText())-before).toBeGreaterThanOrEqual(rate*2000);
    const wall=Date.now()-wallStart,sim=ms(await page.locator('.clock strong').innerText())-before;
    expect(sim).toBeGreaterThan(rate*(wall-600));expect(sim).toBeLessThan(rate*(wall+600));
    test.info().annotations.push({type:'clock-measurement',description:JSON.stringify({rate,wall_ms:wall,sim_ms:sim,tolerance_wall_ms:600})});
  }
});
