import {test,expect,chromium} from '@playwright/test';
// @ts-expect-error Native verifier is separately syntax-checked JavaScript.
import {integratedRecovery} from '../verification/native-integrated-field.mjs';
for(const carrier of ['chrome','edge'] as const)test(carrier==='chrome'?'B33 AT047 chrome restores integrated field state':'B33 AT047 edge restores integrated field state',async({},info)=>{
 test.skip(process.platform!=='win32','Default Windows native carrier; Linux cannot sign this evidence.');test.setTimeout(240000);
 const profileRoot=process.env.B33_OWNED_PROFILE_ROOT,origin=process.env.FB01_URL;if(!profileRoot||!origin)throw Error('Admitted B33 owned profile root and origin required');await integratedRecovery(carrier,{chromium,expect,info,profileRoot,origin});
});
