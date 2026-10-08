import {guestTopics,filterGuestSources} from './research-guest-data.mjs';
// Intentionally independent of authentication, storage, PDF and Drive modules.
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const root=document.createElement('div');
root.id='guestApp';
root.innerHTML=`<header class="topbar"><div><div class="brand">投資研究工作台</div><span class="mini">訪客唯讀預覽 · 全部為虛構示範</span></div><a class="primary" href="./">登入使用自己的研究</a></header>
<div class="app"><aside class="sidebar"><div class="side-caption">示範研究主題</div><div id="guestTopics"></div><button data-guest-write>＋ 新增研究主題</button><p class="side-tip">訪客不讀取私人研究、不保存輸入、不授權 Google Drive。</p></aside>
<main class="shell"><div class="banner"><strong>訪客模式：全部內容均為虛構示範，不是投資建議。</strong> 可瀏覽、搜尋及查看引用；新增、編輯與同步需登入。AI 尚未啟用。</div>
<div class="hero"><h1 id="guestTitle"></h1><button data-guest-write>編輯主題 · 需登入</button></div>
<nav class="tabs" aria-label="訪客研究工作區"><button data-guest-tab="overview">主題總覽</button><button data-guest-tab="sources">來源與摘要</button><button data-guest-tab="understanding">我的理解與校對</button><button data-guest-tab="fusion">跨來源融合</button></nav>
<section id="guestOverview"><div id="guestOverviewContent"></div><button data-guest-write>儲存研究筆記 · 需登入</button></section>
<section id="guestSources" hidden><div class="row between section"><h2>示範來源</h2><button data-guest-write>＋ 加入來源 · 需登入</button></div><label for="guestSearch">搜尋示範來源</label><input id="guestSearch" type="search" placeholder="搜尋名稱、摘要、引用或筆記"><div id="guestSourceCards" class="stack section"></div></section>
<section id="guestUnderstanding" hidden><div class="card section"><h2>示範理解</h2><p id="guestUnderstandingText"></p><p class="danger-note">AI 校對尚未啟用；此處不分析文字或產生校對結果。</p><button data-guest-write>編輯理解 · 需登入</button></div></section>
<section id="guestFusion" hidden><div id="guestConnections" class="stack section"></div><button data-guest-write>＋ 整理论點 · 需登入</button></section>
<div class="actions section"><button data-guest-write>匯入備份 · 需登入</button><button data-guest-write>下載完整備份 · 需登入</button><button data-guest-write>同步文字資料 · 需登入</button></div>
<p id="guestStatus" role="status" aria-live="polite">未載入任何私人研究；示範資料不保存。</p>
<dialog id="guestEvidence"><div class="row between"><h2 id="guestEvidenceTitle"></h2><button id="guestCloseEvidence">關閉</button></div><p id="guestEvidenceLocator"></p><div id="guestEvidenceQuote" class="quote source-body"></div><p>虛構示範引用，非真實報告、新聞或 PDF。</p></dialog></main></div>`;
document.querySelector('#loginGate').hidden=true;
document.body.append(root);
const $=selector=>root.querySelector(selector);
let selected=guestTopics[0],tab='overview';
function showTab(name){
  tab=name;
  for(const key of ['overview','sources','understanding','fusion'])$('#guest'+key[0].toUpperCase()+key.slice(1)).hidden=key!==name;
  root.querySelectorAll('[data-guest-tab]').forEach(button=>button.classList.toggle('active',button.dataset.guestTab===name));
}
function renderSources(){
  const items=filterGuestSources(selected,$('#guestSearch').value);
  $('#guestSourceCards').innerHTML=items.length?items.map(s=>`<article class="card source"><span class="pill">${esc(s.kind)} · 虛構示範</span><h3>${esc(s.title)}</h3><p class="mini">${esc(s.provider)}</p><p>${esc(s.summary)}</p><details><summary>補充筆記</summary><p>${esc(s.note)}</p></details><button data-guest-evidence="${esc(s.id)}">查看示範引用</button> <button data-guest-write>編輯來源 · 需登入</button></article>`).join(''):'<div class="card empty-state">沒有符合搜尋的示範來源。</div>';
}
function render(){
  $('#guestTopics').innerHTML=guestTopics.map(t=>`<button class="theme ${t.id===selected.id?'active':''}" data-guest-topic="${esc(t.id)}">${esc(t.title)}</button>`).join('');
  $('#guestTitle').textContent=selected.title;
  $('#guestOverviewContent').innerHTML=`<div class="three section"><div class="card">示範來源<div class="metric">${selected.sources.length}</div></div><div class="card">真實原文已核對<div class="metric">0</div></div><div class="card">示範論點<div class="metric">${selected.connections.length}</div></div></div>`+[['研究問題',selected.question],['示範結論',selected.conclusion],['風險',selected.risks],['後續驗證',selected.nextChecks]].map(([label,value])=>`<div class="card section"><h2>${label}</h2><p class="source-body">${esc(value)}</p></div>`).join('');
  $('#guestUnderstandingText').textContent=selected.understanding;
  $('#guestConnections').innerHTML=selected.connections.map(c=>`<article class="card"><span class="pill amber">${esc(c.relation)} · 虛構示範</span><h2>${esc(c.title)}</h2><p>${esc(c.note)}</p><ul>${c.sourceIds.map(id=>`<li><button data-guest-evidence="${esc(id)}">${esc(selected.sources.find(s=>s.id===id).title)}</button></li>`).join('')}</ul></article>`).join('');
  renderSources();showTab(tab);
}
root.addEventListener('click',event=>{
  const button=event.target.closest('button');if(!button||!root.contains(button))return;
  if(button.hasAttribute('data-guest-write')){$('#guestStatus').textContent='此操作需要登入。請使用上方「登入使用自己的研究」；訪客預覽不會保存或同步任何資料。';return;}
  if(button.dataset.guestTab)showTab(button.dataset.guestTab);
  if(button.dataset.guestTopic){selected=guestTopics.find(t=>t.id===button.dataset.guestTopic);$('#guestSearch').value='';render();}
  if(button.dataset.guestEvidence){const source=selected.sources.find(s=>s.id===button.dataset.guestEvidence);if(!source)return;$('#guestEvidenceTitle').textContent=source.title;$('#guestEvidenceLocator').textContent=source.locator;$('#guestEvidenceQuote').textContent=source.quote;$('#guestEvidence').showModal();}
});
$('#guestSearch').oninput=renderSources;
$('#guestCloseEvidence').onclick=()=>$('#guestEvidence').close();
render();
