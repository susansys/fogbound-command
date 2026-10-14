import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import {observeGame,trace,start,enableSynthetic} from './map-a-helpers';

test('MA12 five cache-disabled context cold starts and sixty seconds of real map input record actual readiness/frame/heap costs',async({browser},info)=>{
  test.setTimeout(180000);
  const cold=[];
  for(let index=0;index<5;index++){
    const context=await browser.newContext({viewport:{width:1366,height:768}}),page=await context.newPage();
    try{
      const cdp=await context.newCDPSession(page);await cdp.send('Network.enable');await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});
      const requested:string[]=[];page.on('request',request=>requested.push(request.url()));await start(page);
      await page.getByRole('button',{name:'地图图层',exact:true}).click();const before=await page.evaluate(()=>performance.now());
      await page.getByRole('checkbox',{name:'合成验证底图',exact:true}).check();await expect(page.locator('.map')).toHaveAttribute('data-renderer','synthetic-ready');await expect(page.locator('.unit-marker')).toBeVisible();await expect(page.getByRole('button',{name:'全图',exact:true})).toBeEnabled();
      await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
      const milliseconds=await page.evaluate(()=>performance.now())-before;
      const graphics=await page.locator('.geographic-surface canvas').evaluate(element=>{const gl=(element as HTMLCanvasElement).getContext('webgl2')!,debug=gl.getExtension('WEBGL_debug_renderer_info');return {vendor:debug?gl.getParameter(debug.UNMASKED_VENDOR_WEBGL):gl.getParameter(gl.VENDOR),renderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),dpr:devicePixelRatio};});
      expect(requested.some(url=>/grid-.*\.png/.test(url))).toBe(true);expect(requested.some(url=>/colour-.*\.png/.test(url))).toBe(true);
      cold.push({index,milliseconds,graphics,requested});
    }finally{await context.close();}
  }
  const samples=[];
  for(const synthetic of [false,true]){
    const context=await browser.newContext({viewport:{width:1366,height:768}}),page=await context.newPage();
    try{
      await observeGame(page);await start(page);if(synthetic)await enableSynthetic(page);
      const cdp=await context.newCDPSession(page);await cdp.send('Performance.enable');const before=await cdp.send('Performance.getMetrics'),gameBefore=await trace(page);
      const frames=page.evaluate(()=>new Promise<{elapsed:number;intervals:number[]}>(resolve=>{const start=performance.now(),intervals:number[]=[];let previous=start;function frame(now:number){intervals.push(now-previous);previous=now;if(now-start>=60000)resolve({elapsed:now-start,intervals});else requestAnimationFrame(frame);}requestAnimationFrame(frame);}));
      const deadline=Date.now()+60000,map=page.locator('.map'),box=(await map.boundingBox())!;let inputs=0;
      while(Date.now()<deadline){
        await map.focus();await page.keyboard.press(inputs%2?'ArrowLeft':'ArrowRight');await page.keyboard.press(inputs%2?'-':'+');
        await page.mouse.move(box.x+box.width*.7,box.y+box.height*.7);await page.mouse.down();await page.mouse.move(box.x+box.width*.7+(inputs%2?-20:20),box.y+box.height*.7,{steps:3});await page.mouse.up();
        await page.mouse.wheel(0,inputs%2?80:-80);await page.getByRole('button',{name:'全图',exact:true}).click();inputs++;
        await page.waitForTimeout(100);
      }
      const frame=await frames,after=await cdp.send('Performance.getMetrics'),gameAfter=await trace(page);expect(frame.elapsed).toBeGreaterThanOrEqual(60000);expect(inputs).toBeGreaterThan(0);expect(gameAfter.requests.slice(gameBefore.requests.length)).toEqual([]);expect(gameAfter.views.at(-1)).toEqual(gameBefore.views.at(-1));
      const sorted=frame.intervals.slice().sort((a,b)=>a-b),metrics=(values:typeof before)=>Object.fromEntries(values.metrics.filter(metric=>['JSHeapUsedSize','JSHeapTotalSize','Nodes','Documents','JSEventListeners'].includes(metric.name)).map(metric=>[metric.name,metric.value]));
      samples.push({synthetic,inputs,elapsed:frame.elapsed,frames:frame.intervals.length,p50:sorted[Math.floor(sorted.length*.5)],p95:sorted[Math.floor(sorted.length*.95)],max:sorted.at(-1),over50ms:frame.intervals.filter(value=>value>50).length,metricsBefore:metrics(before),metricsAfter:metrics(after)});
    }finally{await context.close();}
  }
  const record={at:new Date().toISOString(),browser:browser.version(),platform:os.platform(),os:os.release(),cpu:os.cpus()[0]?.model,logicalCPUs:os.cpus().length,totalRAM:os.totalmem(),viewport:[1366,768],coldScope:'fresh browser contexts with HTTP cache disabled; browser process already launched',cold,slowest:Math.max(...cold.map(item=>item.milliseconds)),targetMilliseconds:3000,samples,memoryScope:'CDP JavaScript heap/DOM counts only; not GPU/process memory or forced-GC leak proof'};
  await fs.writeFile(info.outputPath('map-a-measure.json'),JSON.stringify(record,null,2));
});
