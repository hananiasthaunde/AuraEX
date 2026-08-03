import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchOneDriveWorkbook, isOneDriveConfigured } from './onedrive.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STORAGE_DIR = path.join(ROOT, 'storage');
const DATA_FILE = path.join(STORAGE_DIR, 'dashboard-data.json');
const INITIAL_FILE = path.join(STORAGE_DIR, 'initial-workbook.json');
const BACKUP_FILE = path.join(STORAGE_DIR, 'dashboard-data.previous.json');

try {
  fs.mkdirSync(STORAGE_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE) && fs.existsSync(INITIAL_FILE)) fs.copyFileSync(INITIAL_FILE, DATA_FILE);
} catch (err) {
  console.warn('Inicialização em disco ignorada (ambiente Serverless/Read-only):', err.message);
}

export function validateWorkbook(data) {
  if (!data || !Array.isArray(data.sheets)) return 'Formato inválido: sheets deve ser uma lista.';
  if (data.sheets.length > 100) return 'Quantidade de planilhas acima do limite.';
  for (const sheet of data.sheets) {
    if (!sheet || typeof sheet.name !== 'string' || !Array.isArray(sheet.rows)) return 'Planilha inválida.';
    if (sheet.rows.length > 100000) return `A planilha ${sheet.name} excede o limite de linhas.`;
  }
  return null;
}

let inMemoryCache = null;

export function readWorkbook() {
  if (inMemoryCache) return inMemoryCache;
  try {
    if (fs.existsSync(DATA_FILE)) return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    if (fs.existsSync(INITIAL_FILE)) return JSON.parse(fs.readFileSync(INITIAL_FILE, 'utf8'));
  } catch (err) {
    console.warn('Erro ao ler ficheiro de dados do disco:', err.message);
  }
  return { sheets: [], generatedAt: new Date().toISOString() };
}

export async function readWorkbookAsync() {
  if (isOneDriveConfigured()) {
    try {
      const data = await fetchOneDriveWorkbook();
      if (data && Array.isArray(data.sheets) && data.sheets.length > 0) {
        inMemoryCache = data;
        return data;
      }
    } catch (err) {
      console.warn('[AuraEX OneDrive] Erro ao carregar dados via Microsoft Graph (usando fallback local):', err.message);
    }
  }
  return readWorkbook();
}

export function writeWorkbook(data) {
  const error = validateWorkbook(data);
  if (error) throw new Error(error);
  const normalized = { ...data, generatedAt: new Date().toISOString() };
  inMemoryCache = normalized;
  try {
    if (fs.existsSync(DATA_FILE)) fs.copyFileSync(DATA_FILE, BACKUP_FILE);
    const temp = `${DATA_FILE}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(normalized, null, 2), 'utf8');
    fs.renameSync(temp, DATA_FILE);
  } catch (err) {
    console.warn('Persistência em disco ignorada (ambiente Serverless/Read-only):', err.message);
  }
  return normalized;
}

function normalized(value) {
  return String(value ?? '').trim().toLowerCase();
}

function isComplete(value) {
  const v = normalized(value);
  return ['ok', 'okay', 'sim', 'concluído', 'concluido', 'concluída', 'concluida', 'feito', 'realizada', 'realizado', 'encerrado', 'finalizado'].some(item => v === item || v.includes(item));
}

function getSheet(workbook, sheetName) {
  if (sheetName) {
    const found = workbook.sheets.find(sheet => normalized(sheet.name) === normalized(sheetName));
    if (found) return found;
  }
  return workbook.sheets.find(sheet => sheet.name === '2026') || workbook.sheets[0];
}

function layoutFor(sheet) {
  return sheet.layout || { dataStart: 1, nameCol: 1, emailCol: 2, phoneCol: 3, companyCol: 4, sessionCols: [] };
}

function cell(row, col) {
  if (!Array.isArray(row) || col === undefined || col === null) return '';
  return row[col] ?? '';
}

function setCell(row, col, value) {
  if (col === undefined || col === null) return;
  while (row.length <= col) row.push(null);
  row[col] = value === '' ? null : value;
}

function menteeFromRow(sheet, row, rowIndex) {
  const layout = layoutFor(sheet);
  const sessions = (layout.sessionCols || []).map((col, index) => ({
    number: index + 1,
    label: layout.sessionLabels?.[index] || `Sessão ${index + 1}`,
    value: cell(row, col),
    completed: isComplete(cell(row, col))
  }));
  const completed = sessions.filter(session => session.completed).length;
  const total = sessions.length;
  return {
    sheet: sheet.name,
    rowIndex,
    id: cell(row, layout.idCol),
    name: String(cell(row, layout.nameCol)).trim(),
    email: String(cell(row, layout.emailCol)).trim(),
    phone: String(cell(row, layout.phoneCol)).trim(),
    company: String(cell(row, layout.companyCol)).trim(),
    previous: cell(row, layout.previousCol),
    next: cell(row, layout.nextCol),
    closure: cell(row, layout.closureCol),
    report: cell(row, layout.reportCol),
    sessions,
    progress: total ? Math.round((completed / total) * 100) : 0,
    completedSessions: completed,
    totalSessions: total
  };
}

export function listMentees({ sheetName, search = '', company = '', status = '', limit = 200, offset = 0 } = {}) {
  const workbook = readWorkbook();
  const sheet = getSheet(workbook, sheetName);
  if (!sheet) return { sheet: null, total: 0, items: [] };
  const layout = layoutFor(sheet);
  const query = normalized(search);
  let items = [];
  for (let rowIndex = layout.dataStart ?? 1; rowIndex < sheet.rows.length; rowIndex += 1) {
    const item = menteeFromRow(sheet, sheet.rows[rowIndex], rowIndex);
    if (!item.name) continue;
    const haystack = normalized([item.name, item.email, item.phone, item.company].join(' '));
    if (query && !haystack.includes(query)) continue;
    if (company && normalized(item.company) !== normalized(company)) continue;
    if (status === 'completed' && item.progress < 100) continue;
    if (status === 'in-progress' && (item.progress === 0 || item.progress === 100)) continue;
    if (status === 'not-started' && item.progress !== 0) continue;
    items.push(item);
  }
  const total = items.length;
  items = items.slice(Math.max(0, Number(offset) || 0), Math.max(0, Number(offset) || 0) + Math.min(Math.max(Number(limit) || 200, 1), 1000));
  return { sheet: sheet.name, total, items };
}

export function getMentee({ sheetName, name, email, rowIndex } = {}) {
  const result = listMentees({ sheetName, limit: 100000 });
  let item = null;
  if (rowIndex !== undefined && rowIndex !== null) item = result.items.find(entry => entry.rowIndex === Number(rowIndex));
  else if (email) item = result.items.find(entry => normalized(entry.email) === normalized(email));
  else if (name) item = result.items.find(entry => normalized(entry.name) === normalized(name)) || result.items.find(entry => normalized(entry.name).includes(normalized(name)));
  return item;
}

export function updateSession({ sheetName, name, email, rowIndex, sessionNumber, value }) {
  const workbook = readWorkbook();
  const sheet = getSheet(workbook, sheetName);
  if (!sheet) throw new Error('Planilha não encontrada.');
  const layout = layoutFor(sheet);
  const candidates = [];
  for (let index = layout.dataStart ?? 1; index < sheet.rows.length; index += 1) {
    const row = sheet.rows[index];
    const itemName = normalized(cell(row, layout.nameCol));
    const itemEmail = normalized(cell(row, layout.emailCol));
    if (rowIndex !== undefined && Number(rowIndex) === index) candidates.push(index);
    else if (email && itemEmail === normalized(email)) candidates.push(index);
    else if (name && itemName === normalized(name)) candidates.push(index);
  }
  if (candidates.length !== 1) throw new Error(candidates.length ? 'Mais de um mentorado corresponde à pesquisa. Use e-mail ou rowIndex.' : 'Mentorado não encontrado.');
  const sessionIndex = Number(sessionNumber) - 1;
  const col = layout.sessionCols?.[sessionIndex];
  if (col === undefined) throw new Error('Número de sessão inválido.');
  setCell(sheet.rows[candidates[0]], col, String(value ?? '').trim());
  writeWorkbook(workbook);
  return menteeFromRow(sheet, sheet.rows[candidates[0]], candidates[0]);
}

export function addMentee({ sheetName, name, email = '', phone = '', company = '' }) {
  if (!String(name || '').trim()) throw new Error('O nome é obrigatório.');
  const workbook = readWorkbook();
  const sheet = getSheet(workbook, sheetName);
  if (!sheet) throw new Error('Planilha não encontrada.');
  const layout = layoutFor(sheet);
  const duplicate = listMentees({ sheetName: sheet.name, limit: 100000 }).items.find(item => email && normalized(item.email) === normalized(email));
  if (duplicate) throw new Error('Já existe um mentorado com este e-mail.');
  const width = Math.max(sheet.maxColumns || 0, ...Object.values(layout).flat().filter(Number.isInteger), 20) + 1;
  const row = Array(width).fill(null);
  const ids = sheet.rows.slice(layout.dataStart ?? 1).map(item => Number(cell(item, layout.idCol))).filter(Number.isFinite);
  setCell(row, layout.idCol, (ids.length ? Math.max(...ids) : 0) + 1);
  setCell(row, layout.nameCol, String(name).trim());
  setCell(row, layout.emailCol, String(email).trim());
  setCell(row, layout.phoneCol, String(phone).trim());
  setCell(row, layout.companyCol, String(company).trim());
  sheet.rows.push(row);
  writeWorkbook(workbook);
  return menteeFromRow(sheet, row, sheet.rows.length - 1);
}

export function getSummary({ sheetName } = {}) {
  const { sheet, items } = listMentees({ sheetName, limit: 100000 });
  const companies = new Map();
  let completed = 0;
  let progressTotal = 0;
  for (const item of items) {
    if (item.progress === 100) completed += 1;
    progressTotal += item.progress;
    const key = item.company || 'Sem empresa';
    companies.set(key, (companies.get(key) || 0) + 1);
  }
  return {
    sheet,
    totalMentees: items.length,
    completedMentees: completed,
    averageProgress: items.length ? Math.round(progressTotal / items.length) : 0,
    companies: [...companies.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count)
  };
}

function parseDateText(value) {
  const text = String(value ?? '').trim();
  const match = text.match(/\b(\d{1,2})[\/.\-](\d{1,2})(?:[\/.\-](\d{2,4}))?\b/);
  if (!match) return null;
  let year = match[3] ? Number(match[3]) : new Date().getFullYear();
  if (year < 100) year += 2000;
  const date = new Date(year, Number(match[2]) - 1, Number(match[1]));
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

export function listAgenda({ sheetName, search = '', limit = 500 } = {}) {
  const { items, sheet } = listMentees({ sheetName, limit: 100000 });
  const query = normalized(search);
  const agenda = [];
  for (const mentee of items) {
    for (const session of mentee.sessions) {
      const value = String(session.value ?? '').trim();
      if (!value || session.completed) continue;
      const row = {
        sheet,
        mentee: mentee.name,
        email: mentee.email,
        company: mentee.company,
        session: session.label,
        value,
        date: parseDateText(value),
        status: parseDateText(value) ? 'scheduled' : 'pending'
      };
      if (!query || normalized(Object.values(row).join(' ')).includes(query)) agenda.push(row);
    }
    for (const [label, value] of [['Próximo passo', mentee.next], ['Encerramento', mentee.closure], ['Relatório', mentee.report]]) {
      const text = String(value ?? '').trim();
      if (!text || isComplete(text)) continue;
      const row = { sheet, mentee: mentee.name, email: mentee.email, company: mentee.company, session: label, value: text, date: parseDateText(text), status: parseDateText(text) ? 'scheduled' : 'pending' };
      if (!query || normalized(Object.values(row).join(' ')).includes(query)) agenda.push(row);
    }
  }
  agenda.sort((a, b) => String(a.date || '9999').localeCompare(String(b.date || '9999')) || a.mentee.localeCompare(b.mentee));
  return { sheet, total: agenda.length, items: agenda.slice(0, Math.min(Math.max(Number(limit) || 500, 1), 2000)) };
}
