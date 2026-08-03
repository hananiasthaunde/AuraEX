(function (global) {
  'use strict';

  const NS_MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';

  function xmlEscape(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;')
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  }

  function columnName(index) {
    let n = index + 1;
    let name = '';
    while (n > 0) {
      const rem = (n - 1) % 26;
      name = String.fromCharCode(65 + rem) + name;
      n = Math.floor((n - 1) / 26);
    }
    return name;
  }

  function columnIndex(ref) {
    const letters = String(ref || '').replace(/[^A-Z]/gi, '').toUpperCase();
    let value = 0;
    for (const ch of letters) value = value * 26 + ch.charCodeAt(0) - 64;
    return Math.max(0, value - 1);
  }

  function excelSerialToDate(serial) {
    const utcDays = Math.floor(serial - 25569);
    const utcValue = utcDays * 86400;
    const dateInfo = new Date(utcValue * 1000);
    const fractionalDay = serial - Math.floor(serial) + 0.0000001;
    let totalSeconds = Math.floor(86400 * fractionalDay);
    const seconds = totalSeconds % 60;
    totalSeconds -= seconds;
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor(totalSeconds / 60) % 60;
    dateInfo.setUTCHours(hours, minutes, seconds, 0);
    const dd = String(dateInfo.getUTCDate()).padStart(2, '0');
    const mm = String(dateInfo.getUTCMonth() + 1).padStart(2, '0');
    const yyyy = dateInfo.getUTCFullYear();
    if (hours || minutes || seconds) return `${dd}/${mm}/${yyyy} ${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    return `${dd}/${mm}/${yyyy}`;
  }

  function parseXml(text) {
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error('O Excel contém XML inválido.');
    return doc;
  }

  function getAllText(node) {
    if (!node) return '';
    return Array.from(node.getElementsByTagName('t')).map(t => t.textContent || '').join('');
  }

  async function readXlsx(file) {
    if (!global.JSZip) throw new Error('Biblioteca de Excel não carregada.');
    const zip = await global.JSZip.loadAsync(file);
    const workbookFile = zip.file('xl/workbook.xml');
    const relsFile = zip.file('xl/_rels/workbook.xml.rels');
    if (!workbookFile || !relsFile) throw new Error('Este ficheiro não parece ser um Excel .xlsx válido.');

    const [workbookXml, relsXml] = await Promise.all([workbookFile.async('string'), relsFile.async('string')]);
    const workbookDoc = parseXml(workbookXml);
    const relsDoc = parseXml(relsXml);
    const relMap = {};
    Array.from(relsDoc.getElementsByTagName('Relationship')).forEach(rel => { relMap[rel.getAttribute('Id')] = rel.getAttribute('Target'); });

    let sharedStrings = [];
    const sharedFile = zip.file('xl/sharedStrings.xml');
    if (sharedFile) {
      const sharedDoc = parseXml(await sharedFile.async('string'));
      sharedStrings = Array.from(sharedDoc.getElementsByTagName('si')).map(getAllText);
    }

    const dateStyleIndexes = new Set();
    const stylesFile = zip.file('xl/styles.xml');
    if (stylesFile) {
      const stylesDoc = parseXml(await stylesFile.async('string'));
      const customFormats = {};
      Array.from(stylesDoc.getElementsByTagName('numFmt')).forEach(fmt => { customFormats[Number(fmt.getAttribute('numFmtId'))] = fmt.getAttribute('formatCode') || ''; });
      const builtInDateIds = new Set([14,15,16,17,18,19,20,21,22,27,30,36,45,46,47,50,57]);
      const cellXfs = stylesDoc.getElementsByTagName('cellXfs')[0];
      if (cellXfs) {
        Array.from(cellXfs.getElementsByTagName('xf')).forEach((xf, index) => {
          const id = Number(xf.getAttribute('numFmtId') || 0);
          const fmt = (customFormats[id] || '').toLowerCase().replace(/\[[^\]]+\]/g, '');
          const looksLikeDate = builtInDateIds.has(id) || (/[dy]/.test(fmt) && /[m]/.test(fmt)) || /h+:?m+/.test(fmt);
          if (looksLikeDate) dateStyleIndexes.add(index);
        });
      }
    }

    const sheetNodes = Array.from(workbookDoc.getElementsByTagName('sheet'));
    const sheets = [];
    for (const sheetNode of sheetNodes) {
      const name = sheetNode.getAttribute('name') || 'Planilha';
      const relId = sheetNode.getAttribute('r:id') || sheetNode.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
      let target = relMap[relId];
      if (!target) continue;
      target = target.replace(/^\//, '');
      if (!target.startsWith('xl/')) target = 'xl/' + target.replace(/^\.\//, '');
      const sheetFile = zip.file(target);
      if (!sheetFile) continue;
      const sheetDoc = parseXml(await sheetFile.async('string'));
      const rows = [];
      let maxColumns = 0;
      Array.from(sheetDoc.getElementsByTagName('row')).forEach((rowNode, rowPosition) => {
        const explicitRow = Number(rowNode.getAttribute('r') || rowPosition + 1) - 1;
        const row = rows[explicitRow] || [];
        Array.from(rowNode.getElementsByTagName('c')).forEach(cell => {
          const ref = cell.getAttribute('r') || '';
          const col = columnIndex(ref);
          const type = cell.getAttribute('t') || '';
          const styleIndex = Number(cell.getAttribute('s') || -1);
          const vNode = cell.getElementsByTagName('v')[0];
          let value = '';
          if (type === 'inlineStr') value = getAllText(cell);
          else if (type === 's') value = sharedStrings[Number(vNode?.textContent || 0)] ?? '';
          else if (type === 'b') value = (vNode?.textContent || '0') === '1' ? 'TRUE' : 'FALSE';
          else if (type === 'str' || type === 'e') value = vNode?.textContent || '';
          else if (vNode) {
            const raw = vNode.textContent || '';
            const number = Number(raw);
            if (raw !== '' && Number.isFinite(number)) value = dateStyleIndexes.has(styleIndex) ? excelSerialToDate(number) : number;
            else value = raw;
          }
          row[col] = value;
          maxColumns = Math.max(maxColumns, col + 1);
        });
        rows[explicitRow] = row;
      });
      for (let index = 0; index < rows.length; index += 1) if (!rows[index]) rows[index] = [];
      sheets.push({ name, rows, maxColumns, layout: inferLayout(name, rows) });
    }
    return { workbookName: file.name || 'dados-importados.xlsx', generatedAt: new Date().toISOString(), sheets };
  }

  function findHeaderRow(rows, values) {
    const targets = values.map(value => value.toLowerCase());
    for (let index = 0; index < Math.min(rows.length, 10); index += 1) {
      const normalized = (rows[index] || []).map(value => String(value ?? '').trim().toLowerCase());
      if (targets.some(target => normalized.includes(target))) return index;
    }
    return 0;
  }

  function inferLayout(name, rows) {
    const lowerName = String(name).toLowerCase();
    if (lowerName.includes('(2)') && rows?.[1]?.some(value => String(value).toLowerCase() === 'e-mail')) {
      return { headerRows: 3, dataStart: 3, groupCol: 0, idCol: 1, nameCol: 2, emailCol: 3, phoneCol: 4, companyCol: 5, previousCol: 6, observationCol: 7, nextCol: 8, sessionCols: [9,10,11,12,13,14,15,16,17,18,19,20], sessionLabels: Array.from({ length: 12 }, (_, index) => `Sessão ${index + 1}`), agendaCol: 21, closureCol: 22, reportCol: 23 };
    }
    const headerIndex = findHeaderRow(rows, ['mentorados', 'mentorado']);
    const header = (rows[headerIndex] || []).map(value => String(value ?? '').trim().toLowerCase());
    const find = (...names) => {
      for (const namePart of names) {
        const index = header.findIndex(item => item === namePart || String(item || '').includes(namePart));
        if (index >= 0) return index;
      }
      return undefined;
    };
    const nameCol = find('mentorados', 'mentorado', 'nome');
    const emailCol = find('e-mail', 'email');
    const phoneCol = find('celular', 'telefone');
    const companyCol = find('empresa');
    const closureCol = find('encerramento');
    const reportCol = find('relatório', 'relatorio');
    const partialCol = find('av. parcial', 'avaliação parcial');
    const previousCol = find('anterior');
    const observationCol = find('obs', 'observação', 'observacao');
    const nextCol = find('proxima', 'próxima');
    const agendaCol = find('agenda');
    const sessionCols = [];
    const sessionLabels = [];
    header.forEach((item, index) => {
      if (/sess[aã]o\s*\d+/.test(item)) {
        sessionCols.push(index);
        sessionLabels.push((rows[headerIndex] || [])[index] || `Sessão ${sessionCols.length}`);
      }
    });
    const baseName = nameCol ?? 1;
    return { headerRows: headerIndex + 1, dataStart: headerIndex + 1, idCol: Math.max(0, baseName - 1), nameCol: baseName, emailCol, phoneCol, companyCol, previousCol, observationCol, nextCol, sessionCols, sessionLabels, partialCol, agendaCol, closureCol, reportCol };
  }

  function valueAt(row, col) {
    if (col === undefined || col === null || !Array.isArray(row)) return '';
    return row[col] ?? '';
  }

  function normalized(value) {
    return String(value ?? '').trim().toLowerCase();
  }

  function isCompleteValue(value) {
    const v = normalized(value);
    return ['ok','okay','sim','concluído','concluido','concluída','concluida','feito','realizada','realizado','encerrou','encerrado','encerramento','finalizado','finalizada'].includes(v);
  }

  function isClosureComplete(value) {
    const v = normalized(value);
    return isCompleteValue(v) || v.includes('encerrad') || v.includes('finaliz');
  }

  function recordsForSheet(sheet) {
    if (!sheet) return [];
    const layout = sheet.layout || inferLayout(sheet.name, sheet.rows || []);
    const records = [];
    for (let rowIndex = Number(layout.dataStart || 0); rowIndex < (sheet.rows || []).length; rowIndex += 1) {
      const row = sheet.rows[rowIndex] || [];
      const name = String(valueAt(row, layout.nameCol)).trim();
      if (!name) continue;
      const sessions = (layout.sessionCols || []).map(col => valueAt(row, col));
      const completed = sessions.filter(isCompleteValue).length;
      const total = sessions.length || 12;
      let nextStep = valueAt(row, layout.nextCol);
      let nextSource = nextStep ? 'Próxima data' : '';
      if (!nextStep) {
        const index = sessions.findIndex(value => value && !isCompleteValue(value));
        if (index >= 0) {
          nextStep = sessions[index];
          nextSource = layout.sessionLabels?.[index] || `Sessão ${index + 1}`;
        }
      }
      if (!nextStep && valueAt(row, layout.agendaCol)) {
        nextStep = valueAt(row, layout.agendaCol);
        nextSource = 'Agenda';
      }
      const closure = valueAt(row, layout.closureCol);
      const status = ((sessions.length && completed >= sessions.length) || isClosureComplete(closure)) ? 'Concluído' : (completed > 0 || nextStep ? 'Em andamento' : 'Não iniciado');
      records.push({
        rowIndex,
        id: valueAt(row, layout.idCol) || rowIndex,
        name,
        email: String(valueAt(row, layout.emailCol)).trim(),
        phone: String(valueAt(row, layout.phoneCol)).trim(),
        company: String(valueAt(row, layout.companyCol)).trim() || 'Sem empresa',
        sessions,
        completed,
        total,
        progress: total ? completed / total : 0,
        nextStep: String(nextStep || ''),
        nextSource,
        previous: valueAt(row, layout.previousCol),
        observation: valueAt(row, layout.observationCol),
        partial: valueAt(row, layout.partialCol),
        agenda: valueAt(row, layout.agendaCol),
        closure,
        report: valueAt(row, layout.reportCol),
        status,
        row
      });
    }
    return records;
  }

  function agendaItems(sheet, records) {
    const layout = sheet.layout || inferLayout(sheet.name, sheet.rows || []);
    const items = [];
    records.forEach(record => {
      const seen = new Set();
      const push = (source, raw) => {
        const value = String(raw ?? '').trim();
        if (!value || isCompleteValue(value)) return;
        const key = `${source}|${value}`;
        if (seen.has(key)) return;
        seen.add(key);
        items.push({ name: record.name, company: record.company, source, value, status: /\d{1,2}[\/.-]\d{1,2}/.test(value) ? 'Agendada' : 'Pendência' });
      };
      push('Próxima data', valueAt(record.row, layout.nextCol));
      (layout.sessionCols || []).forEach((col, index) => push(layout.sessionLabels?.[index] || `Sessão ${index + 1}`, valueAt(record.row, col)));
      push('Agenda', valueAt(record.row, layout.agendaCol));
    });
    return items;
  }

  function cell(value, style = 0) {
    return { value, style };
  }

  function styleForStatus(value) {
    const text = normalized(value);
    if (isCompleteValue(text)) return 8;
    if (/\d{1,2}[\/.-]\d{1,2}/.test(text)) return 15;
    if (text) return 9;
    return 6;
  }

  function statusStyle(status) {
    if (status === 'Concluído') return 8;
    if (status === 'Em andamento') return 9;
    return 10;
  }

  function groupCompanies(records) {
    const map = new Map();
    records.forEach(record => {
      if (!map.has(record.company)) map.set(record.company, []);
      map.get(record.company).push(record);
    });
    return [...map.entries()].map(([name, list]) => ({
      name,
      count: list.length,
      average: list.length ? list.reduce((sum, record) => sum + record.progress, 0) / list.length : 0,
      completed: list.filter(record => record.status === 'Concluído').length,
      inProgress: list.filter(record => record.status === 'Em andamento').length,
      notStarted: list.filter(record => record.status === 'Não iniciado').length
    })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'pt'));
  }

  function buildBeautifulSheets(workbook) {
    const usedNames = new Set();
    return (workbook.sheets || []).map(sheet => {
      const name = uniqueSheetName(sheet.name || 'Planilha', usedNames);
      const headerRows = Math.max(1, Number(sheet.layout?.headerRows || 1));
      const rows = (sheet.rows || []).map((row, rowIndex) => (row || []).map((value, colIndex) => {
        const valStr = String(value ?? '').trim().toLowerCase();
        let style = rowIndex < headerRows ? 4 : (rowIndex % 2 ? 7 : 6);
        if (rowIndex >= headerRows && ['ok', 'concluído', 'concluido', 'concluída', 'concluida'].includes(valStr)) style = 8;
        return cell(value, style);
      }));
      const maxCols = Math.max(Number(sheet.maxColumns || 0), 1, ...rows.map(row => row.length));
      return {
        name,
        rows,
        widths: estimateWidths(sheet.rows || [], maxCols),
        freezeRows: headerRows,
        freezeCols: 2,
        autoFilter: rows.length ? `A${headerRows}:${columnName(maxCols - 1)}${rows.length}` : undefined,
        landscape: true
      };
    });
  }

  function buildRawSheets(workbook) {
    const usedNames = new Set();
    return (workbook.sheets || []).map(sheet => {
      const name = uniqueSheetName(sheet.name || 'Planilha', usedNames);
      const headerRows = Math.max(1, Number(sheet.layout?.headerRows || 1));
      const rows = (sheet.rows || []).map((row, rowIndex) => (row || []).map(value => cell(value, rowIndex < headerRows ? 4 : (rowIndex % 2 ? 7 : 6))));
      const maxCols = Math.max(Number(sheet.maxColumns || 0), 1, ...rows.map(row => row.length));
      return { name, rows, widths: estimateWidths(sheet.rows || [], maxCols), freezeRows: headerRows, autoFilter: rows.length ? `A${headerRows}:${columnName(maxCols - 1)}${rows.length}` : undefined, landscape: true };
    });
  }

  function estimateWidths(rows, maxCols) {
    return Array.from({ length: maxCols }, (_, col) => {
      let max = 8;
      for (let row = 0; row < Math.min(rows.length, 120); row += 1) max = Math.max(max, String(rows[row]?.[col] ?? '').length);
      return Math.min(38, Math.max(10, max + 2));
    });
  }

  function uniqueSheetName(input, used) {
    const clean = String(input || 'Planilha').replace(/[\\/?*\[\]:]/g, ' ').replace(/\s+/g, ' ').trim() || 'Planilha';
    let candidate = clean.slice(0, 31);
    let suffix = 2;
    while (used.has(candidate)) {
      const ending = ` ${suffix}`;
      candidate = clean.slice(0, 31 - ending.length) + ending;
      suffix += 1;
    }
    used.add(candidate);
    return candidate;
  }

  function stylesXml() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="${NS_MAIN}">
  <fonts count="6">
    <font><sz val="11"/><color rgb="FF303136"/><name val="Calibri"/><family val="2"/></font>
    <font><b/><sz val="20"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>
    <font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>
    <font><b/><sz val="11"/><color rgb="FF006100"/><name val="Calibri"/><family val="2"/></font>
    <font><b/><sz val="24"/><color rgb="FFFF5A1F"/><name val="Calibri"/><family val="2"/></font>
    <font><sz val="10"/><color rgb="FF86878D"/><name val="Calibri"/><family val="2"/></font>
  </fonts>
  <fills count="10">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFFF5A1F"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF5E5F64"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFFFF0E9"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFF7F7F8"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFC6EFCE"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFFFF5DF"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFFFF0F0"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFEEF4FF"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="3">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border><left/><right/><top/><bottom style="thin"><color rgb="FFE7E7EA"/></bottom><diagonal/></border>
    <border><left style="thin"><color rgb="FFE2E2E5"/></left><right style="thin"><color rgb="FFE2E2E5"/></right><top style="thin"><color rgb="FFE2E2E5"/></top><bottom style="thin"><color rgb="FFE2E2E5"/></bottom><diagonal/></border>
  </borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="17">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" horizontal="left"/></xf>
    <xf numFmtId="0" fontId="5" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="center"/></xf>
    <xf numFmtId="0" fontId="2" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" horizontal="left"/></xf>
    <xf numFmtId="0" fontId="2" fillId="2" borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" horizontal="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="3" fillId="4" borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="0" fillId="5" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="3" fillId="6" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" horizontal="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="0" fillId="7" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="0" fillId="8" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" horizontal="center" wrapText="1"/></xf>
    <xf numFmtId="9" fontId="3" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" horizontal="center"/></xf>
    <xf numFmtId="0" fontId="5" fillId="4" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" horizontal="center"/></xf>
    <xf numFmtId="0" fontId="4" fillId="4" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" horizontal="center"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="center" horizontal="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="0" fillId="9" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" horizontal="center" wrapText="1"/></xf>
    <xf numFmtId="9" fontId="4" fillId="4" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" horizontal="center"/></xf>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
  <dxfs count="0"/>
  <tableStyles count="0" defaultTableStyle="TableStyleMedium2" defaultPivotStyle="PivotStyleLight16"/>
</styleSheet>`;
  }

  function cellXml(cellValue, ref) {
    const descriptor = cellValue && typeof cellValue === 'object' && Object.prototype.hasOwnProperty.call(cellValue, 'value') ? cellValue : { value: cellValue, style: 0 };
    const value = descriptor.value;
    const style = Number(descriptor.style || 0);
    const styleAttr = style ? ` s="${style}"` : '';
    if (value === null || value === undefined || value === '') return '';
    if (typeof value === 'number' && Number.isFinite(value)) return `<c r="${ref}"${styleAttr}><v>${value}</v></c>`;
    if (typeof value === 'boolean') return `<c r="${ref}" t="b"${styleAttr}><v>${value ? 1 : 0}</v></c>`;
    return `<c r="${ref}" t="inlineStr"${styleAttr}><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`;
  }

  function worksheetXml(sheet) {
    const rows = Array.isArray(sheet.rows) ? sheet.rows : [];
    const maxCol = Math.max(1, ...rows.map(row => Array.isArray(row) ? row.length : 0), Array.isArray(sheet.widths) ? sheet.widths.length : 0);
    const maxRow = Math.max(1, rows.length);
    const lastRef = `${columnName(maxCol - 1)}${maxRow}`;
    const widths = (sheet.widths || []).map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${Number(width) || 12}" customWidth="1"/>`).join('');
    const colsXml = widths ? `<cols>${widths}</cols>` : '';
    const freezeRows = Number(sheet.freezeRows || 0);
    const freezeCols = Number(sheet.freezeCols || 0);
    let pane = '';
    if (freezeRows || freezeCols) {
      const attrs = [];
      if (freezeCols) attrs.push(`xSplit="${freezeCols}"`);
      if (freezeRows) attrs.push(`ySplit="${freezeRows}"`);
      attrs.push(`topLeftCell="${columnName(freezeCols)}${freezeRows + 1}"`);
      attrs.push(`activePane="${freezeCols && freezeRows ? 'bottomRight' : freezeCols ? 'topRight' : 'bottomLeft'}"`);
      attrs.push('state="frozen"');
      pane = `<pane ${attrs.join(' ')}/>`;
    }
    const rowHeights = sheet.rowHeights || {};
    let body = '';
    rows.forEach((row, rowIndex) => {
      const cells = (row || []).map((value, colIndex) => cellXml(value, `${columnName(colIndex)}${rowIndex + 1}`)).join('');
      const height = rowHeights[rowIndex + 1] ? ` ht="${rowHeights[rowIndex + 1]}" customHeight="1"` : '';
      if (cells || height) body += `<row r="${rowIndex + 1}"${height}>${cells}</row>`;
    });
    const merges = (sheet.merges || []).length ? `<mergeCells count="${sheet.merges.length}">${sheet.merges.map(ref => `<mergeCell ref="${ref}"/>`).join('')}</mergeCells>` : '';
    const autoFilter = sheet.autoFilter ? `<autoFilter ref="${sheet.autoFilter}"/>` : '';
    const landscape = sheet.landscape ? ' orientation="landscape"' : '';
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="${NS_MAIN}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>
  <dimension ref="A1:${lastRef}"/>
  <sheetViews><sheetView workbookViewId="0" showGridLines="0">${pane}</sheetView></sheetViews>
  <sheetFormatPr defaultRowHeight="18"/>
  ${colsXml}
  <sheetData>${body}</sheetData>
  ${merges}
  ${autoFilter}
  <pageMargins left="0.25" right="0.25" top="0.5" bottom="0.5" header="0.2" footer="0.2"/>
  <pageSetup paperSize="9"${landscape} fitToWidth="1" fitToHeight="0"/>
</worksheet>`;
  }

  async function writePackage(sheets, filename) {
    if (!global.JSZip) throw new Error('Biblioteca de Excel não carregada.');
    const safeSheets = sheets.length ? sheets : [{ name: 'Planilha1', rows: [] }];
    const zip = new global.JSZip();
    const overrides = safeSheets.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('');
    zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>${overrides}</Types>`);
    zip.folder('_rels').file('.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`);
    const now = new Date().toISOString();
    zip.folder('docProps').file('core.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:creator>AuraEX</dc:creator><dc:title>Relatório de Mentorias AuraEX</dc:title><cp:lastModifiedBy>AuraEX</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`);
    zip.folder('docProps').file('app.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>AuraEX</Application><AppVersion>2.0</AppVersion></Properties>`);

    const workbookSheets = safeSheets.map((sheet, index) => `<sheet name="${xmlEscape(String(sheet.name || `Planilha ${index + 1}`).slice(0, 31))}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join('');
    zip.folder('xl').file('workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="${NS_MAIN}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView xWindow="0" yWindow="0" windowWidth="24000" windowHeight="12000"/></bookViews><sheets>${workbookSheets}</sheets><calcPr calcId="191029"/></workbook>`);
    const relationships = safeSheets.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join('');
    zip.folder('xl').folder('_rels').file('workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relationships}<Relationship Id="rId${safeSheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
    zip.folder('xl').file('styles.xml', stylesXml());
    const sheetFolder = zip.folder('xl').folder('worksheets');
    safeSheets.forEach((sheet, index) => sheetFolder.file(`sheet${index + 1}.xml`, worksheetXml(sheet)));

    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
    downloadBlob(blob, filename || 'AuraEX-Mentorados.xlsx');
  }

  async function writeBeautifulXlsx(workbook, filename, activeSheetName) {
    return writePackage(buildBeautifulSheets(workbook, activeSheetName), filename || 'AuraEX-Relatorio-Mentorias.xlsx');
  }

  async function writeRawXlsx(workbook, filename) {
    return writePackage(buildRawSheets(workbook), filename || 'AuraEX-Base.xlsx');
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  global.AuraExcel = {
    readXlsx,
    inferLayout,
    writeBeautifulXlsx,
    writeRawXlsx,
    writeXlsx: writeRawXlsx,
    downloadBlob
  };
})(window);
