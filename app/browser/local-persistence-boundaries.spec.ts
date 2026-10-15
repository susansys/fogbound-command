import {test,expect} from '@playwright/test';

test('PC05/06 an empty entry identifies this browser profile and exact origin without claiming other records were deleted',async({page})=>{
  await page.goto('/');
  await expect(page.getByText('此入口暂无演练记录。',{exact:true})).toBeVisible();
  await expect(page.getByText(/当前浏览器的用户配置/)).toContainText(new URL(page.url()).origin);
  await expect(page.getByText(/不代表原记录已删除/)).toBeVisible();
  await expect(page.getByRole('button',{name:'接手这场演练',exact:true})).toHaveCount(0);
});

test('PC07 an unconfirmed list stays unknown rather than claiming no records',async({page})=>{
  await page.addInitScript(()=>{
    const Native=Worker;
    window.Worker=new Proxy(Native,{construct(Target,args){
      const worker=Reflect.construct(Target,args) as Worker;
      const post=worker.postMessage.bind(worker);
      worker.postMessage=(message:unknown,...rest:[])=>{
        // Real outbound transport failure only; no forged response or State.
        if((message as {kind?:string}).kind!=='list')post(message,...rest);
      };
      return worker;
    }});
  });
  await page.goto('/');
  await expect(page.getByRole('status')).toHaveText('正在读取此入口的演练记录。');
  await expect(page.getByRole('status')).toContainText('列表尚未确认',{timeout:15000});
  await expect(page.getByRole('alert')).toContainText('暂未收到确认');
  await expect(page.getByText('此入口暂无演练记录。',{exact:true})).toHaveCount(0);
});
