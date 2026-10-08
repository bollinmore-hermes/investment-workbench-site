// Route before loading any identity cache or private workspace modules.
const guestMode=new URLSearchParams(location.search).get('mode')==='guest';
import(guestMode?'./research-guest.mjs':'./research-login-bootstrap.mjs').catch(()=>{
  document.querySelector('#guestApp')?.remove();
  document.querySelector('#sessionLoading').hidden=true;
  document.querySelector('#loginGate').hidden=false;
  document.querySelector('#loginStatus').textContent='頁面載入失敗，請重新整理後再試。';
});
