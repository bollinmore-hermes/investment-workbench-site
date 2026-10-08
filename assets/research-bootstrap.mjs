import {validClientId,loadGoogleIdentity,verifyGoogleCredential,DRIVE_SCOPE} from './research-auth.mjs';
import {GOOGLE_CLIENT_ID} from './research-config.mjs';
import {session,verifyDriveAccount} from './research-session.mjs';
const $=selector=>document.querySelector(selector);
let nonce,clientId,tokenClient,entered=false,pendingAuthorization=false;
let initializing=false,initialized=false;
const status=message=>{$('#loginStatus').textContent=message;};
$('#loginClientId').value=GOOGLE_CLIENT_ID;
$('#loginConfig').hidden=validClientId(GOOGLE_CLIENT_ID);
$('#authorizeDrive').hidden=true;
$('#googleSignIn').hidden=true;
// Only a non-secret sign-out preference is stored; it never proves identity.
const LOGIN_MODE_KEY='research-login-mode';
let verifyingIdentity=false;
function signedOut(){try{return sessionStorage.getItem(LOGIN_MODE_KEY)==='signed-out';}catch{return false;}}
function rememberSignOut(){try{sessionStorage.setItem(LOGIN_MODE_KEY,'signed-out');}catch{}}
function clearSignOut(){try{sessionStorage.removeItem(LOGIN_MODE_KEY);}catch{}}
const authorizationChanged=()=>window.dispatchEvent(new Event('research-authorization-change'));
const driveStatus=message=>{if(entered)$('#status').textContent=message;else status(message);};
function connectionBusy(value){$('#authorizeDrive').disabled=value;$('#reauthorizeDrive').disabled=value;}

async function handleCredential(response){
  if(verifyingIdentity||session.identity||entered)return;
  verifyingIdentity=true;
  try{
    const identity=await verifyGoogleCredential(response.credential,{clientId,nonce});
    session.authorization.clear();
    session.identity=identity;
    clearSignOut();
    authorizationChanged();
    $('#googleSignIn').hidden=true;
    $('#authorizeDrive').textContent='連接自己的Drive並進入';
    $('#authorizeDrive').hidden=false;
    status('已確認Google身分：'+identity.label+'。請點「連接自己的Drive並進入」；已同意且權限未變更時，不強制重複同意。');
    // OAuth popups require a user gesture; never open one during One Tap recovery.
  }catch(error){
    session.identity=null;
    session.authorization.clear();
    authorizationChanged();
    $('#authorizeDrive').hidden=true;
    $('#googleSignIn').hidden=false;
    status(error.message);
  }finally{verifyingIdentity=false;}
}

async function handleDriveResponse(response){
  connectionBusy(true);
  try{
    if(!session.identity)throw new Error('請先完成Google登入。');
    session.authorization.accept(response);
    await verifyDriveAccount(session.authorization.get(),session.identity.sub);
    authorizationChanged();
    if(!entered){
      status('正在檢查自己的Drive文字資料，完成後才顯示研究…');
      await import('./research-app.mjs');
      entered=true;
      $('#accountLabel').textContent=session.identity.label;
      $('#loginGate').hidden=true;
      $('#researchApp').hidden=false;
    }else{
      $('#status').textContent='Drive已重新連接；請按「同步文字資料」檢查雲端版本。';
    }
  }catch(error){
    session.authorization.clear();
    authorizationChanged();
    driveStatus(error.message);
  }finally{
    pendingAuthorization=false;
    connectionBusy(false);
  }
}

function beginDriveConnection(){
  if(pendingAuthorization)return;
  if(!session.identity)throw new Error('請先登入Google。');
  pendingAuthorization=true;
  connectionBusy(true);
  try{
    // Use the documented login_hint with the verified subject, not an untrusted label.
    // Google asks for consent when needed; do not force consent for returning users.
    tokenClient.requestAccessToken({prompt:'',login_hint:session.identity.sub});
  }catch(error){
    pendingAuthorization=false;
    connectionBusy(false);
    driveStatus('無法開啟Drive連線視窗：'+error.message+' 請再點一次「連接Drive」。');
  }
}

async function initializeGoogleLogin(){
  if(initializing||initialized)return;
  clientId=GOOGLE_CLIENT_ID||$('#loginClientId').value.trim();
  if(!validClientId(clientId)){
    status('尚缺此網站專用的Google Web OAuth Client ID。請由網站管理者設定；不要輸入Client Secret。');
    return;
  }
  initializing=true;
  status('正在載入Google官方登入…');
  try{
    await loadGoogleIdentity();
    nonce=crypto.randomUUID();
    const recover=!signedOut();
    google.accounts.id.initialize({client_id:clientId,nonce,auto_select:recover,callback:handleCredential});
    $('#googleSignIn').replaceChildren();
    $('#googleSignIn').hidden=false;
    google.accounts.id.renderButton($('#googleSignIn'),{type:'standard',theme:'outline',size:'large',text:'signin_with',width:280});
    tokenClient=google.accounts.oauth2.initTokenClient({
      client_id:clientId,scope:DRIVE_SCOPE+' openid email',include_granted_scopes:false,prompt:'',
      callback:handleDriveResponse,
      error_callback:()=>{
        pendingAuthorization=false;
        connectionBusy(false);
        driveStatus('Drive連線視窗未完成，請點「連接Drive」重試；這不代表既有權限已被撤銷。');
      }
    });
    session.reauthorize=beginDriveConnection;
    initialized=true;
    $('#loginClientId').readOnly=true;
    status(recover?'正在嘗試恢復Google登入；若瀏覽器未自動完成，請使用Google官方登入按鈕。尚未載入研究資料。':'已登出；請使用Google官方登入按鈕選擇帳號。尚未載入研究資料。');
    if(recover){
      try{google.accounts.id.prompt();}
      catch{status('瀏覽器未能自動恢復登入，請使用Google官方登入按鈕；尚未載入研究資料。');}
    }
  }catch(error){
    $('#googleSignIn').hidden=true;
    status(error.message+' 請檢查設定或網路後重新整理頁面。');
  }finally{initializing=false;}
}
$('#loginClientId').onchange=initializeGoogleLogin;
initializeGoogleLogin();
$('#authorizeDrive').onclick=()=>session.reauthorize?.();
$('#reauthorizeDrive').onclick=()=>{try{session.reauthorize?.();}catch(error){$('#status').textContent=error.message;}};
function logoutGoogle(){const event=new CustomEvent('research-before-logout',{cancelable:true});if(!window.dispatchEvent(event))return;rememberSignOut();session.authorization.clear();window.dispatchEvent(new Event('research-authorization-change'));session.identity=null;google.accounts.id.disableAutoSelect();location.reload();}
$('#logoutGoogle').onclick=logoutGoogle;
$('#switchGoogle').onclick=logoutGoogle;
