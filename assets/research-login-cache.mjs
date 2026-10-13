import {validClientId,verifyWebsiteSessionCredential,WEBSITE_SESSION_MS} from './research-auth.mjs';
export const CACHE_KEY='research-auth-session-v1';
export const LOGIN_MODE_KEY='research-login-mode';
export const LOGIN_DB_NAME='research-login-state-v1';
export const MAX_SESSION_MS=WEBSITE_SESSION_MS;
const LEGACY_SESSION_MS=60*60*1000;
export const EXPIRY_SKEW_MS=30000;
const fields=['version','clientId','credential','nonce','accessToken','accessExpiresAt','savedAt','expiresAt'].sort();
const text=(value,max)=>typeof value==='string'&&value.length>0&&value.length<=max;
const time=value=>Number.isSafeInteger(value)&&value>0;
function validRecord(record,clientId,now){
  return record&&typeof record==='object'&&!Array.isArray(record)&&
    Object.keys(record).sort().join('|')===fields.join('|')&&[1,2].includes(record.version)&&
    validClientId(clientId)&&record.clientId===clientId&&text(record.credential,20000)&&
    text(record.nonce,200)&&
    ((text(record.accessToken,20000)&&time(record.accessExpiresAt))||
      (record.version===2&&record.accessToken===''&&record.accessExpiresAt===0))&&
    time(record.savedAt)&&record.savedAt<=now+EXPIRY_SKEW_MS&&
    (record.accessExpiresAt===0||(record.accessExpiresAt>record.savedAt&&record.accessExpiresAt<=record.savedAt+LEGACY_SESSION_MS))&&
    time(record.expiresAt)&&record.expiresAt>record.savedAt&&
    record.expiresAt<=record.savedAt+MAX_SESSION_MS&&
    (record.version===2||(record.expiresAt<=record.savedAt+LEGACY_SESSION_MS&&record.expiresAt<=record.accessExpiresAt));
}
function deadline(record,identity){
  if(!identity||!time(identity.issuedAt)||!time(identity.expiresAt)||identity.expiresAt<=identity.issuedAt||record.savedAt<identity.issuedAt-EXPIRY_SKEW_MS)throw new Error('登入憑證缺少已驗證的期限。');
  // Legacy sessions retain their original short lifetime, never silently upgrade.
  if(record.version===1)return Math.min(record.accessExpiresAt,record.savedAt+LEGACY_SESSION_MS,identity.expiresAt,identity.issuedAt+LEGACY_SESSION_MS);
  return identity.issuedAt+MAX_SESSION_MS;
}
// Dedicated login metadata only. Never opens a research database before verification.
export class IndexedDBLoginStorage {
  constructor({factory=()=>globalThis.indexedDB,notify=(key,value)=>{try{if(value===null)globalThis.localStorage.removeItem(key);else globalThis.localStorage.setItem(key,key===LOGIN_MODE_KEY?value:'present');}catch{}}}={}){this.factory=factory;this.notify=notify;}
  async access(key,mode,operation,value){
    if(![CACHE_KEY,LOGIN_MODE_KEY].includes(key))throw new Error('Unknown login metadata key');
    const db=await new Promise((resolve,reject)=>{
      const request=this.factory().open(LOGIN_DB_NAME,1);
      request.onupgradeneeded=()=>request.result.createObjectStore('state');
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error);
      request.onblocked=()=>reject(new Error('Login storage blocked'));
    });
    try{return await new Promise((resolve,reject)=>{
      let result=null;
      const transaction=db.transaction('state',mode,mode==='readwrite'?{durability:'strict'}:{});
      const store=transaction.objectStore('state');
      const request=operation==='get'?store.get(key):operation==='put'?store.put(value,key):store.delete(key);
      request.onsuccess=()=>{result=request.result??null;};
      transaction.oncomplete=()=>resolve(result);
      transaction.onabort=()=>reject(transaction.error||new Error('Login storage transaction aborted'));
      transaction.onerror=()=>reject(transaction.error||new Error('Login storage transaction failed'));
    });}finally{db.close();}
  }
  getItem(key){return this.access(key,'readonly','get');}
  async setItem(key,value){await this.access(key,'readwrite','put',value);this.notify(key,value);}
  async removeItem(key){await this.access(key,'readwrite','delete');this.notify(key,null);}
}
export class SessionCredentialCache {
  constructor({storage=()=>new IndexedDBLoginStorage(),now=()=>Date.now(),verifyCredential=verifyWebsiteSessionCredential}={}){this.storage=storage;this.now=now;this.verifyCredential=verifyCredential;}
  async clear(){try{await this.storage().removeItem(CACHE_KEY);return true;}catch{return false;}}
  async save({clientId,credential,nonce,accessToken,accessExpiresAt,identity}){
    const record={version:2,clientId,credential,nonce,accessToken,accessExpiresAt,savedAt:this.now(),expiresAt:0};
    try{record.expiresAt=deadline(record,identity);}catch{return {status:'invalid'};}
    if(record.expiresAt<=this.now()){await this.clear();return {status:'expired'};}
    if(!validRecord(record,clientId,this.now())){await this.clear();return {status:'invalid'};}
    try{await this.storage().setItem(CACHE_KEY,JSON.stringify(record));return {status:'saved',expiresAt:record.expiresAt};}
    catch{return {status:'unavailable',expiresAt:record.expiresAt};}
  }
  // UI-only preflight reads login metadata, never private workspace data.
  async hasCandidate(clientId){try{const raw=await this.storage().getItem(CACHE_KEY);if(typeof raw!=='string'||raw.length>60000)return false;const record=JSON.parse(raw);return validRecord(record,clientId,this.now())&&record.expiresAt>this.now();}catch{return false;}}
  async read(clientId){
    let raw,record;
    try{raw=await this.storage().getItem(CACHE_KEY);}catch{return {status:'unavailable'};}
    if(raw===null)return {status:'missing'};
    try{if(typeof raw!=='string'||raw.length>60000)throw new Error();record=JSON.parse(raw);if(!validRecord(record,clientId,this.now()))throw new Error();}
    catch{await this.clear();return {status:'invalid'};}
    if(record.expiresAt<=this.now()){await this.clear();return {status:'expired'};}
    try{
      const identity=await this.verifyCredential(record.credential,{clientId,nonce:record.nonce,now:this.now()});
      if(record.expiresAt!==deadline(record,identity))throw new Error('期限不一致。');
      if(record.expiresAt<=this.now()){await this.clear();return {status:'expired'};}
      const authorization=record.accessToken&&Math.min(record.accessExpiresAt,record.expiresAt)>this.now()+EXPIRY_SKEW_MS
        ?{accessToken:record.accessToken,expiresAt:Math.min(record.accessExpiresAt,record.expiresAt)}:null;
      return {status:'ready',identity,record,authorization};
    }catch(error){if(error?.code==='IDENTITY_NETWORK')return {status:'retry'};await this.clear();return {status:'invalid'};}
  }
}
