// Delimited-text parsing + Google Sheet fetching. No dependencies.

/**
 * Guess whether pasted text is tab-delimited (copy/paste straight out of
 * Google Sheets — the common case) or comma-delimited (a downloaded .csv).
 */
export function detectDelimiter(text) {
  const firstLine = text.split(/\r\n|\n/, 1)[0] || "";
  return firstLine.includes("\t") ? "\t" : ",";
}

/** Parse RFC4180-ish delimited text into an array of row arrays. Handles quoted fields. */
export function parseCSV(text, delimiter = detectDelimiter(text)) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  const len = text.length;

  for (let i = 0; i < len; i++) {
    const c = text[i];

    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }

    if (c === '"' && field === "") {
      inQuotes = true;
    } else if (c === delimiter) {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c === "\r") {
      // skip, handled by following \n
    } else {
      field += c;
    }
  }
  // last field/row
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  // drop fully-empty trailing rows
  while (rows.length && rows[rows.length - 1].every((f) => f.trim() === "")) {
    rows.pop();
  }
  return rows;
}

/** Convert parsed CSV rows (with header row) into array of objects keyed by header. */
export function rowsToObjects(rows) {
  if (!rows.length) return { headers: [], records: [] };
  const headers = rows[0].map((h) => h.trim());
  const records = rows.slice(1)
    .filter((r) => r.some((f) => f.trim() !== ""))
    .map((r) => {
      const obj = {};
      headers.forEach((h, i) => {
        obj[h] = (r[i] ?? "").trim();
      });
      return obj;
    });
  return { headers, records };
}

/**
 * Extract { id, gid } from any Google Sheets URL the user might paste:
 *  - https://docs.google.com/spreadsheets/d/<ID>/edit#gid=<GID>
 *  - https://docs.google.com/spreadsheets/d/<ID>/edit?usp=sharing
 *  - https://docs.google.com/spreadsheets/d/<ID>/pubhtml?gid=<GID>&single=true
 */
export function parseGoogleSheetUrl(url) {
  const idMatch = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!idMatch) return null;
  const gidMatch = url.match(/[?&#]gid=(\d+)/);
  return { id: idMatch[1], gid: gidMatch ? gidMatch[1] : "0" };
}

export function sheetCsvExportUrl({ id, gid }) {
  return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${encodeURIComponent(gid || "0")}`;
}

/**
 * Fetch a public Google Sheet as CSV text. Throws a friendly Error on failure
 * (private sheet, no network, CORS, etc.) so callers can fall back to manual paste.
 */
export async function fetchGoogleSheetCsv(sheetUrl) {
  const parsed = parseGoogleSheetUrl(sheetUrl);
  if (!parsed) {
    throw new Error("That doesn't look like a Google Sheets link. Paste the full URL from your browser's address bar.");
  }
  const csvUrl = sheetCsvExportUrl(parsed);
  let res;
  try {
    res = await fetch(csvUrl, { credentials: "omit" });
  } catch (e) {
    throw new Error("Couldn't reach that sheet (network or CORS block). Make sure it's shared as \"Anyone with the link can view\", or paste the CSV data manually below.");
  }
  if (!res.ok) {
    throw new Error(`Google Sheets returned an error (${res.status}). Make sure the sheet is shared as "Anyone with the link can view", or paste the CSV data manually below.`);
  }
  const text = await res.text();
  if (/^\s*<!DOCTYPE html/i.test(text) || /accounts\.google\.com/i.test(text)) {
    throw new Error("This sheet isn't public yet. In Google Sheets, click Share → General access → \"Anyone with the link\", then try again.");
  }
  return text;
}
