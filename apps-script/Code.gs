/**
 * =================================================================
 * WIP SHEET -> FIRESTORE SYNC (real-time bridge)
 * =================================================================
 * CARA PASANG:
 * 1. Buka Google Sheet "2026 OUTSTANDING SAMPLE STATUS"
 * 2. Menu Extensions > Apps Script
 * 3. Hapus isi default, paste seluruh file ini
 * 4. Di Firebase Console > Project Settings > Service Accounts >
 *    "Generate new private key" -> download file JSON
 * 5. Di Apps Script > klik ikon gerigi (Project Settings) > scroll ke
 *    "Script Properties" > tambahkan:
 *      FIREBASE_PROJECT_ID   = (project_id dari file JSON)
 *      FIREBASE_CLIENT_EMAIL = (client_email dari file JSON)
 *      FIREBASE_PRIVATE_KEY  = (private_key dari file JSON, copy PERSIS
 *                               termasuk "-----BEGIN PRIVATE KEY-----")
 * 6. Di Apps Script, jalankan sekali function `setupTrigger` (klik Run)
 *    -> akan minta izin akses, klik Allow
 * 7. Selesai. Sekarang setiap kali sheet diedit, Firestore ikut update
 *    dalam hitungan detik.
 *
 * CATATAN: baris pertama sheet HARUS berisi nama kolom (header).
 * Nama kolom akan otomatis jadi nama field di Firestore.
 * =================================================================
 */

const SHEET_NAME = "Sheet1"; // GANTI sesuai nama tab sheet WIP Bapak
const UNIQUE_ID_COLUMN = "No SMI"; // kolom yang dipakai sebagai ID unik dokumen

function setupTrigger() {
  // Hapus trigger lama biar tidak dobel
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ScriptApp.newTrigger("onEditSync")
    .forSpreadsheet(ss)
    .onEdit()
    .create();

  // Sekalian sync full sheet sekali di awal
  syncAllRows();
  Logger.log("Trigger terpasang & full sync awal selesai.");
}

/**
 * Trigger otomatis tiap ada edit di sheet manapun di file ini.
 */
function onEditSync(e) {
  const sheet = e.range.getSheet();
  if (sheet.getName() !== SHEET_NAME) return;

  const editedRow = e.range.getRow();
  if (editedRow === 1) return; // header diedit, skip

  syncSingleRow(sheet, editedRow);
}

/**
 * Sync 1 baris spesifik ke Firestore.
 */
function syncSingleRow(sheet, rowIndex) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const rowValues = sheet.getRange(rowIndex, 1, 1, sheet.getLastColumn()).getValues()[0];

  const rowObject = {};
  headers.forEach((header, i) => {
    if (!header) return;
    rowObject[normalizeKey(header)] = rowValues[i];
  });

  const idColIndex = headers.indexOf(UNIQUE_ID_COLUMN);
  const docId = idColIndex >= 0 && rowValues[idColIndex]
    ? String(rowValues[idColIndex]).trim()
    : `row_${rowIndex}`;

  if (!docId || docId === "row_" ) return;

  rowObject["_lastSynced"] = new Date().toISOString();
  rowObject["_sourceRow"] = rowIndex;

  writeToFirestore("wip_data", docId, rowObject);
}

/**
 * Full sync — dipanggil sekali waktu setup, atau manual kalau perlu re-sync total.
 */
function syncAllRows() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  const lastRow = sheet.getLastRow();
  for (let r = 2; r <= lastRow; r++) {
    syncSingleRow(sheet, r);
    Utilities.sleep(150); // hindari rate limit Firestore
  }
}

function normalizeKey(header) {
  return String(header)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

// =================================================================
// FIRESTORE REST HELPERS (pakai Service Account, tanpa library tambahan)
// =================================================================

function getAccessToken() {
  const props = PropertiesService.getScriptProperties();
  const clientEmail = props.getProperty("FIREBASE_CLIENT_EMAIL");
  const privateKey = props.getProperty("FIREBASE_PRIVATE_KEY").replace(/\\n/g, "\n");

  const header = { alg: "RS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const claimSet = {
    iss: clientEmail,
    scope: "https://www.googleapis.com/auth/datastore",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now
  };

  const encode = (obj) => Utilities.base64EncodeWebSafe(JSON.stringify(obj)).replace(/=+$/, "");
  const toSign = `${encode(header)}.${encode(claimSet)}`;
  const signatureBytes = Utilities.computeRsaSha256Signature(toSign, privateKey);
  const signature = Utilities.base64EncodeWebSafe(signatureBytes).replace(/=+$/, "");
  const jwt = `${toSign}.${signature}`;

  const response = UrlFetchApp.fetch("https://oauth2.googleapis.com/token", {
    method: "post",
    contentType: "application/x-www-form-urlencoded",
    payload: {
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt
    },
    muteHttpExceptions: true
  });

  const data = JSON.parse(response.getContentText());
  if (!data.access_token) {
    throw new Error("Gagal ambil access token: " + response.getContentText());
  }
  return data.access_token;
}

function toFirestoreValue(value) {
  if (value === null || value === undefined || value === "") return { nullValue: null };
  if (typeof value === "number") return { doubleValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  if (Object.prototype.toString.call(value) === "[object Date]") {
    return { timestampValue: value.toISOString() };
  }
  return { stringValue: String(value) };
}

function writeToFirestore(collection, docId, rowObject) {
  const props = PropertiesService.getScriptProperties();
  const projectId = props.getProperty("FIREBASE_PROJECT_ID");
  const token = getAccessToken();

  const fields = {};
  Object.keys(rowObject).forEach(key => {
    fields[key] = toFirestoreValue(rowObject[key]);
  });

  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${collection}/${encodeURIComponent(docId)}`;

  const response = UrlFetchApp.fetch(url, {
    method: "patch",
    contentType: "application/json",
    headers: { Authorization: "Bearer " + token },
    payload: JSON.stringify({ fields }),
    muteHttpExceptions: true
  });

  if (response.getResponseCode() >= 300) {
    Logger.log("Firestore write error for " + docId + ": " + response.getContentText());
  }
}
