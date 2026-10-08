import {validClientId,verifyGoogleCredential} from './research-auth.mjs';
export const CACHE_KEY='research-auth-session-v1';
export const MAX_SESSION_MS=60*60*1000;
export const EXPIRY_SKEW_MS=30000;
const fields=['version','clientId','credential','nonce','accessToken','accessExpiresAt','savedAt','expiresAt'].sort();
const text=(value,max)=>typeof value==='string'&&value.length>0&&value.length<=max;
const time=value=>Number.isSafeInteger(value)&&value>0;
function validRecord(record,clientId,now){
  return record&&typeof record==='object'&&!Array.isArray(record)&&
    Object.keys(record).sort().join('|')===fields.join('|')&&record.version===1&&
    validClientId(clientId)&&record.clientId===clientId&&text(record.credential,20000)&&
    text(record.nonce,200)&&text(record.accessToken,20000)&&
    time(record.savedAt)&&record.savedAt<=now+EXPIRY_SKEW_MS&&
    time(record.accessExpiresAt)&&record.accessExpiresAt>record.savedAt&&
    time(record.expiresAt)&&record.expiresAt>record.savedAt&&
    record.expiresAt<=record.savedAt+MAX_SESSION_MS&&record.expiresAt<=record.accessExpiresAt;
}
function deadline(record,identity){
  if(!identity||!time(identity.issuedAt)||!time(identity.expiresAt))throw new Error('登入憑證缺少已驗證的期限。');
  // The signed issuance time is also a cap; editing local timestamps cannot renew it.
  return Math.min(record.accessExpiresAt,record.savedAt+MAX_SESSION_MS,identity.expiresAt,identity.issuedAt+MAX_SESSION_MS);
}
export class SessionCredentialCache {
  constructor({storage=()=>globalThis.sessionStorage,now=()=>Date.now(),verifyCredential=verifyGoogleCredential}={}){this.storage=storage;this.now=now;this.verifyCredential=verifyCredential;}
  clear(){try{this.storage().removeItem(CACHE_KEY);return true;}catch{return false;}}
  save({clientId,credential,nonce,accessToken,accessExpiresAt,identity}){
    const record={version:1,clientId,credential,nonce,accessToken,accessExpiresAt,savedAt:this.now(),expiresAt:0};
    try{record.expiresAt=deadline(record,identity);}catch{return {status:'invalid'};}
    if(record.expiresAt<=this.now()+EXPIRY_SKEW_MS){this.clear();return {status:'expired'};}
    if(!validRecord(record,clientId,this.now())){this.clear();return {status:'invalid'};}
    try{this.storage().setItem(CACHE_KEY,JSON.stringify(record));return {status:'saved',expiresAt:record.expiresAt};}
    catch{return {status:'unavailable',expiresAt:record.expiresAt};}
  }
  async read(clientId){
    let raw,record;
    try{raw=this.storage().getItem(CACHE_KEY);}catch{return {status:'unavailable'};}
    if(raw===null)return {status:'missing'};
    try{if(typeof raw!=='string'||raw.length>60000)throw new Error();record=JSON.parse(raw);if(!validRecord(record,clientId,this.now()))throw new Error();}
    catch{this.clear();return {status:'invalid'};}
    if(record.expiresAt<=this.now()+EXPIRY_SKEW_MS){this.clear();return {status:'expired'};}
    try{
      const identity=await this.verifyCredential(record.credential,{clientId,nonce:record.nonce,now:this.now()});
      if(record.expiresAt!==deadline(record,identity))throw new Error('期限不一致。');
      if(record.expiresAt<=this.now()+EXPIRY_SKEW_MS){this.clear();return {status:'expired'};}
      return {status:'ready',identity,record};
    }catch(error){if(error?.code==='IDENTITY_NETWORK')return {status:'retry'};this.clear();return {status:'invalid'};}
  }
}
