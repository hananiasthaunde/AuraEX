import https from 'node:https';

let cachedToken = null;
let tokenExpiresAt = 0;
let onedriveCacheData = null;
let onedriveCacheTime = 0;

const CACHE_TTL_MS = 60 * 1000; // 1 minuto de cache em memória para leituras frequentes

export function isOneDriveConfigured() {
  return Boolean(
    process.env.MICROSOFT_CLIENT_SECRET &&
    (process.env.MICROSOFT_CLIENT_ID || '5047c43c-65f5-45fa-90a6-28ac4ceababf') &&
    (process.env.MICROSOFT_TENANT_ID || '356f8c14-cb3c-4048-80af-fb40c8a99a17')
  );
}

export async function getGraphAccessToken() {
  const tenantId = process.env.MICROSOFT_TENANT_ID || '356f8c14-cb3c-4048-80af-fb40c8a99a17';
  const clientId = process.env.MICROSOFT_CLIENT_ID || '5047c43c-65f5-45fa-90a6-28ac4ceababf';
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;

  if (!clientSecret) {
    throw new Error('MICROSOFT_CLIENT_SECRET não configurado.');
  }

  if (cachedToken && Date.now() < tokenExpiresAt - 60000) {
    return cachedToken;
  }

  const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  const bodyParams = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
    scope: 'https://graph.microsoft.com/.default'
  }).toString();

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: bodyParams
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Falha na autenticação Microsoft Graph (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  cachedToken = data.access_token;
  tokenExpiresAt = Date.now() + (data.expires_in || 3600) * 1000;
  return cachedToken;
}

export async function fetchOneDriveWorkbook() {
  if (onedriveCacheData && Date.now() - onedriveCacheTime < CACHE_TTL_MS) {
    return onedriveCacheData;
  }

  const token = await getGraphAccessToken();
  const userEmail = process.env.MICROSOFT_USER_EMAIL || 'ti@sbdc.com.br';
  const fileName = process.env.MICROSOFT_FILE_NAME || 'Mentorados Atualizada.xlsx';
  const docSourcedocId = 'C2494C51-713E-46F8-BB6D-969144B37351';

  const graphHeaders = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json'
  };

  // 1. Procurar o ficheiro no drive do utilizador
  const searchUrl = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(userEmail)}/drive/root/search(q='${encodeURIComponent(fileName)}')`;
  const searchRes = await fetch(searchUrl, { headers: graphHeaders });

  let driveId = null;
  let itemId = null;

  if (searchRes.ok) {
    const searchData = await searchRes.json();
    const match = (searchData.value || []).find(item => item.name === fileName || item.name.includes('Mentorados'));
    if (match) {
      itemId = match.id;
      driveId = match.parentReference?.driveId;
    }
  }

  // Se a pesquisa não encontrar por nome, tentar endpoint direto via ID de item ou drive root
  if (!itemId) {
    const rootItemsUrl = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(userEmail)}/drive/root/children`;
    const rootRes = await fetch(rootItemsUrl, { headers: graphHeaders });
    if (rootRes.ok) {
      const rootData = await rootRes.json();
      const match = (rootData.value || []).find(item => item.name === fileName || item.name.includes('Mentorados'));
      if (match) {
        itemId = match.id;
        driveId = match.parentReference?.driveId;
      }
    }
  }

  if (!itemId) {
    throw new Error(`Ficheiro '${fileName}' não foi encontrado no OneDrive de ${userEmail}.`);
  }

  const drivePath = driveId
    ? `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}`
    : `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(userEmail)}/drive/items/${itemId}`;

  // 2. Obter as abas (worksheets) do ficheiro Excel
  const sheetsUrl = `${drivePath}/workbook/worksheets`;
  const sheetsRes = await fetch(sheetsUrl, { headers: graphHeaders });
  if (!sheetsRes.ok) {
    const errText = await sheetsRes.text();
    throw new Error(`Erro ao obter abas do Excel via Graph (${sheetsRes.status}): ${errText}`);
  }

  const sheetsData = await sheetsRes.json();
  const worksheets = sheetsData.value || [];
  const resultSheets = [];

  // 3. Obter o usedRange de cada aba
  for (const sheet of worksheets) {
    const rangeUrl = `${drivePath}/workbook/worksheets/${encodeURIComponent(sheet.name)}/usedRange`;
    const rangeRes = await fetch(rangeUrl, { headers: graphHeaders });
    if (rangeRes.ok) {
      const rangeData = await rangeRes.json();
      const rawRows = rangeData.values || [];
      resultSheets.push({
        name: sheet.name,
        rows: rawRows
      });
    }
  }

  const workbook = {
    sheets: resultSheets,
    generatedAt: new Date().toISOString(),
    source: 'onedrive'
  };

  onedriveCacheData = workbook;
  onedriveCacheTime = Date.now();
  return workbook;
}
