// Same-tab navigation metadata only. This is never authentication or research data.
export const VIEW_KEY='research-view-v1';
export const DEFAULT_VIEW=Object.freeze({page:'research',topicId:null,tab:'overview',scrollX:0,scrollY:0});
const pages=['research','account'],tabs=['overview','sources','understanding','fusion'];
const fields=['version','accountId','page','topicId','tab','scrollX','scrollY'].sort();
function valid(record){return record&&typeof record==='object'&&!Array.isArray(record)&&Object.keys(record).sort().join('|')===fields.join('|')&&record.version===1&&typeof record.accountId==='string'&&/^\d{1,80}$/.test(record.accountId)&&pages.includes(record.page)&&tabs.includes(record.tab)&&(record.topicId===null||typeof record.topicId==='string'&&/^[A-Za-z0-9-]{1,80}$/.test(record.topicId))&&['scrollX','scrollY'].every(key=>Number.isFinite(record[key])&&record[key]>=0&&record[key]<=10000000);}
export class ViewStateStore {
  constructor({storage=()=>globalThis.sessionStorage}={}){this.storage=storage;}
  read(accountId=null){try{const raw=this.storage().getItem(VIEW_KEY);if(typeof raw!=='string'||raw.length>2000)return {...DEFAULT_VIEW};const record=JSON.parse(raw);if(!valid(record)||accountId!==null&&record.accountId!==accountId)return {...DEFAULT_VIEW};const {page,topicId,tab,scrollX,scrollY}=record;return {page,topicId,tab,scrollX,scrollY};}catch{return {...DEFAULT_VIEW};}}
  save(accountId,view){const record={...view,version:1,accountId};if(!valid(record))return false;try{this.storage().setItem(VIEW_KEY,JSON.stringify(record));return true;}catch{return false;}}
  clear(){try{this.storage().removeItem(VIEW_KEY);return true;}catch{return false;}}
}
export function resolveView(view,topics){if(view.topicId!==null&&topics.some(topic=>topic.id===view.topicId)||view.topicId===null&&!topics.length)return {...view};return {...view,topicId:topics[0]?.id??null,tab:'overview',scrollX:view.page==='account'?view.scrollX:0,scrollY:view.page==='account'?view.scrollY:0};}
export function showPageLayout(document,target){
  const $=selector=>document.querySelector(selector);
  $('#researchApp').classList.toggle('account-view',target==='account');
  $('#researchPage').hidden=target!=='research';$('#accountPage').hidden=target!=='account';
  for(const [id,active] of [['openResearch',target==='research'],['openAccountSide',target==='account']]){const button=$('#'+id);button.classList.toggle('active',active);if(active)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');}
}
export function showTabLayout(document,name){
  for(const panel of tabs)document.querySelector('#'+panel).hidden=panel!==name;
  document.querySelectorAll('[data-tab]').forEach(button=>button.classList.toggle('active',button.dataset.tab===name));
}
export function paintPendingView(document,view){
  const $=selector=>document.querySelector(selector),root=$('#researchApp');
  root.inert=true;root.setAttribute('aria-busy','true');root.hidden=false;
  showPageLayout(document,view.page);showTabLayout(document,view.tab);
  $('#workspace').hidden=view.topicId===null;$('#noTopic').hidden=view.topicId!==null;
  $('#topicTitle').textContent='研究工作台';$('#storageStatus').textContent='';
  for(const id of ['sourceCount','verifiedCount','connectionCount'])$('#'+id).textContent='—';
  $('#googleIdentityStatus').textContent='尚未驗證';
}
