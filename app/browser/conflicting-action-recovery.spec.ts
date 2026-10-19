import {test,expect,chromium} from '@playwright/test';
// @ts-expect-error Native verifier is separately syntax-checked JavaScript.
import {conflictingRecovery} from '../verification/native-conflicting-action.mjs';

for(const carrier of ['chrome','edge'] as const)test(carrier==='chrome'?'B32 E20 chrome restores inspection work and received conclusion':'B32 E21 edge restores accepted work and undelivered completion',async({},info)=>{
 test.skip(process.platform!=='win32','Windows native evidence; Linux cannot sign this carrier.');
 test.setTimeout(180000);
 const profileRoot=process.env.B32_OWNED_PROFILE_ROOT,origin=process.env.FB01_URL;
 if(!profileRoot||!origin)throw Error('Admitted B32 owned profile root and origin required');
 await conflictingRecovery(carrier,{chromium,expect,info,profileRoot,origin});
});
