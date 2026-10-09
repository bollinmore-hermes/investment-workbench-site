import {validClientId,loadGoogleIdentity,verifyGoogleCredential,DRIVE_SCOPE} from './research-auth.mjs';
import {GOOGLE_CLIENT_ID} from './research-config.mjs';
import {session,verifyDriveAccount} from './research-session.mjs';
import {SessionCredentialCache,MAX_SESSION_MS,EXPIRY_SKEW_MS} from './research-login-cache.mjs';
import {ViewStateStore,paintPendingView} from './research-view.mjs';
const $=selector=>document.querySelector(selector);
const cache=new SessionCredentialCache({storage:()=>sessionStorage,now:()=>Date.now(),verifyCredential:verifyGoogleCredential});
let nonce,credential,credentialNonce,clientId,tokenClient,entered=false,pendingAuthorization=false;
let initializing=false,initialized=false,verifyingIdentity=false,preparingGoogle;
let sessionExpiresAt=0,expiryTimer,sessionExpired=false,pendingView=false,workspaceAccountId=null;
const viewStore=new ViewStateStore({storage:()=>sessionStorage});
const LOGIN_MODE_KEY='research-login-mode';
const status=message=>{$('#loginStatus').textContent=message;};
const warning=message=>{$('#sessionWarning').textContent=message;$('#sessionWarning').hidden=!message;};
const authorizationChanged=()=>window.dispatchEvent(new Event('research-authorization-change'));
const driveStatus=message=>{if(entered)$('#status').textContent=message;else status(message);};
function signedOut(){try{return sessionStorage.getItem(LOGIN_MODE_KEY)==='signed-out';}catch{return false;}}
function rememberSignOut(){try{sessionStorage.setItem(LOGIN_MODE_KEY,'signed-out');}catch{}}
function clearSignOut(){try{sessionStorage.removeItem(LOGIN_MODE_KEY);}catch{}}
function connectionBusy(value){$('#authorizeDrive').disabled=value;$('#reauthorizeDrive').disabled=value;}
function showLogin(){pendingView=false;$('#sessionLoading').hidden=true;$('#researchApp').hidden=true;$('#researchApp').inert=true;$('#loginGate').hidden=false;}
function showPendingView(){
  pendingView=true;const view=viewStore.read();paintPendingView(document,view);
  $('#sessionLoading').hidden=true;$('#loginGate').hidden=true;
  if(window.history)window.history.scrollRestoration='manual';
  $('#researchApp').style.minHeight=(view.scrollY+window.innerHeight)+'px';
  requestAnimationFrame(()=>window.scrollTo(view.scrollX,view.scrollY));
}
function offerRestoreRetry(message){if(!pendingView)showLogin();$('#retrySessionRestore').hidden=false;warning(message);}
function identityDeadline(){return session.identity?Math.min(session.identity.expiresAt,session.identity.issuedAt+MAX_SESSION_MS):0;}
function expireSession(){
  if(sessionExpired)return;
  sessionExpired=true;clearTimeout(expiryTimer);cache.clear();session.authorization.clear();
  const identityExpired=identityDeadline()<=Date.now()+EXPIRY_SKEW_MS;
  if(identityExpired)$('#googleIdentityStatus').textContent='登入已到期';
  warning('本次 Drive 連線已到期；雲端同步已停止，研究與草稿保留。這不代表 Google 既有權限已被撤銷。'+(identityExpired?'Google 登入也已到期；請先儲存或備份草稿，再按「重新連接 Drive」重新登入並連接。':'請按「重新連接 Drive」取得新的連線憑證。'));
  authorizationChanged();
}
function checkSessionExpiry(){if(sessionExpiresAt&&Date.now()+EXPIRY_SKEW_MS>=sessionExpiresAt)expireSession();}
function armExpiry(expiresAt){
  clearTimeout(expiryTimer);sessionExpiresAt=expiresAt;sessionExpired=false;
  $('#loginExpiresAt').textContent=new Date(expiresAt).toLocaleString('zh-TW',{hour12:false});
  $('#googleIdentityStatus').textContent='Google 已登入';
  expiryTimer=setTimeout(checkSessionExpiry,Math.max(0,expiresAt-Date.now()-EXPIRY_SKEW_MS));
}
window.addEventListener('focus',checkSessionExpiry);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)checkSessionExpiry();});
window.addEventListener('research-authorization-change',()=>{
  if(!entered||session.authorization.token||sessionExpired)return;
  cache.clear();
  if(Date.now()+EXPIRY_SKEW_MS>=sessionExpiresAt){expireSession();return;}
  warning('本次 Drive 連線無法使用，雲端同步暫停；研究與草稿保留。請按「重新連接 Drive」重試；這不代表 Google 既有權限已被撤銷。');
});
$('#loginClientId').value=GOOGLE_CLIENT_ID;
$('#loginConfig').hidden=validClientId(GOOGLE_CLIENT_ID);
$('#authorizeDrive').hidden=true;$('#googleSignIn').hidden=true;
$('#loginGate').hidden=true;$('#retrySessionRestore').hidden=true;
async function enterWorkspace(){
  if(entered)return;
  const accountId=session.identity?.sub;if(!accountId)throw new Error('請先完成Google登入。');
  if(workspaceAccountId&&workspaceAccountId!==accountId)throw new Error('此分頁已初始化另一帳號，請重新整理後再登入，以確保研究資料隔離。');
  workspaceAccountId=accountId;
  status('正在檢查自己的Drive文字資料，完成後才顯示研究…');
  const app=await import('./research-app.mjs');session.authorization.get();
  $('#accountLabel').textContent=session.identity.label;
  $('#sessionLoading').hidden=true;$('#loginGate').hidden=true;$('#researchApp').hidden=false;
  $('#researchApp').style.minHeight='';
  await app?.restoreViewPosition?.();
  $('#researchApp').inert=false;$('#researchApp').removeAttribute('aria-busy');pendingView=false;entered=true;
}
async function handleCredential(response){
  if(verifyingIdentity||session.identity||entered)return;
  verifyingIdentity=true;
  try{
    const identity=await verifyGoogleCredential(response.credential,{clientId,nonce});
    cache.clear();session.authorization.clear();session.identity=identity;
    credential=response.credential;credentialNonce=nonce;clearSignOut();authorizationChanged();
    $('#googleSignIn').hidden=true;$('#authorizeDrive').textContent='連接 Drive，載入研究';$('#authorizeDrive').hidden=false;
    status('Google 登入已完成：'+identity.label+'。請連接 Drive 以載入研究；若先前已同意且權限未變更，通常不需再次同意。');
  }catch(error){
    credential=null;session.identity=null;session.authorization.clear();cache.clear();authorizationChanged();
    $('#authorizeDrive').hidden=true;$('#googleSignIn').hidden=false;status(error.message);
  }finally{verifyingIdentity=false;}
}
async function handleDriveResponse(response){
  connectionBusy(true);
  try{
    if(!session.identity)throw new Error('請先完成Google登入。');
    session.authorization.accept(response);await verifyDriveAccount(session.authorization.get(),session.identity.sub);
    const saved=cache.save({clientId,credential,nonce:credentialNonce,accessToken:session.authorization.token,accessExpiresAt:session.authorization.expiresAt,identity:session.identity});
    if(!['saved','unavailable'].includes(saved.status))throw new Error('登入憑證已到期或期限無效，請先儲存草稿，再重新登入。');
    session.authorization.restore(session.authorization.token,saved.expiresAt);armExpiry(saved.expiresAt);
    warning(saved.status==='unavailable'?'瀏覽器不允許儲存限時登入；本次可使用，但重新整理後需再次登入與連接Drive。':'');
    authorizationChanged();
    if(!entered)await enterWorkspace();else $('#status').textContent='Drive已重新連接；請按「同步文字資料」檢查雲端版本。';
  }catch(error){cache.clear();session.authorization.clear();authorizationChanged();driveStatus(error.message);}
  finally{pendingAuthorization=false;connectionBusy(false);}
}
function beginDriveConnection(){
  if(pendingAuthorization)return;
  if(!session.identity)throw new Error('請先登入Google。');
  if(identityDeadline()<=Date.now()+EXPIRY_SKEW_MS){
    if(entered){expireSession();const guard=new CustomEvent('research-before-logout',{cancelable:true});if(!window.dispatchEvent(guard))return;}
    cache.clear();location.reload();return;
  }
  if(!tokenClient){driveStatus('正在載入 Google 連線服務，請稍後再點「'+(entered?'重新連接 Drive':'連接 Drive，載入研究')+'」。');prepareGoogle(false).catch(error=>warning(error.message));return;}
  pendingAuthorization=true;connectionBusy(true);
  try{tokenClient.requestAccessToken({prompt:'',login_hint:session.identity.sub});}
  catch(error){pendingAuthorization=false;connectionBusy(false);driveStatus('無法開啟 Drive 連線視窗：'+error.message+' 請重新點「'+(entered?'重新連接 Drive':'連接 Drive，載入研究')+'」。');}
}
function prepareGoogle(recover){
  if(tokenClient)return Promise.resolve();if(preparingGoogle)return preparingGoogle;
  preparingGoogle=(async()=>{
    await loadGoogleIdentity();nonce=crypto.randomUUID();
    google.accounts.id.initialize({client_id:clientId,nonce,auto_select:recover,callback:handleCredential});
    $('#googleSignIn').replaceChildren();
    google.accounts.id.renderButton($('#googleSignIn'),{type:'standard',theme:'outline',size:'large',text:'signin_with',width:280});
    $('#googleSignIn').hidden=entered||!!session.identity;
    tokenClient=google.accounts.oauth2.initTokenClient({client_id:clientId,scope:DRIVE_SCOPE+' openid email',include_granted_scopes:false,prompt:'',callback:handleDriveResponse,error_callback:()=>{pendingAuthorization=false;connectionBusy(false);driveStatus('Drive 連線未完成，請重新點「'+(entered?'重新連接 Drive':'連接 Drive，載入研究')+'」；這不代表 Google 既有權限已被撤銷。');}});
    if(recover){try{google.accounts.id.prompt();}catch{status('瀏覽器未能自動恢復登入，請使用Google官方登入按鈕；尚未載入研究資料。');}}
  })().finally(()=>{preparingGoogle=null;});return preparingGoogle;
}
async function initializeGoogleLogin(){
  if(initializing||initialized)return;
  clientId=GOOGLE_CLIENT_ID||$('#loginClientId').value.trim();
  if(!validClientId(clientId)){showLogin();status('尚缺此網站專用的Google Web OAuth Client ID。請由網站管理者設定；不要輸入Client Secret。');return;}
  initializing=true;$('#retrySessionRestore').hidden=true;
  if(!signedOut()&&cache.hasCandidate(clientId)&&!pendingView)showPendingView();
  try{
    const loggedOut=signedOut();if(loggedOut)cache.clear();
    const saved=loggedOut?{status:'missing'}:await cache.read(clientId);
    if(saved.status==='retry'){offerRestoreRetry('暫時無法驗證既有Google登入，尚未載入研究；快取保留原期限，請稍後重試。');return;}
    if(saved.status==='ready'){
      try{
        session.authorization.restore(saved.record.accessToken,saved.record.expiresAt);await verifyDriveAccount(session.authorization.get(),saved.identity.sub);
        session.identity=saved.identity;credential=saved.record.credential;credentialNonce=saved.record.nonce;
        armExpiry(saved.record.expiresAt);clearSignOut();warning('');await enterWorkspace();initialized=true;$('#loginClientId').readOnly=true;
        // Valid-cache restoration never requests a new token or opens One Tap.
        prepareGoogle(false).catch(error=>warning('已恢復限時登入；'+error.message+' 目前研究可繼續，重新連接時再重試。'));return;
      }catch(error){
        session.authorization.clear();session.identity=null;credential=null;clearTimeout(expiryTimer);
        if(error.code==='DRIVE_NETWORK'){offerRestoreRetry('暫時無法驗證Drive連線，尚未載入研究；快取保留原期限，請稍後重試。');return;}
        cache.clear();warning('無法恢復既有登入或Drive連線：'+error.message+' 請重新登入。');
      }
    }else if(saved.status==='expired')warning('上次保存的登入或 Drive 連線憑證已到期。請先登入 Google，再連接 Drive 以載入研究；這不代表 Google 既有權限已被撤銷，本機已儲存研究仍保留。');
    else if(saved.status==='invalid')warning('保存的登入憑證無效，已清除；請重新登入。');
    else if(saved.status==='unavailable')warning('瀏覽器不允許儲存限時登入；重新整理後需再次登入與連接Drive。');
    showLogin();const recover=!loggedOut&&['missing','unavailable'].includes(saved.status);
    status(loggedOut?'已登出；請使用Google官方登入按鈕選擇帳號。尚未載入研究資料。':'正在載入Google官方登入；尚未載入研究資料。');
    await prepareGoogle(recover);initialized=true;$('#loginClientId').readOnly=true;
    if(!session.identity)status(loggedOut?'已登出；請使用Google官方登入按鈕選擇帳號。尚未載入研究資料。':'請使用Google官方登入按鈕；尚未載入研究資料。');
  }catch(error){showLogin();$('#googleSignIn').hidden=true;status(error.message+' 請檢查設定或網路後重新整理頁面。');}
  finally{initializing=false;}
}
session.reauthorize=beginDriveConnection;
$('#loginClientId').onchange=initializeGoogleLogin;$('#retrySessionRestore').onclick=initializeGoogleLogin;
$('#authorizeDrive').onclick=()=>{try{session.reauthorize?.();}catch(error){status(error.message);}};
$('#reauthorizeDrive').onclick=()=>{try{session.reauthorize?.();}catch(error){$('#status').textContent=error.message;}};
function logoutGoogle(){
  const event=new CustomEvent('research-before-logout',{cancelable:true});if(!window.dispatchEvent(event))return;
  clearTimeout(expiryTimer);cache.clear();viewStore.clear();rememberSignOut();credential=null;session.authorization.clear();authorizationChanged();session.identity=null;
  globalThis.google?.accounts?.id?.disableAutoSelect();location.reload();
}
$('#logoutGoogle').onclick=logoutGoogle;$('#switchGoogle').onclick=logoutGoogle;
initializeGoogleLogin();
