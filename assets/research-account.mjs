import {validateWorkspace,MAX_TOTAL_PDF_BYTES} from './research-data.mjs';
export function formatBytes(bytes){
  if(!Number.isSafeInteger(bytes)||bytes<0)return '無法取得';
  if(bytes<1024)return bytes.toLocaleString('zh-TW')+' bytes';
  const unit=bytes<1024*1024?'KiB':'MiB',divisor=unit==='KiB'?1024:1024*1024;
  return (bytes/divisor).toLocaleString('zh-TW',{maximumFractionDigits:2})+' '+unit;
}
export function workspaceUsage(workspace){
  validateWorkspace(workspace);
  const attachments=workspace.sources.filter(source=>source.attachment);
  return {pdfBytes:attachments.reduce((sum,source)=>sum+source.attachment.blob.size,0),pdfCount:attachments.length,topics:workspace.topics.length,sources:workspace.sources.length,connections:workspace.connections.length};
}
export function mountAccountCenter({session,getWorkspace,isReady,refreshUsage}){
  const $=selector=>document.querySelector(selector);
  let page='research',usageState='idle';
  const label=session.identity.label;
  $('#accountLabel').textContent=label;
  $('#userAccountLabel').textContent=label;
  $('#accountAvatar').textContent=Array.from(label)[0]?.toLocaleUpperCase()||'研';
  function local(){if(!isReady())return;const data=workspaceUsage(getWorkspace());$('#localPdfBytes').textContent=formatBytes(data.pdfBytes)+' / '+formatBytes(MAX_TOTAL_PDF_BYTES);$('#localPdfCount').textContent=data.pdfCount+' 份';$('#localResearchCounts').textContent=data.topics+' 主題 · '+data.sources+' 來源 · '+data.connections+' 論點';$('#localPdfProgress').max=MAX_TOTAL_PDF_BYTES;$('#localPdfProgress').value=data.pdfBytes;}
  function unavailable(message){for(const id of ['cloudTotalBytes','cloudVersionCount','cloudLatestBytes','cloudLatestAt','cloudCheckedAt'])$('#'+id).textContent='無法取得';$('#usageStatus').textContent=message;usageState='error';}
  function authorization(){try{session.authorization.get();$('#driveAuthorization').textContent='已連接';$('#driveAuthorization').classList.remove('amber');}catch{$('#driveAuthorization').textContent='未連接或憑證已到期';$('#driveAuthorization').classList.add('amber');if(usageState!=='error')unavailable('Drive尚未連接或憑證已到期；請重新連接後查詢，既有權限不會因此撤銷。本機資料仍保留。');$('#compactCloudStatus').textContent='連線憑證已到期 · 待重新連接';}}
  function compact(){const message=$('#cloudStatus').textContent;let text='待檢查同步';if(message.startsWith('未完成同步'))text='同步失敗';else if(message.includes('待確認')||message.includes('合併預覽'))text='待確認合併';else if(message.includes('草稿')||message.includes('待同步'))text='待同步';else if(message.includes('正在'))text='同步中';else if(message.includes('雲端已保存')||message.includes('已從自己的Drive載入')||message.includes('已載入較新雲端文字')){text='文字已同步';$('#lastVerifiedAt').textContent=new Date().toLocaleString('zh-TW');}else if(message.includes('尚無研究資料'))text='尚無雲端研究';$('#compactCloudStatus').textContent=text;authorization();}
  function show(target){page=target;$('#researchApp').classList.toggle('account-view',target==='account');$('#researchPage').hidden=target!=='research';$('#accountPage').hidden=target!=='account';for(const [id,active] of [['openResearch',target==='research'],['openAccountSide',target==='account']]){const button=$('#'+id);button.classList.toggle('active',active);if(active)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');}if(target==='account'){local();authorization();$('#accountHeading').focus();}else $('#topicTitle').scrollIntoView({block:'start'});}
  for(const id of ['openAccount','openAccountSide','openSyncDetails'])$('#'+id).onclick=()=>show('account');
  $('#openResearch').onclick=()=>show('research');
  $('#refreshUsage').onclick=refreshUsage;
  const observer=new MutationObserver(compact);observer.observe($('#cloudStatus'),{childList:true,characterData:true,subtree:true});
  const authTimer=setInterval(authorization,30000);
  window.addEventListener('research-authorization-change',authorization);
  window.addEventListener('research-workspace-change',()=>{local();if(document.querySelector('#saveNotes')&&!document.querySelector('#saveNotes').disabled)$('#compactCloudStatus').textContent='有未儲存草稿';});
  window.addEventListener('pagehide',()=>{observer.disconnect();clearInterval(authTimer);},{once:true});
  authorization();
  return {
    local,show,
    loading(){usageState='loading';for(const id of ['cloudTotalBytes','cloudVersionCount','cloudLatestBytes','cloudLatestAt','cloudCheckedAt'])$('#'+id).textContent='載入中…';$('#usageStatus').textContent='正在讀取並驗證Drive歷史快照…';},
    unavailable,
    apply(usage){usageState='ready';$('#cloudTotalBytes').textContent=formatBytes(usage.totalBytes);$('#cloudVersionCount').textContent=usage.fileCount+' 份';$('#cloudLatestBytes').textContent=usage.conflict?'並行版本待合併':formatBytes(usage.latestBytes);$('#cloudLatestAt').textContent=usage.conflict?'並行版本待合併':usage.latestAt?new Date(usage.latestAt).toLocaleString('zh-TW'):'尚無版本';$('#cloudCheckedAt').textContent=new Date(usage.checkedAt).toLocaleString('zh-TW');$('#usageStatus').textContent=usage.conflict?'容量已讀取；偵測到並行版本，須先比較並確認合併。':'容量已讀取並驗證；重新整理用量不會寫入雲端或完成同步。';authorization();},
    get page(){return page;}
  };
}
