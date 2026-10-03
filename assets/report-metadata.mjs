const FIELD_KEYS = ['title', 'symbol', 'broker', 'date', 'type'];
const MONTHS = ['january','february','march','april','may','june','july','august','september','october','november','december'];
const clean = text => String(text ?? '').normalize('NFKC').replace(/[\t ]+/g, ' ').trim();
const unique = values => [...new Set(values)];
const evidence = (row, source = 'PDF 文字') => ({ page: row?.page ?? null, text: row?.text?.slice(0, 180) ?? '', source });
const candidate = (value, row, confidence = 'high', source) => ({ value, confidence, evidence: evidence(row, source) });
const titleLabel = /^(?:報告名稱|報告標題|研究主題|Report Title|Title)\s*[:：]\s*(.+)$/i;
const dateLabel = /(?:報告日期|發布日期|發行日期|研究日期|Report Date|Publication Date|Date of Report)\s*[:：]?/i;
const genericTitle = /^(?:Microsoft (?:Word|PowerPoint)|PowerPoint Presentation|Document\d*|untitled|無標題|PDF Document)/i;

function calendarDate(year, month, day) {
  year = Number(year); month = Number(month); day = Number(day);
  if (year >= 1 && year <= 300) year += 1911;
  if (year < 1990 || year > 2100) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) return null;
  return `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
}

function datesIn(text) {
  const result = [];
  for (const match of text.matchAll(/(?<!\d)(\d{3,4})\s*(?:年|[-/.])\s*(\d{1,2})\s*(?:月|[-/.])\s*(\d{1,2})(?:\s*日)?(?!\d)/g)) {
    const value = calendarDate(match[1], match[2], match[3]);
    if (value) result.push(value);
  }
  const names = MONTHS.map(value => `${value}|${value.slice(0,3)}`).join('|');
  for (const match of text.matchAll(new RegExp(`\\b(${names})\\s+(\\d{1,2}),?\\s+(\\d{4})\\b`, 'gi'))) {
    const month = MONTHS.findIndex(value => value.startsWith(match[1].toLowerCase())) + 1;
    const value = calendarDate(match[3], month, match[2]);
    if (value) result.push(value);
  }
  for (const match of text.matchAll(new RegExp(`\\b(\\d{1,2})\\s+(${names})\\s+(\\d{4})\\b`, 'gi'))) {
    const month = MONTHS.findIndex(value => value.startsWith(match[2].toLowerCase())) + 1;
    const value = calendarDate(match[3], month, match[1]);
    if (value) result.push(value);
  }
  return unique(result);
}

function stockCandidates(row) {
  const result = [];
  const label = /^(?:標的(?:代號)?|股票代號|證券代號|Stock Code|Ticker)\s*[:：]\s*(.+)$/i.exec(row.text);
  if (label) {
    const direct = /^(\d{4,6}[A-Z]?)(?![\dA-Z])(?:\s*(?:\.TW|TT))?(?:\s+(.+))?$/i.exec(label[1]);
    if (direct) result.push({ code: direct[1].toUpperCase(), name: clean(direct[2] ?? ''), row, primary: true });
  }
  const re = /([\p{L}][\p{L}\p{N} &.\-]{1,40})\s*\(\s*(\d{4,6}[A-Z]?)(?:[ .]*(?:TW|TT))?\s*\)/gu;
  for (const match of row.text.matchAll(re)) result.push({ code: match[2].toUpperCase(), name: clean(match[1]), row, primary: !!label });
  if (!result.length) {
    for (const match of row.text.matchAll(/\b(\d{4,6}[A-Z]?)[ .]+(?:TW|TT)\b/g)) result.push({ code: match[1], name: '', row, primary: !!label });
  }
  return result.filter(item => /^(?:\d{4}|00\d{2,4}[A-Z]?)$/.test(item.code));
}

export function extractFields({ pages = [], filename = '', metadataTitle = '' } = {}) {
  const rows = pages.flatMap((page, index) => (page.lines ?? []).map((line, lineIndex) => ({ text: clean(typeof line === 'string' ? line : line.text), size: Number(line?.size ?? 0), page: page.pageNumber ?? index + 1, index: lineIndex }))).filter(row => row.text);
  const header = rows.filter(row => row.page === (pages[0]?.pageNumber ?? 1)).slice(0, 25);
  const result = { fields: Object.fromEntries(FIELD_KEYS.map(key => [key, null])), warnings: [], hasText: rows.some(row => /[\p{L}\p{N}]/u.test(row.text)) };
  const labeledTitles = rows.map(row => ({ row, match: titleLabel.exec(row.text) })).filter(item => item.match);
  if (labeledTitles.length && unique(labeledTitles.map(item => item.match[1])).length === 1) {
    result.fields.title = candidate(labeledTitles[0].match[1].slice(0,200), labeledTitles[0].row);
  } else {
    const headings = header.filter(row => row.size >= 14 && row.text.length >= 3 && row.text.length <= 120 && !/證券|投顧|Securities|券商|日期|代號|@|\bTT\b|\bTW\b|^\d/i.test(row.text)).sort((a,b) => b.size - a.size);
    if (headings.length) result.fields.title = candidate(headings[0].text, headings[0], 'medium');
    else if (clean(metadataTitle) && !genericTitle.test(clean(metadataTitle))) result.fields.title = candidate(clean(metadataTitle).slice(0,200), { text: clean(metadataTitle) }, 'medium', 'PDF 標題資訊');
    else result.fields.title = candidate(clean(filename.replace(/\.pdf$/i,'')), { text: filename }, 'low', '檔名備援');
  }
  const labeledBrokers = rows.map(row => ({ row, match: /^(?:券商|研究機構|發行機構|Broker(?:age)?|Research House)\s*[:：]\s*(.+)$/i.exec(row.text) })).filter(item => item.match);
  if (unique(labeledBrokers.map(item => item.match[1])).length === 1) {
    result.fields.broker = candidate(labeledBrokers[0].match[1].slice(0,50), labeledBrokers[0].row);
  } else if (!labeledBrokers.length) {
    const broker = header.find(row => /^(?:[\p{Script=Han}]{2,18}(?:證券(?:投資顧問)?|投顧)|[A-Za-z][A-Za-z &.-]{1,40}Securities)(?:股份有限公司)?$/u.test(row.text));
    if (broker) result.fields.broker = candidate(broker.text.slice(0,50), broker, 'medium');
  } else result.warnings.push('出現多個券商名稱，請手動確認。');
  const labeledDates = rows.filter(row => dateLabel.test(row.text));
  const dateRows = labeledDates.length ? labeledDates : header.filter(row => !/股價|收盤|基準|預估|預測|財年|截至|Price|as of/i.test(row.text));
  const dateItems = dateRows.flatMap(row => datesIn(row.text).map(value => ({ row, value })));
  const distinctDates = unique(dateItems.map(item => item.value));
  if (distinctDates.length === 1) result.fields.date = candidate(distinctDates[0], dateItems.find(item => item.value === distinctDates[0]).row, labeledDates.length ? 'high' : 'medium');
  else if (distinctDates.length > 1) result.warnings.push('出現多個可能的報告日期，請手動確認。');
  else if (labeledDates.length) result.warnings.push('報告日期無法確認為有效日期，請手動填寫。');
  const stocks = rows.flatMap(stockCandidates);
  const primary = stocks.filter(item => item.primary);
  const isIndustry = /產業|industry|sector/i.test(result.fields.title?.value ?? '');
  const available = primary.length && !isIndustry ? primary : stocks;
  const codes = unique(available.map(item => item.code));
  if (codes.length === 1) {
    const stock = available.find(item => item.code === codes[0]);
    const labeledName = rows.find(row => /^(?:股票名稱|公司名稱|Stock Name|Company Name)\s*[:：]/i.test(row.text));
    const name = stock.name || (labeledName ? labeledName.text.replace(/^[^:：]+[:：]\s*/, '') : '');
    const value = [stock.code, name].filter(Boolean).join(' ').slice(0,50);
    result.fields.symbol = { ...candidate(value, stock.row, stock.primary ? 'high' : 'medium'), code: stock.code };
    if (name && labeledName && !stock.name) result.fields.symbol.evidence.text += `；${labeledName.text}`;
    result.fields.type = candidate(/^00/.test(stock.code) ? '台股 ETF' : '台股個股', stock.row, 'medium', '依辨識到的台股代號判斷');
  } else if (codes.length > 1) result.warnings.push('報告包含多個標的，未自動指定單一股票或類型。');
  if (!result.fields.type && codes.length <= 1) {
    const typeRow = rows.find(row => /^(?:類型|投資類型|Type)\s*[:：]\s*(?:台股個股|台股 ETF|ETF)\s*$/i.test(row.text));
    if (typeRow) result.fields.type = candidate(/ETF/i.test(typeRow.text) ? '台股 ETF' : '台股個股', typeRow);
  }
  if (!result.hasText) result.warnings.push('沒有可讀文字層，可能是掃描 PDF；此版尚未提供 OCR，請手動填寫。');
  return result;
}
