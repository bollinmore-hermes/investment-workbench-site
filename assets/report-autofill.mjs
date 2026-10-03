import { extractFields } from './report-metadata.mjs';

function pageLines(items) {
  const groups = [];
  for (const item of items) {
    if (!item.str?.trim()) continue;
    const y = item.transform[5];
    let group = groups.find(row => Math.abs(row.y - y) < 2);
    if (!group) { group = { y, parts: [], size: 0 }; groups.push(group); }
    group.parts.push({ x: item.transform[4], text: item.str });
    group.size = Math.max(group.size, Math.abs(item.height || item.transform[3] || 0));
  }
  return groups.sort((a,b) => b.y - a.y).map(row => ({ text: row.parts.sort((a,b) => a.x - b.x).map(part => part.text).join(' ').replace(/([\p{Script=Han}])\s+(?=[\p{Script=Han}])/gu, '$1'), size: row.size }));
}

async function readPdf(file, signal) {
  if (file.size > 20 * 1024 * 1024) throw new Error('file-too-large');
  const buffer = await file.arrayBuffer();
  if (new TextDecoder().decode(buffer.slice(0,5)) !== '%PDF-') throw new Error('not-pdf');
  const pdfjs = await import('./pdfjs/pdf.min.mjs');
  if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('./pdfjs/pdf.worker.min.mjs', import.meta.url).href;
  const task = pdfjs.getDocument({ data: new Uint8Array(buffer), cMapUrl: new URL('./pdfjs/cmaps/', import.meta.url).href, cMapPacked: true, standardFontDataUrl: new URL('./pdfjs/standard_fonts/', import.meta.url).href, isEvalSupported: false, useWasm: false, useSystemFonts: true, disableFontFace: true });
  const abort = () => { task.destroy().catch(() => {}); };
  signal.addEventListener('abort', abort, { once: true });
  try {
    const pdf = await task.promise;
    const pages = [];
    for (let n = 1; n <= Math.min(pdf.numPages, 3); n++) {
      if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
      const page = await pdf.getPage(n);
      const text = await page.getTextContent();
      pages.push({ pageNumber: n, lines: pageLines(text.items) });
      page.cleanup();
    }
    const metadata = await pdf.getMetadata().catch(() => null);
    return { ...extractFields({ pages, filename: file.name, metadataTitle: metadata?.info?.Title ?? '' }), inspectedPages: pages.length, totalPages: pdf.numPages };
  } finally {
    signal.removeEventListener('abort', abort);
    await task.destroy().catch(() => {});
  }
}

export function createAutofillController(form, dialog) {
  const fields = ['title','symbol','broker','date','type'];
  const names = { title: '報告名稱', symbol: '標的', broker: '券商', date: '報告日期', type: '類型' };
  const status = document.querySelector('#autofillStatus');
  const details = document.querySelector('#autofillEvidence');
  const button = document.querySelector('#uploadSubmit');
  const manual = new Set();
  const automatic = new Map();
  let generation = 0, abortController = null, busy = false, lastResult = null;
  for (const key of fields) {
    for (const event of ['input','change']) form.elements[key].addEventListener(event, () => manual.add(key));
  }
  function cancel() {
    generation++; abortController?.abort(); abortController = null;
    busy = false; button.disabled = false;
  }
  form.addEventListener('reset', () => { cancel(); manual.clear(); automatic.clear(); lastResult = null; status.textContent = ''; details.replaceChildren(); details.hidden = true; });
  dialog.addEventListener('close', cancel);
  async function select(file) {
    cancel(); const current = generation;
    details.replaceChildren(); details.hidden = true; lastResult = null;
    for (const [key, value] of automatic) if (!manual.has(key) && form.elements[key].value === value) form.elements[key].value = '';
    automatic.clear();
    if (!file) { status.textContent = ''; return; }
    if (!manual.has('title') && !form.elements.title.value) { const fallback = file.name.replace(/\.pdf$/i,'').slice(0,200); form.elements.title.value = fallback; automatic.set('title', fallback); }
    busy = true; button.disabled = true; status.textContent = '正在讀取 PDF 前 3 頁並辨識欄位；檔案不會上傳到伺服器。';
    abortController = new AbortController(); const signal = abortController.signal;
    let timedOut = false;
    const ownAbortController = abortController;
    const timeout = setTimeout(() => { timedOut = true; ownAbortController.abort(); }, 20000);
    try {
      const result = await readPdf(file, signal);
      if (current !== generation) return;
      lastResult = result;
      const list = document.createElement('ul');
      for (const key of fields) {
        const item = result.fields[key];
        const li = document.createElement('li');
        if (item?.value) {
          const control = form.elements[key];
          if (!manual.has(key) && (!control.value || control.value === automatic.get(key))) { control.value = item.value; automatic.set(key,item.value); }
          const location = item.evidence.page ? `第 ${item.evidence.page} 頁` : item.evidence.source;
          const quality = item.confidence === 'high' ? '已辨識，請核對' : '待確認';
          const preserved = manual.has(key) ? '；保留你的手動輸入，以下為辨識建議' : '';
          li.textContent = `${names[key]}：${item.value}（${quality}${preserved}）｜${location}：${item.evidence.text}`;
        } else li.textContent = `${names[key]}：未能辨識，請手動填寫。`;
        list.append(li);
      }
      details.replaceChildren(list); details.hidden = false;
      const filled = fields.filter(key => result.fields[key]?.value && result.fields[key].confidence !== 'low').length;
      status.textContent = `${result.hasText ? `已讀取 ${result.inspectedPages}／${result.totalPages} 頁；找到 ${filled} 個欄位候選。請核對後再加入。` : '此檔案沒有可讀文字層。'} ${result.warnings.join(' ')}`;
    } catch (error) {
      if (current !== generation) return;
      if (timedOut) status.textContent = '辨識逾時，已停止處理。請手動填寫，或重新選擇檔案。';
      else if (error.name === 'PasswordException') status.textContent = '此 PDF 需要密碼；這一版不解析加密文件，請手動填寫。';
      else if (error.message === 'file-too-large') status.textContent = '檔案超過 20 MB，請改選較小的 PDF。';
      else if (error.message === 'not-pdf') status.textContent = '檔案不是可辨識的 PDF，請重新選擇。';
      else status.textContent = '無法自動辨識這份 PDF。請手動填寫；沒有產生猜測欄位，也沒有傳送檔案。';
    } finally {
      clearTimeout(timeout);
      if (current === generation) { busy = false; button.disabled = false; abortController = null; }
    }
  }
  return { select, cancel, get busy() { return busy; }, get result() { return lastResult; } };
}
