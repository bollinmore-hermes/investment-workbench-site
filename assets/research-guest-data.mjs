// Fictional UI fixtures only. Never populated from user workspaces or reports.
export const guestTopics = [
  {id:'capacity',title:'示範：供應鏈產能與需求',question:'產能計畫能否轉成實際出貨？',conclusion:'目前只能保留研究假設；規劃擴產不代表已實現獲利。',risks:'訂單與設備驗收可能延後。',nextChecks:'取得公司別的出貨及成本資料。',understanding:'區分來源陳述、成立條件與自己的推論。',sources:[
    {id:'plan',title:'範例公司甲的產能計畫',kind:'報告',provider:'虛構研究機構',summary:'公司甲規劃擴產，仍需確認客戶訂單。',quote:'【虛構引用】擴產時程取決於訂單確認與設備驗收。',locator:'示範段落 A（非真實頁碼）',note:'規劃不等於已認列營收。'},
    {id:'timing',title:'範例公司甲的出貨限制',kind:'新聞',provider:'虛構新聞來源',summary:'出貨時間仍未確定；擴產描述引用同一原始資料。',quote:'【虛構引用】出貨時點尚待確認；產能規劃引用前述示範報告。',locator:'示範段落 B（非真實新聞）',note:'同源引用不能算成兩份獨立證據。'}
  ],connections:[{title:'需求線索不等於獲利實現',relation:'待驗證',sourceIds:['plan','timing'],note:'需進一步確認訂單、出貨與利潤率。'}]},
  {id:'equipment',title:'示範：設備訂單驗證',question:'設備需求是否已有驗收證據？',conclusion:'證據不足，不能把規劃當成實際訂單。',risks:'驗收條件可能影響認列時點。',nextChecks:'比較訂單與驗收時間。',understanding:'觀點仍需實際資料驗證。',sources:[
    {id:'equipment-note',title:'範例公司乙的設備觀察',kind:'筆記',provider:'虛構作者',summary:'這是示範觀察問題，不是公司公告。',quote:'【虛構引用】需要驗收證據才能確認時點。',locator:'示範筆記 C',note:'未經人工對照真實原文。'}
  ],connections:[{title:'驗收條件仍需確認',relation:'待驗證',sourceIds:['equipment-note'],note:'示範論點，不是投資建議。'}]}
];
export function filterGuestSources(topic,query='') {
  const q=query.trim().toLocaleLowerCase();
  return topic.sources.filter(source=>[source.title,source.kind,source.provider,source.summary,source.quote,source.note].join(' ').toLocaleLowerCase().includes(q));
}
