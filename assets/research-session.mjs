import {MemoryAuthorization} from './research-auth.mjs';
export const session={identity:null,authorization:new MemoryAuthorization(),reauthorize:null};
export async function verifyDriveAccount(token,accountId,fetcher=fetch){const response=await fetcher('https://openidconnect.googleapis.com/v1/userinfo',{credentials:'omit',headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(15000)});if(!response.ok)throw new Error('無法驗證Drive授權帳號；沒有載入私人資料。');const user=await response.json();if(user.sub!==accountId)throw new Error('登入帳號與Drive授權帳號不同，請使用同一Google帳號。');return true;}
