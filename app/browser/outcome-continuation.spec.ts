import {test,expect} from '@playwright/test';

test('B24 E07/E12 a lost return acknowledgement leaves an accessible query and the original one-time decision',async({page})=>{
  test.setTimeout(45000);page.setDefaultTimeout(10000);
  await page.addInitScript(()=>{
    const Native=Worker,requests:Record<string,any>[]=[];Reflect.set(window,'__b24ReturnRequests',requests);
    window.Worker=new Proxy(Native,{construct(Target,args){
      const worker=Reflect.construct(Target,args),post=worker.postMessage.bind(worker);
      worker.postMessage=(message:Record<string,any>)=>{requests.push(structuredClone(message));post(message);};
      worker.addEventListener('message',(event:MessageEvent)=>{
        const request=requests.find(r=>r.request_id===event.data.request_id);
        if(request?.kind==='operate_outcome'&&request.envelope.intent.kind==='return_and_deliver'&&event.data.ok&&!Reflect.get(window,'__b24DroppedReturn')){Reflect.set(window,'__b24DroppedReturn',{request,response:structuredClone(event.data)});event.stopImmediatePropagation();return;}
        if(event.data.ok&&event.data.view)Reflect.set(window,'__b24CurrentView',structuredClone(event.data.view));
      });return worker;
    }});
  });
  await page.goto('/');await page.getByLabel('演练任务').selectOption('B24-OUTCOME-01');await page.getByLabel('时间方式').selectOption('research');await page.getByRole('button',{name:'开始演练',exact:true}).press('Enter');
  await page.getByRole('button',{name:'安排W返回交付',exact:true}).press('Enter');await expect(page.getByRole('dialog',{name:'确认返回交付'}).getByRole('button',{name:'确认返回交付',exact:true})).toBeFocused();
  await page.keyboard.press('Tab');await expect(page.getByLabel('返回理由（可选）',{exact:true})).toBeFocused();await page.keyboard.type('先接收这一组，不等待另一组。');await page.keyboard.press('Shift+Tab');await expect(page.getByRole('dialog',{name:'确认返回交付'}).getByRole('button',{name:'确认返回交付',exact:true})).toBeFocused();await page.keyboard.press('Enter');
  await expect(page.getByText('这次返回安排的提交结果尚未确认，原编号已保留。',{exact:true})).toBeVisible({timeout:15000});
  await expect(page.getByRole('dialog',{name:'确认返回交付'})).toHaveCount(0);
  await page.getByRole('button',{name:'核对返回提交',exact:true}).press('Enter');await expect(page.getByTestId('outcome-return-W')).toContainText('已签发');await expect(page.getByRole('alert')).toHaveCount(0);
  const trace=await page.evaluate(()=>({requests:Reflect.get(window,'__b24ReturnRequests'),dropped:Reflect.get(window,'__b24DroppedReturn'),view:Reflect.get(window,'__b24CurrentView')}));
  const returns=trace.requests.filter((r:Record<string,any>)=>r.kind==='operate_outcome'&&r.envelope.intent.kind==='return_and_deliver');expect(returns).toHaveLength(1);
  expect(trace.view).toMatchObject({decision_records:[{operation_id:trace.dropped.request.envelope.operation_id,reason:{kind:'recorded',text:'先接收这一组，不等待另一组。'}}],return_plans:[{actor:'W',status:'issued'}],handover:{received_personnel:0}});
});
