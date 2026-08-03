// Integração com Microsoft Graph API para leitura de ficheiros Excel no OneDrive for Business.
// Usa o endpoint /shares/ para resolver o URL de partilha do SharePoint/OneDrive,
// evitando a dependência de pesquisa por nome (que falha quando o ficheiro não está
// na raiz do drive pessoal).

let cachedToken = null;
let tokenExpiresAt = 0;
let onedriveCacheData = null;
let onedriveCacheTime = 0;

const CACHE_TTL_MS = 60 * 1000; // 1 minuto de cache em memória

// URL de partilha do ficheiro Excel no SharePoint/OneDrive (do portal)
const DEFAULT_SHARE_URL = 'https://sbdcbr-my.sharepoint.com/:x:/r/personal/ti_sbdc_com_br/_layouts/15/Doc.aspx?sourcedoc=%7BC2494C51-713E-46F8-BB6D-969144B37351%7D';

export function isOneDriveConfigured() {
  return Boolean(process.env.MICROSOFT_CLIENT_SECRET);
}

export async function getGraphAccessToken() {
  const tenantId = process.env.MICROSOFT_TENANT_ID || '356f8c14-cb3c-4048-80af-fb40c8a99a17';
  const clientId = process.env.MICROSOFT_CLIENT_ID || '5047c43c-65f5-45fa-90a6-28ac4ceababf';
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;

  if (!clientSecret) {
    throw new Error('MICROSOFT_CLIENT_SECRET não configurado.');
  }

  // Reutilizar token em cache se ainda válido (margem de 60s)
  if (cachedToken && Date.now() < tokenExpiresAt - 60000) {
    return cachedToken;
  }

  const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
    scope: 'https://graph.microsoft.com/.default'
  }).toString();

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
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

/**
 * Converte um URL de partilha do SharePoint/OneDrive no token de partilha
 * usado pelo endpoint /shares/ do Graph API.
 * Spec: https://learn.microsoft.com/en-us/graph/api/shares-get
 */
function encodeShareUrl(url) {
  const base64 = Buffer.from(url).toString('base64url');
  return 'u!' + base64;
}

/**
 * Busca o workbook do Excel diretamente do OneDrive/SharePoint via Microsoft Graph API.
 * Resolve o ficheiro pelo URL de partilha (mais fiável que pesquisa por nome).
 * Retorna o formato interno do AuraEX: { sheets: [{ name, rows }], generatedAt, source }.
 */
export async function fetchOneDriveWorkbook() {
  // Cache em memória para evitar chamadas excessivas
  if (onedriveCacheData && Date.now() - onedriveCacheTime < CACHE_TTL_MS) {
    return onedriveCacheData;
  }

  const token = await getGraphAccessToken();
  const shareUrl = process.env.MICROSOFT_SHARE_URL || DEFAULT_SHARE_URL;
  const shareToken = encodeShareUrl(shareUrl);

  const graphHeaders = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json'
  };

  // 1. Resolver o URL de partilha para obter driveId e itemId
  const resolveUrl = `https://graph.microsoft.com/v1.0/shares/${shareToken}/driveItem`;
  const resolveRes = await fetch(resolveUrl, { headers: graphHeaders });

  if (!resolveRes.ok) {
    const errText = await resolveRes.text();
    throw new Error(`Erro ao resolver URL de partilha via Graph (${resolveRes.status}): ${errText}`);
  }

  const driveItem = await resolveRes.json();
  const driveId = driveItem.parentReference?.driveId;
  const itemId = driveItem.id;

  console.log(`[AuraEX OneDrive] Ficheiro encontrado: "${driveItem.name}" (drive: ${driveId}, item: ${itemId})`);

  const basePath = `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}`;

  // 2. Obter as abas (worksheets) do ficheiro Excel
  const sheetsRes = await fetch(`${basePath}/workbook/worksheets`, { headers: graphHeaders });
  if (!sheetsRes.ok) {
    const errText = await sheetsRes.text();
    throw new Error(`Erro ao obter abas do Excel via Graph (${sheetsRes.status}): ${errText}`);
  }

  const sheetsData = await sheetsRes.json();
  const worksheets = sheetsData.value || [];
  const resultSheets = [];

  // 3. Obter o usedRange de cada aba
  for (const sheet of worksheets) {
    const rangeUrl = `${basePath}/workbook/worksheets/${encodeURIComponent(sheet.name)}/usedRange`;
    const rangeRes = await fetch(rangeUrl, { headers: graphHeaders });
    if (rangeRes.ok) {
      const rangeData = await rangeRes.json();
      const rawRows = rangeData.values || [];
      resultSheets.push({
        name: sheet.name,
        rows: rawRows
      });
      console.log(`[AuraEX OneDrive]   Aba "${sheet.name}": ${rawRows.length} linhas carregadas.`);
    } else {
      console.warn(`[AuraEX OneDrive]   Aba "${sheet.name}": falha ao ler (${rangeRes.status}).`);
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
