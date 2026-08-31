const http = require("http");
const childProcess = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const net = require("net");
const path = require("path");
const tls = require("tls");
const { DatabaseSync } = require("node:sqlite");

const root = __dirname;

function applyEnvFile(envPath) {
  if (!fs.existsSync(envPath)) return;
  for (const rawLine of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const index = line.indexOf("=");
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

function loadLocalEnv() {
  applyEnvFile(path.join(root, ".env"));
  applyEnvFile(path.join(root, "..", "hr_pulse_frontend_editable", ".env"));
}

loadLocalEnv();

const dataDir = process.env.ONBOARDING_DATA_DIR || path.join(root, "backend", "data");
const offerPath = path.join(dataDir, "offer-letter.json");
const candidateInvitePath = path.join(dataDir, "candidate-invites.json");
const dojReminderPath = path.join(dataDir, "doj-reminders.json");
const candidateInviteFallbackPath = path.join(
  process.env.LOCALAPPDATA || dataDir,
  "VayanaPulse",
  "candidate-invites.json"
);
const emailSettingsPath = path.join(dataDir, "email-settings.json");
const employeesSheetPath = process.env.ONBOARDING_EMPLOYEES_XLS || path.join(dataDir, "employees.xls");
const sqliteDbPath = process.env.ONBOARDING_SQLITE_PATH || path.join(dataDir, "vincept.db");
const hrPulseDataDir = process.env.HR_PULSE_DATA_DIR || path.join(
  process.env.USERPROFILE || root,
  "Documents",
  "Codex",
  "VayanaPulse Data"
);
const hrPulseEmployeesPath = process.env.HR_PULSE_EMPLOYEES_CSV || path.join(hrPulseDataDir, "employees.csv");
const hrPulseAdminsPath = process.env.HR_PULSE_ADMINS_CSV || path.join(hrPulseDataDir, "admins.csv");
const profilePhotosDir = path.join(path.dirname(employeesSheetPath), "profile-photos");
const laptopDocumentsRoot = process.env.ONBOARDING_STORAGE_DIR || path.join(
  process.env.USERPROFILE || root,
  "Documents",
  "Codex",
  "Onboarding Documents"
);
const companySheetsDir = path.join(dataDir, "companies");
const PORTAL_COMPANIES = [
  { id: "VNSPL", code: "VNSPL", name: "Vay Network Services Private Limited" },
  { id: "HYLO", code: "HYLO", name: "Hylobiz Challanger Private Limited" },
  { id: "VTX", code: "VTX", name: "Vayana IFSC Private Limited" },
  { id: "Rubix", code: "Rubix", name: "Rubix Data Science Private Limited" },
  { id: "VFPL", code: "VFPL", name: "Vayana Finserv Private Limited" }
];
const LEGACY_COMPANY_IDS = {
  "co-1": "VNSPL",
  "co-2": "HYLO",
  "co-3": "VTX",
  "co-4": "Rubix",
  "co-5": "VFPL"
};
const legacyDocumentsRoot = path.join(
  process.env.USERPROFILE || root,
  "Documents",
  "Codex",
  "Onboarding Portal Documents"
);
const port = Number(process.env.PORT || 5512);
const publicOrigin = String(process.env.PUBLIC_ORIGIN || process.env.INTERLACE_PUBLIC_ORIGIN || `http://127.0.0.1:${port}`).replace(/\/$/, "");
const localUrl = `${publicOrigin}/`;
const embeddedOnly = process.env.VINCEPT_EMBEDDED === "1" || process.env.VINCEPT_EMBEDDED === "true";

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".pdf": "application/pdf",
  ".svg": "image/svg+xml; charset=utf-8",
  ".xls": "application/vnd.ms-excel",
  ".json": "application/json; charset=utf-8"
};

fs.mkdirSync(laptopDocumentsRoot, { recursive: true });
fs.mkdirSync(dataDir, { recursive: true });

let sqliteDb = null;
let sqliteReady = false;

function getSqlite() {
  if (!sqliteDb) {
    sqliteDb = new DatabaseSync(sqliteDbPath);
    sqliteDb.exec("PRAGMA journal_mode = WAL;");
    sqliteDb.exec("PRAGMA synchronous = NORMAL;");
  }
  return sqliteDb;
}

function initSqliteStore() {
  if (sqliteReady) return;
  const db = getSqlite();
  db.exec(`
    CREATE TABLE IF NOT EXISTS employees_store (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      updated_at TEXT NOT NULL,
      records_json TEXT NOT NULL,
      uploads_json TEXT NOT NULL,
      reviews_json TEXT NOT NULL,
      documents_json TEXT NOT NULL DEFAULT '[]'
    );
    CREATE TABLE IF NOT EXISTS kv (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  const existing = db.prepare("SELECT id FROM employees_store WHERE id = 1").get();
  if (!existing) {
    let records = [];
    let uploadsByEmployee = {};
    let reviewsByEmployee = {};
    try {
      records = readEmployeesSheetFromExcel();
      const docs = readDocumentMetadataSheetFromExcel();
      uploadsByEmployee = docs.uploadsByEmployee || {};
      reviewsByEmployee = docs.reviewsByEmployee || {};
    } catch (error) {
      console.warn(`SQLite migrate from Excel skipped: ${error.message}`);
    }
    db.prepare(`
      INSERT INTO employees_store (id, updated_at, records_json, uploads_json, reviews_json, documents_json)
      VALUES (1, ?, ?, ?, ?, ?)
    `).run(
      new Date().toISOString(),
      JSON.stringify(records),
      JSON.stringify(uploadsByEmployee),
      JSON.stringify(reviewsByEmployee),
      "[]"
    );
    db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)").run(
      "migrated_from_excel",
      employeesSheetPath
    );
  }

  const kvSeeds = [
    ["email-settings", emailSettingsPath, null],
    ["offer-letter", offerPath, null],
    ["doj-reminders", dojReminderPath, []],
    ["candidate-invites", candidateInvitePath, []]
  ];
  kvSeeds.forEach(([key, filePath, fallback]) => {
    const row = db.prepare("SELECT key FROM kv WHERE key = ?").get(key);
    if (row) return;
    const fromFile = readJsonFileFromDisk(filePath, fallback);
    if (fromFile == null) return;
    db.prepare("INSERT INTO kv (key, value, updated_at) VALUES (?, ?, ?)").run(
      key,
      JSON.stringify(fromFile),
      new Date().toISOString()
    );
  });

  db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)").run("storage", "sqlite");
  sqliteReady = true;
  console.log(`Portal storage: SQLite -> ${sqliteDbPath}`);
}

function ensureSqliteReady() {
  if (!sqliteReady) initSqliteStore();
}

function sqliteGetKv(key, fallback = null) {
  ensureSqliteReady();
  const row = getSqlite().prepare("SELECT value FROM kv WHERE key = ?").get(key);
  if (!row) return fallback;
  try {
    return JSON.parse(row.value);
  } catch {
    return fallback;
  }
}

function sqliteSetKv(key, value) {
  ensureSqliteReady();
  getSqlite().prepare(`
    INSERT INTO kv (key, value, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(key, JSON.stringify(value), new Date().toISOString());
}

function readEmployeesStore() {
  ensureSqliteReady();
  const row = getSqlite().prepare(`
    SELECT records_json, uploads_json, reviews_json, documents_json, updated_at
    FROM employees_store WHERE id = 1
  `).get();
  if (!row) {
    return {
      records: [],
      uploadsByEmployee: {},
      reviewsByEmployee: {},
      documents: [],
      updatedAt: ""
    };
  }
  const parse = (raw, fallback) => {
    try {
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  };
  return {
    records: parse(row.records_json, []),
    uploadsByEmployee: parse(row.uploads_json, {}),
    reviewsByEmployee: parse(row.reviews_json, {}),
    documents: parse(row.documents_json, []),
    updatedAt: row.updated_at || ""
  };
}

function writeEmployeesStore(records, documentData = {}) {
  ensureSqliteReady();
  const documents = Array.isArray(documentData.documents) ? documentData.documents : [];
  const uploadsByEmployee = documentData.uploadsByEmployee || {};
  const reviewsByEmployee = documentData.reviewsByEmployee || {};
  getSqlite().prepare(`
    INSERT INTO employees_store (id, updated_at, records_json, uploads_json, reviews_json, documents_json)
    VALUES (1, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      updated_at = excluded.updated_at,
      records_json = excluded.records_json,
      uploads_json = excluded.uploads_json,
      reviews_json = excluded.reviews_json,
      documents_json = excluded.documents_json
  `).run(
    new Date().toISOString(),
    JSON.stringify(Array.isArray(records) ? records : []),
    JSON.stringify(uploadsByEmployee),
    JSON.stringify(reviewsByEmployee),
    JSON.stringify(documents)
  );
  return { records, uploadsByEmployee, reviewsByEmployee, documents };
}

function send(response, status, body, type = "application/json; charset=utf-8") {
  response.writeHead(status, {
    "Content-Type": type,
    "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    "Pragma": "no-cache",
    "Expires": "0"
  });
  response.end(body);
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) request.destroy();
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

function readBinaryBody(request, maxBytes = 25 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new Error("File exceeds the 25 MB upload limit"));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });
}

function safePathPart(value, fallback = "file") {
  const cleaned = String(value || "")
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .replace(/\.+$/g, "")
    .trim();
  return cleaned || fallback;
}

function resolveCompanyId(value) {
  const raw = String(value || "").trim();
  if (!raw || raw === "all") return raw || PORTAL_COMPANIES[0].id;
  if (LEGACY_COMPANY_IDS[raw]) return LEGACY_COMPANY_IDS[raw];
  if (PORTAL_COMPANIES.some((company) => company.id === raw)) return raw;
  const byCode = PORTAL_COMPANIES.find((company) => String(company.code || "").toLowerCase() === raw.toLowerCase());
  return byCode?.id || PORTAL_COMPANIES[0].id;
}

function companyById(companyId) {
  return PORTAL_COMPANIES.find((company) => company.id === resolveCompanyId(companyId)) || PORTAL_COMPANIES[0];
}

function companyFolderName(companyId) {
  const company = companyById(companyId);
  return safePathPart(`${company.code} - ${company.name}`, company.code || "Company");
}

function companyDocumentRoot(companyId) {
  const folder = path.join(laptopDocumentsRoot, companyFolderName(companyId));
  fs.mkdirSync(folder, { recursive: true });
  return folder;
}

function findExistingEmployeeFolder(safeEmployeeId) {
  const searchRoots = [
    laptopDocumentsRoot,
    ...PORTAL_COMPANIES.map((company) => path.join(laptopDocumentsRoot, companyFolderName(company.id)))
  ];
  for (const rootDir of searchRoots) {
    if (!fs.existsSync(rootDir)) continue;
    const existing = fs.readdirSync(rootDir, { withFileTypes: true }).find(
      (entry) => entry.isDirectory() && entry.name.endsWith(` - ${safeEmployeeId}`)
    );
    if (existing) return path.join(rootDir, existing.name);
  }
  return null;
}

function employeeDocumentFolder(employeeId, employeeName = "", companyId = "") {
  const safeEmployeeId = safePathPart(employeeId, "employee");
  const savedEmployee = readEmployeesSheet().find((employee) => employee.id === employeeId);
  const resolvedCompanyId = resolveCompanyId(companyId || savedEmployee?.companyId || PORTAL_COMPANIES[0].id);
  const companyDir = companyDocumentRoot(resolvedCompanyId);
  const safeEmployeeName = safePathPart(employeeName || savedEmployee?.name || "Candidate", "Candidate");
  const destination = path.join(companyDir, `${safeEmployeeName} - ${safeEmployeeId}`);
  const existing = findExistingEmployeeFolder(safeEmployeeId);
  if (existing && path.resolve(existing) !== path.resolve(destination)) {
    try {
      fs.mkdirSync(destination, { recursive: true });
      moveFolderContents(existing, destination);
      if (fs.existsSync(existing) && !fs.readdirSync(existing).length) fs.rmdirSync(existing);
    } catch (error) {
      console.warn(`Could not move documents into company folder: ${error.message}`);
      return existing;
    }
  }
  return destination;
}

function normalizeCandidateFolderNames() {
  for (const entry of fs.readdirSync(laptopDocumentsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith("Candidate - ")) continue;
    const sourceFolder = path.join(laptopDocumentsRoot, entry.name);
    const statusPath = path.join(sourceFolder, "Onboarding Status.txt");
    if (!fs.existsSync(statusPath)) continue;
    const statusText = fs.readFileSync(statusPath, "utf8");
    const employeeName = statusText.match(/^Employee:\s*(.+)$/mi)?.[1]?.trim();
    const employeeId = statusText.match(/^Employee ID:\s*(.+)$/mi)?.[1]?.trim();
    if (!employeeName || !employeeId) continue;
    const destinationFolder = path.join(
      laptopDocumentsRoot,
      `${safePathPart(employeeName, "Candidate")} - ${safePathPart(employeeId, "employee")}`
    );
    if (destinationFolder === sourceFolder) continue;
    if (fs.existsSync(destinationFolder)) {
      moveFolderContents(sourceFolder, destinationFolder);
      if (!fs.readdirSync(sourceFolder).length) fs.rmdirSync(sourceFolder);
    } else {
      fs.renameSync(sourceFolder, destinationFolder);
    }
  }
}

function findOnboardingRecord({ employeeId = "", email = "", employeeCode = "" } = {}) {
  const store = readEmployeesStore();
  const records = store.records || [];
  const id = String(employeeId || "").trim();
  const mail = String(email || "").trim().toLowerCase();
  const code = String(employeeCode || "").trim().toLowerCase();
  const emailsOf = (employee) => [
    employee.email,
    employee.candidateId,
    employee.employment?.officialEmail,
    employee.personalInfo?.officialEmail,
    employee.personalInfo?.email
  ].map((value) => String(value || "").trim().toLowerCase()).filter(Boolean);
  return records.find((employee) => id && employee.id === id)
    || records.find((employee) => mail && emailsOf(employee).includes(mail))
    || records.find((employee) => code && String(employee.employment?.employeeCode || "").trim().toLowerCase() === code)
    || null;
}

function listOnboardingDocumentFiles(employee, extraIds = []) {
  const store = readEmployeesStore();
  const catalog = new Map((store.documents || []).map((doc) => [String(doc.id || ""), doc.title || doc.id]));
  const ids = [...new Set([employee?.id, ...extraIds].filter(Boolean).map((value) => String(value)))];
  const folders = [];
  ids.forEach((id) => {
    const folder = findExistingEmployeeFolder(safePathPart(id, "employee"))
      || findExistingEmployeeFolder(String(id));
    if (folder && fs.existsSync(folder) && !folders.includes(folder)) folders.push(folder);
  });
  const files = [];
  const seen = new Set();
  folders.forEach((folder) => {
    fs.readdirSync(folder, { withFileTypes: true }).forEach((entry) => {
      if (!entry.isFile()) return;
      if (/^Onboarding Status/i.test(entry.name)) return;
      const key = `${folder}::${entry.name}`;
      if (seen.has(key)) return;
      seen.add(key);
      const dash = entry.name.indexOf(" - ");
      const documentId = dash > 0 ? entry.name.slice(0, dash) : path.basename(entry.name, path.extname(entry.name));
      const originalName = dash > 0 ? entry.name.slice(dash + 3) : entry.name;
      const fullPath = path.join(folder, entry.name);
      let uploadedAt = "";
      try { uploadedAt = fs.statSync(fullPath).mtime.toISOString(); } catch (_err) { uploadedAt = ""; }
      files.push({
        documentId,
        title: catalog.get(documentId) || documentId,
        fileName: originalName,
        storedName: entry.name,
        uploadedAt
      });
    });
  });
  return files.sort((a, b) => String(a.title).localeCompare(String(b.title)));
}

function onboardingDocumentFilePath(employee, storedName, extraIds = []) {
  const safeName = path.basename(String(storedName || ""));
  if (!safeName || safeName !== storedName || safeName.includes("..")) return "";
  const ids = [...new Set([employee?.id, ...extraIds].filter(Boolean).map((value) => String(value)))];
  for (const id of ids) {
    const folder = findExistingEmployeeFolder(safePathPart(id, "employee"))
      || findExistingEmployeeFolder(String(id));
    if (!folder || !fs.existsSync(folder)) continue;
    const fullPath = path.join(folder, safeName);
    if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) return fullPath;
  }
  return "";
}

function pendingDocumentPath(employeeId, documentId, fileName, companyId = "", employeeName = "") {
  const employeeDir = employeeDocumentFolder(employeeId, employeeName, companyId);
  const extension = path.extname(fileName);
  const baseName = path.basename(fileName, extension);
  return path.join(employeeDir, `${safePathPart(documentId, "document")} - ${safePathPart(baseName)}${extension}`);
}

function moveFolderContents(sourceDir, destinationDir) {
  if (!fs.existsSync(sourceDir)) return;
  fs.mkdirSync(destinationDir, { recursive: true });
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDir, entry.name);
    let destinationPath = path.join(destinationDir, entry.name);
    if (entry.isDirectory()) {
      moveFolderContents(sourcePath, destinationPath);
      if (!fs.readdirSync(sourcePath).length) fs.rmdirSync(sourcePath);
      continue;
    }
    if (!entry.isFile()) continue;
    if (fs.existsSync(destinationPath)) {
      const sourceFile = fs.readFileSync(sourcePath);
      const destinationFile = fs.readFileSync(destinationPath);
      if (sourceFile.equals(destinationFile)) {
        fs.unlinkSync(sourcePath);
        continue;
      }
      const extension = path.extname(entry.name);
      const baseName = path.basename(entry.name, extension);
      destinationPath = path.join(destinationDir, `${baseName} - migrated${extension}`);
    }
    fs.renameSync(sourcePath, destinationPath);
  }
}

function migrateLegacyDocumentFolders() {
  const sources = [
    path.join(legacyDocumentsRoot, "Onboarded Employees"),
    path.join(legacyDocumentsRoot, "Pending Employee Documents")
  ];
  for (const sourceRoot of sources) {
    if (!fs.existsSync(sourceRoot)) continue;
    for (const entry of fs.readdirSync(sourceRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const sourceFolder = path.join(sourceRoot, entry.name);
      const employeeId = entry.name.includes(" - ") ? entry.name.split(" - ").pop() : entry.name;
      const destinationFolder = employeeDocumentFolder(employeeId);
      moveFolderContents(sourceFolder, destinationFolder);
      if (fs.existsSync(sourceFolder) && !fs.readdirSync(sourceFolder).length) fs.rmdirSync(sourceFolder);
    }
    if (!fs.readdirSync(sourceRoot).length) fs.rmdirSync(sourceRoot);
  }
  if (fs.existsSync(legacyDocumentsRoot) && !fs.readdirSync(legacyDocumentsRoot).length) {
    fs.rmdirSync(legacyDocumentsRoot);
  }
}

function appendJsonRecord(filePath, record) {
  try {
    writeJsonRecord(filePath, record);
    return { path: filePath, fallback: false };
  } catch (error) {
    if (!["EPERM", "EACCES", "EBUSY"].includes(error.code) || filePath === candidateInviteFallbackPath) {
      throw error;
    }
    console.warn(`Invite log is locked; using local fallback: ${error.message}`);
    writeJsonRecord(candidateInviteFallbackPath, record);
    return { path: candidateInviteFallbackPath, fallback: true };
  }
}

function writeOnboardingStatus(employeeFolder, employeeId, employeeName, companyLabel = "") {
  const content = [
    "Onboarded Successfully",
    `Employee: ${employeeName}`,
    `Employee ID: ${employeeId}`,
    companyLabel ? `Company: ${companyLabel}` : "",
    `Approved at: ${new Date().toISOString()}`
  ].filter(Boolean).join("\r\n");
  const primaryPath = path.join(employeeFolder, "Onboarding Status.txt");

  try {
    fs.writeFileSync(primaryPath, content);
    return { path: primaryPath, fallback: false };
  } catch (error) {
    if (!["EPERM", "EACCES", "EBUSY"].includes(error.code)) throw error;

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const alternatePath = path.join(employeeFolder, `Onboarding Status - ${timestamp}.txt`);
    try {
      fs.writeFileSync(alternatePath, content);
      return { path: alternatePath, fallback: true };
    } catch (alternateError) {
      if (!["EPERM", "EACCES", "EBUSY"].includes(alternateError.code)) throw alternateError;
      console.warn(`Onboarding status file could not be written; continuing without it: ${alternateError.message}`);
      return { path: "", fallback: true, skipped: true };
    }
  }
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  row.push(cell);
  if (row.some((value) => value !== "")) rows.push(row);
  return rows;
}

function csvCell(value) {
  const text = String(value || "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function writeCsvWithFallback(filePath, fallbackName, content) {
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content, "utf8");
    return filePath;
  } catch (error) {
    if (!["EPERM", "EACCES", "EBUSY"].includes(error.code)) throw error;
    const fallbackPath = path.join(dataDir, "hr-pulse", fallbackName);
    fs.mkdirSync(path.dirname(fallbackPath), { recursive: true });
    fs.writeFileSync(fallbackPath, content, "utf8");
    return fallbackPath;
  }
}

function mirrorHrPulseCsv(primaryPath, fallbackName, content) {
  const written = writeCsvWithFallback(primaryPath, fallbackName, content);
  const mirrors = [
    path.join(dataDir, "hr-pulse", fallbackName),
    path.join(root, "..", "hr_pulse_frontend_editable", fallbackName)
  ];
  for (const mirror of mirrors) {
    try {
      if (path.resolve(mirror) === path.resolve(written)) continue;
      fs.mkdirSync(path.dirname(mirror), { recursive: true });
      fs.writeFileSync(mirror, content, "utf8");
    } catch {
      // Keep primary write even if a mirror folder is locked/missing.
    }
  }
  return written;
}

function upsertHrPulseEmployee(employee) {
  if (!employee.email || !employee.email.includes("@")) throw new Error("Employee official email is required for VayanaPulse access");
  if (!employee.tempPassword) throw new Error("Temporary password is required for VayanaPulse access");

  const headers = [
    "employeeId", "employeeCode", "name", "email", "department", "role", "tempPassword",
    "dateOfJoining", "dateOfConfirmation", "reportingManager", "buHead",
    "designation", "kmpCategory", "grade", "sbu", "sbu1",
    "functionGroup", "functionalCategory", "tenure", "onboardedAt",
    "companyId", "companyName", "location"
  ];
  let rows = [];
  try {
    rows = parseCsv(fs.readFileSync(hrPulseEmployeesPath, "utf8"));
  } catch {
    rows = [];
  }

  const existingHeaders = rows.length ? rows[0].map((value) => value.trim()) : [];
  const sourceHeaders = existingHeaders.length ? existingHeaders : headers;
  const normalizedHeaders = sourceHeaders.map((value) => value.toLowerCase().replace(/\s+/g, ""));
  for (const header of headers) {
    if (!normalizedHeaders.includes(header.toLowerCase())) sourceHeaders.push(header);
  }

  const finalHeaders = sourceHeaders;
  const headerIndex = Object.fromEntries(finalHeaders.map((header, index) => [
    header.toLowerCase().replace(/\s+/g, ""),
    index
  ]));
  const dataRows = rows.length ? rows.slice(1).map((record) => {
    const next = Array(finalHeaders.length).fill("");
    record.forEach((value, index) => { if (index < next.length) next[index] = value; });
    return next;
  }) : [];
  const emailIndex = headerIndex.email;
  const employeeIdIndex = headerIndex.employeeid;
  const officialEmail = String(employee.email || "").trim().toLowerCase();
  const existing = dataRows.find((record) => {
    if (employee.employeeId && employeeIdIndex != null
      && String(record[employeeIdIndex] || "").trim() === String(employee.employeeId).trim()) {
      return true;
    }
    return String(record[emailIndex] || "").trim().toLowerCase() === officialEmail;
  });
  const record = existing || Array(finalHeaders.length).fill("");
  const employment = employee.employment || {};
  const setField = (key, value) => {
    if (headerIndex[key] == null) return;
    record[headerIndex[key]] = value == null ? "" : String(value);
  };
  setField("employeeid", employee.employeeId);
  setField("employeecode", employment.employeeCode || employee.employeeCode || "");
  setField("name", employee.name);
  setField("email", officialEmail);
  setField("department", employment.department || employee.department || "General");
  setField("role", employment.designation || employee.role || "Employee");
  // Preserve any temp password already written for this row; Interlace never overwrites
  // existing portal passwords on sync, but we still avoid clobbering the sheet value.
  const existingTempPassword = existing && headerIndex.temppassword != null
    ? String(record[headerIndex.temppassword] || "").trim()
    : "";
  setField("temppassword", existingTempPassword || employee.tempPassword);
  setField("dateofjoining", employment.dateOfJoining || "");
  setField("dateofconfirmation", employment.dateOfConfirmation || "");
  setField("reportingmanager", employment.reportingManager || "");
  setField("buhead", employment.buHead || "");
  setField("designation", employment.designation || employee.role || "");
  setField("kmpcategory", employment.kmpCategory || "Other");
  setField("grade", employment.grade || "");
  setField("sbu", employment.sbu || "");
  setField("sbu1", employment.sbu1 || "");
  setField("functiongroup", employment.functionGroup || "");
  setField("functionalcategory", employment.functionalCategory || "");
  setField("tenure", employment.tenure || "");
  setField("onboardedat", employee.onboardedAt || new Date().toISOString());
  setField("companyid", resolveCompanyId(employee.companyId || employment.companyId || PORTAL_COMPANIES[0].id));
  setField("companyname", employee.companyName || employment.companyName || "");
  setField("location", employment.location || employee.location || "");
  if (!existing) dataRows.push(record);

  return mirrorHrPulseCsv(
    hrPulseEmployeesPath,
    "employees.csv",
    [finalHeaders, ...dataRows].map((values) => values.map(csvCell).join(",")).join("\r\n") + "\r\n"
  );
}

function upsertHrPulseAdmin(admin) {
  if (!admin.email || !admin.email.includes("@")) throw new Error("Valid admin email is required");
  if (!admin.password) throw new Error("Admin password is required");
  let rows = [];
  try {
    rows = parseCsv(fs.readFileSync(hrPulseAdminsPath, "utf8"));
  } catch {
    rows = [];
  }
  const headers = ["id", "name", "email", "password", "title", "accessRole", "companyId"];
  const records = rows.length ? rows.slice(1) : [];
  const email = admin.email.trim().toLowerCase();
  let record = records.find((row) => String(row[2] || "").trim().toLowerCase() === email);
  if (!record) {
    record = [
      `hr-${Date.now()}`,
      admin.name || "Vayana Admin",
      email,
      admin.password,
      admin.title || "HR Admin",
      admin.accessRole || "central",
      (admin.accessRole === "company" ? resolveCompanyId(admin.companyId || PORTAL_COMPANIES[0].id) : (admin.companyId || "all"))
    ];
    records.push(record);
  } else {
    record[1] = admin.name || record[1] || "Vayana Admin";
    record[2] = email;
    record[3] = admin.password;
    record[4] = admin.title || record[4] || "HR Admin";
    while (record.length < headers.length) record.push("");
    record[5] = admin.accessRole || record[5] || "central";
    record[6] = (admin.accessRole || record[5]) === "company"
      ? resolveCompanyId(admin.companyId || record[6] || PORTAL_COMPANIES[0].id)
      : (admin.companyId || record[6] || "all");
  }
  return mirrorHrPulseCsv(
    hrPulseAdminsPath,
    "admins.csv",
    [headers, ...records].map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n"
  );
}

function readJsonFileFromDisk(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function kvKeyForPath(filePath) {
  const base = path.basename(filePath).toLowerCase();
  if (base === "email-settings.json") return "email-settings";
  if (base === "offer-letter.json") return "offer-letter";
  if (base === "doj-reminders.json") return "doj-reminders";
  if (base === "candidate-invites.json") return "candidate-invites";
  return "";
}

function readJsonFile(filePath, fallback = null) {
  const key = kvKeyForPath(filePath);
  if (key) {
    const value = sqliteGetKv(key, null);
    if (value != null) return value;
  }
  return readJsonFileFromDisk(filePath, fallback);
}

function writeJsonFile(filePath, value) {
  const key = kvKeyForPath(filePath);
  if (key) sqliteSetKv(key, value);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function writeJsonRecord(filePath, record) {
  const key = kvKeyForPath(filePath);
  let records = [];
  if (key) {
    const fromDb = sqliteGetKv(key, []);
    records = Array.isArray(fromDb) ? fromDb : [];
  } else {
    try {
      records = JSON.parse(fs.readFileSync(filePath, "utf8"));
      if (!Array.isArray(records)) records = [];
    } catch {
      records = [];
    }
  }
  records.unshift(record);
  const next = records.slice(0, 100);
  if (key) sqliteSetKv(key, next);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(next, null, 2));
}

function escapeXml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function unescapeXml(value = "") {
  return String(value)
    .replace(/&quot;/g, "\"")
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&");
}

function parseJsonCell(value, fallback = {}) {
  try {
    return JSON.parse(value || "");
  } catch {
    return fallback;
  }
}

function buildExcelRows(rows) {
  return rows.map((row) => {
    const cells = row.map((value) => `<Cell><Data ss:Type="String">${escapeXml(value)}</Data></Cell>`).join("");
    return `<Row>${cells}</Row>`;
  }).join("");
}

function formatFileSize(bytes) {
  const size = Number(bytes || 0);
  if (!size) return "";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function getDocumentsForEmployee(documents, employee) {
  const isFresher = employee?.experienceLevel === "fresher";
  if (!isFresher) return documents;

  return documents.flatMap((doc) => {
    if (doc.id === "Current Employer Details" || doc.id === "Payslips") return [];
    if (doc.id === "Experience Letters") {
      if (!employee?.hasInternship) return [];
      return [{
        ...doc,
        title: "Internship letters",
        required: false
      }];
    }
    return [doc];
  });
}

function generatePulseTempPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$";
  const bytes = crypto.randomBytes(14);
  return Array.from(bytes, (value) => alphabet[value % alphabet.length]).join("");
}

function getFinalizeBlockers({ employee, uploads, reviews, documents, employment, pulseEmail }) {
  const missing = [];
  if (!employee) {
    missing.push("Candidate record not found");
    return missing;
  }
  if (employee.offerStatus === "declined" || employee.candidateAccessRevoked) {
    missing.push("Offer was declined (access revoked)");
  } else if (!(employee.offerStatus === "accepted" || employee.offerAccepted)) {
    missing.push("Offer not accepted");
  }
  if (!employee.personalInfoCompleted) {
    missing.push("Personal information not completed");
  }
  if (!employee.medicalCoverageCompleted) {
    missing.push("Medical coverage not submitted");
  }
  if (!employment?.employeeCode) {
    missing.push("Employee ID missing in Employment Details");
  }
  if (!pulseEmail || !String(pulseEmail).includes("@")) {
    missing.push("Official email missing in Employment Details");
  }
  if ((employee.bgvStatus || "pending") !== "verified") {
    missing.push("BGV not verified");
  }
  const requiredDocs = getDocumentsForEmployee(documents, employee).filter((doc) => doc.required);
  const unverified = requiredDocs.filter(
    (doc) => !(uploads[doc.id] && reviews[doc.id] === "verified")
  );
  if (!requiredDocs.length) {
    missing.push("Required document list is empty");
  } else if (unverified.length) {
    missing.push(`Required documents not uploaded and admin-verified: ${unverified.map((doc) => doc.title || doc.id).join(", ")}`);
  }
  return missing;
}

function getDocumentRows(records, documents = [], uploadsByEmployee = {}, reviewsByEmployee = {}) {
  const headers = [
    "Employee ID",
    "Employee Name",
    "Email",
    "Document ID",
    "Document Name",
    "Required",
    "Upload Status",
    "File Name",
    "File Size",
    "File Type",
    "Uploaded At",
    "Review Status",
    "Review Notes"
  ];
  const rows = records.flatMap((employee) => {
    const uploads = uploadsByEmployee[employee.id] || {};
    const reviews = reviewsByEmployee[employee.id] || {};
    return getDocumentsForEmployee(documents, employee).map((doc) => {
      const upload = uploads[doc.id];
      const review = reviews[doc.id];
      const reviewStatus = review && typeof review === "object" ? review.status : review;
      const reviewNote = review && typeof review === "object"
        ? review.note
        : (employee.documentReviewNotes?.[doc.id] || "");
      return [
        employee.id,
        employee.name,
        employee.email,
        doc.id,
        doc.title,
        doc.required ? "Yes" : "No",
        upload ? "Uploaded" : "Missing",
        upload?.name || "",
        upload ? formatFileSize(upload.size) : "",
        upload?.type || "",
        upload?.uploadedAt || "",
        upload ? reviewStatus || "pending" : "",
        upload ? reviewNote || "" : ""
      ];
    });
  });
  return [headers, ...rows];
}

function buildEmployeesWorkbookXml(records, documents = [], uploadsByEmployee = {}, reviewsByEmployee = {}) {
  const medicalExcelFields = [
    ["Employee Name", "medicalEmployeeName"],
    ["Employee Gender", "medicalEmployeeGender"],
    ["Official Email", "medicalEmployeeEmail"],
    ["Mobile Number", "medicalEmployeeMobile"],
    ["Employee DOB", "medicalEmployeeDob"],
    ["Spouse Name", "medicalSpouseName"],
    ["Spouse Gender", "medicalSpouseGender"],
    ["Spouse DOB", "medicalSpouseDob"],
    ["Child 1 Name", "medicalChild1Name"],
    ["Child 1 Gender", "medicalChild1Gender"],
    ["Child 1 DOB", "medicalChild1Dob"],
    ["Child 2 Name", "medicalChild2Name"],
    ["Child 2 Gender", "medicalChild2Gender"],
    ["Child 2 DOB", "medicalChild2Dob"],
    ["Child 3 Name", "medicalChild3Name"],
    ["Child 3 Gender", "medicalChild3Gender"],
    ["Child 3 DOB", "medicalChild3Dob"],
    ["Mother Relationship", "medicalMotherRelation"],
    ["Mother Name", "medicalMotherName"],
    ["Mother DOB", "medicalMotherDob"],
    ["Father Relationship", "medicalFatherRelation"],
    ["Father Name", "medicalFatherName"],
    ["Father DOB", "medicalFatherDob"]
  ];
  const headers = [
    "Employee ID",
    "Name",
    "Email",
    "Role",
    "Candidate Type",
    "Has Internship",
    "Start Date",
    "Candidate Login ID",
    "Temporary Password",
    "Password Changed",
    "Invite Status",
    "Invite Sent At",
    "Onboarding Status",
    "Onboarded At",
    "Documents Folder",
    "Personal Title",
    "Personal Full Name",
    "Date of Birth",
    "Gender",
    "Marital Status",
    "Contact Email",
    "Mobile",
    "Blood Group",
    "Current Address",
    "Permanent Address",
    "Same Address",
    "Emergency Contact Name",
    "Emergency Relationship",
    "Emergency Contact Number",
    "Personal Information Completed",
    "Personal Information Saved At",
    "Profile Photo URL",
    "Onboarding Email Sent At",
    "Onboarding Email Queued At",
    "Onboarding Email Delivery",
    "Document Details",
    "BGV Status",
    "BGV Verified At",
    "Offer Accepted",
    "Offer Accepted At",
    "Offer Status",
    "Offer Declined At",
    "Candidate Access Revoked",
    "Candidate Selected DOJ",
    "Date of Joining",
    "Date of Confirmation",
    "Reporting Manager",
    "BU Head",
    "Department",
    "Designation",
    "Location",
    "KMP / Other",
    "Grade",
    "SBU",
    "SBU 1",
    "Function Group",
    "Functional Category",
    "Tenure",
    "HR Employee ID",
    "Official Email",
    "Company ID",
    "Company Name"
  ];
  const rows = records.map((employee) => {
    const employment = employee.employment || {};
    return [
    employee.id,
    employee.name,
    employee.email,
    employee.role,
    employee.experienceLevel === "fresher" ? "Fresher" : "Experienced",
    employee.hasInternship ? "Yes" : "No",
    employee.start,
    employee.candidateId || employee.email,
    employee.candidatePassword || "",
    employee.passwordChangedAt ? "Yes" : "No",
    employee.inviteDelivery || "",
    employee.inviteSentAt || "",
    employee.onboardingStatus || "in-progress",
    employee.onboardedAt || "",
    employee.documentsFolder || "",
    employee.personalInfo?.title || "",
    employee.personalInfo?.fullName || "",
    employee.personalInfo?.dob || "",
    employee.personalInfo?.gender || "",
    employee.personalInfo?.maritalStatus || "",
    employee.personalInfo?.contactEmail || "",
    employee.personalInfo?.mobile || "",
    employee.personalInfo?.bloodgroup || "",
    employee.personalInfo?.currentAddress || "",
    employee.personalInfo?.permanentAddress || "",
    employee.personalInfo?.sameAddress ? "Yes" : "No",
    employee.personalInfo?.emergencyName || "",
    employee.personalInfo?.emergencyRelationship || "",
    employee.personalInfo?.emergencyMobile || "",
    employee.personalInfoCompleted ? "Yes" : "No",
    employee.personalInfo?.savedAt || "",
    employee.profilePhotoUrl || "",
    employee.onboardingEmailSentAt || "",
    employee.onboardingEmailQueuedAt || "",
    employee.onboardingEmailDelivery || "",
    JSON.stringify(employee.documentDetails || {}),
    employee.bgvStatus || "pending",
    employee.bgvVerifiedAt || "",
    employee.offerAccepted ? "Yes" : "No",
    employee.offerAcceptedAt || "",
    employee.offerStatus || (employee.offerAccepted ? "accepted" : "pending"),
    employee.offerDeclinedAt || "",
    employee.candidateAccessRevoked ? "Yes" : "No",
    employee.offerJoiningDate || "",
    employment.dateOfJoining || "",
    employment.dateOfConfirmation || "",
    employment.reportingManager || "",
    employment.buHead || "",
    employment.department || employee.department || "",
    employment.designation || employee.role || "",
    employment.location || employee.location || "",
    employment.kmpCategory || "",
    employment.grade || "",
    employment.sbu || "",
    employment.sbu1 || "",
    employment.functionGroup || "",
    employment.functionalCategory || "",
    employment.tenure || "",
    employment.employeeCode || employee.employeeCode || "",
    employment.officialEmail || employee.officialEmail || "",
    resolveCompanyId(employee.companyId || PORTAL_COMPANIES[0].id),
    employee.companyName || ""
  ];
  });
  const employeeRows = buildExcelRows([headers, ...rows]);
  const documentRows = buildExcelRows(getDocumentRows(records, documents, uploadsByEmployee, reviewsByEmployee));
  const medicalHeaders = [
    "Employee ID", "Candidate Name", "Candidate Email", "Submission Status", "Saved At",
    ...medicalExcelFields.map(([header]) => header)
  ];
  const medicalRows = buildExcelRows([
    medicalHeaders,
    ...records.map((employee) => [
      employee.id,
      employee.name,
      employee.email,
      employee.medicalCoverageCompleted ? "Submitted" : "Not submitted",
      employee.medicalCoverage?.savedAt || "",
      ...medicalExcelFields.map(([, key]) => employee.medicalCoverage?.[key] || "")
    ])
  ]);
  const xml = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Worksheet ss:Name="Employees">
    <Table>${employeeRows}</Table>
  </Worksheet>
  <Worksheet ss:Name="Documents">
    <Table>${documentRows}</Table>
  </Worksheet>
  <Worksheet ss:Name="Medical Coverage">
    <Table>${medicalRows}</Table>
  </Worksheet>
</Workbook>`;
  return xml;
}

function writeWorkbookFile(filePath, xml, { required = false } = {}) {
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, xml, "utf8");
    return filePath;
  } catch (error) {
    if (required || !["EPERM", "EACCES", "EBUSY"].includes(error.code)) throw error;
    console.warn(`Excel write skipped (${path.basename(filePath)}): ${error.message}`);
    return null;
  }
}

function writeEmployeesSheet(records, documents = [], uploadsByEmployee = {}, reviewsByEmployee = {}) {
  const xml = buildEmployeesWorkbookXml(records, documents, uploadsByEmployee, reviewsByEmployee);
  return writeWorkbookFile(employeesSheetPath, xml, { required: true });
}

function writeEmployees(records, documentData = {}) {
  const documents = Array.isArray(documentData.documents) ? documentData.documents : [];
  const uploadsByEmployee = documentData.uploadsByEmployee || {};
  const reviewsByEmployee = documentData.reviewsByEmployee || {};
  writeEmployeesStore(records, { documents, uploadsByEmployee, reviewsByEmployee });
  const xmlAll = buildEmployeesWorkbookXml(records, documents, uploadsByEmployee, reviewsByEmployee);
  writeWorkbookFile(employeesSheetPath, xmlAll, { required: false });
  writeWorkbookFile(path.join(companySheetsDir, "All Entities.xls"), xmlAll);
  writeWorkbookFile(path.join(laptopDocumentsRoot, "All Entities.xls"), xmlAll);
  PORTAL_COMPANIES.forEach((company) => {
    const subset = records.filter((employee) => resolveCompanyId(employee.companyId || PORTAL_COMPANIES[0].id) === company.id);
    const xml = buildEmployeesWorkbookXml(subset, documents, uploadsByEmployee, reviewsByEmployee);
    writeWorkbookFile(path.join(companySheetsDir, `${company.code}.xls`), xml);
    writeWorkbookFile(path.join(companyDocumentRoot(company.id), `${company.code}.xls`), xml);
  });
}

function readEmployeesSheet() {
  return readEmployeesStore().records;
}

function readEmployeesSheetFromExcel() {
  let content = "";
  try {
    content = fs.readFileSync(employeesSheetPath, "utf8");
  } catch {
    writeEmployeesSheet([]);
    return [];
  }

  const employeeWorksheet = content.match(/<Worksheet ss:Name="Employees">([\s\S]*?)<\/Worksheet>/);
  const worksheetContent = employeeWorksheet ? employeeWorksheet[1] : content;
  const rowMatches = [...worksheetContent.matchAll(/<Row>([\s\S]*?)<\/Row>/g)].map((match) => match[1]);
  if (rowMatches.length <= 1) return [];
  const headerCells = [...rowMatches[0].matchAll(/<Data ss:Type="String">([\s\S]*?)<\/Data>/g)]
    .map((match) => unescapeXml(match[1]));
  const headerIndex = Object.fromEntries(headerCells.map((header, index) => [header, index]));
  const hasCandidateTypeColumns = rowMatches[0].includes("Candidate Type");
  const hasBloodGroupColumn = rowMatches[0].includes("Blood Group");
  const medicalCoverageByEmployee = new Map();
  const medicalWorksheet = content.match(/<Worksheet ss:Name="Medical Coverage">([\s\S]*?)<\/Worksheet>/);
  if (medicalWorksheet) {
    const medicalRows = [...medicalWorksheet[1].matchAll(/<Row>([\s\S]*?)<\/Row>/g)].map((match) => match[1]);
    const parseRow = (row) => [...row.matchAll(/<Data ss:Type="String">([\s\S]*?)<\/Data>/g)]
      .map((match) => unescapeXml(match[1]));
    const medicalHeaders = medicalRows.length ? parseRow(medicalRows[0]) : [];
    const medicalHeaderIndex = Object.fromEntries(medicalHeaders.map((header, index) => [header, index]));
    const medicalFieldMap = [
      ["Employee Name", "medicalEmployeeName"], ["Employee Gender", "medicalEmployeeGender"],
      ["Official Email", "medicalEmployeeEmail"], ["Mobile Number", "medicalEmployeeMobile"],
      ["Employee DOB", "medicalEmployeeDob"], ["Spouse Name", "medicalSpouseName"],
      ["Spouse Gender", "medicalSpouseGender"], ["Spouse DOB", "medicalSpouseDob"],
      ["Child 1 Name", "medicalChild1Name"], ["Child 1 Gender", "medicalChild1Gender"],
      ["Child 1 DOB", "medicalChild1Dob"], ["Child 2 Name", "medicalChild2Name"],
      ["Child 2 Gender", "medicalChild2Gender"], ["Child 2 DOB", "medicalChild2Dob"],
      ["Child 3 Name", "medicalChild3Name"], ["Child 3 Gender", "medicalChild3Gender"],
      ["Child 3 DOB", "medicalChild3Dob"], ["Mother Relationship", "medicalMotherRelation"],
      ["Mother Name", "medicalMotherName"], ["Mother DOB", "medicalMotherDob"],
      ["Father Relationship", "medicalFatherRelation"], ["Father Name", "medicalFatherName"],
      ["Father DOB", "medicalFatherDob"]
    ];
    medicalRows.slice(1).forEach((row) => {
      const cells = parseRow(row);
      const employeeId = cells[medicalHeaderIndex["Employee ID"]] || "";
      if (!employeeId) return;
      const medicalCoverage = {
        savedAt: cells[medicalHeaderIndex["Saved At"]] || ""
      };
      medicalFieldMap.forEach(([header, key]) => {
        medicalCoverage[key] = cells[medicalHeaderIndex[header]] || "";
      });
      medicalCoverageByEmployee.set(employeeId, {
        completed: cells[medicalHeaderIndex["Submission Status"]] === "Submitted",
        medicalCoverage
      });
    });
  }

  return rowMatches.slice(1).map((row) => {
    const cells = [...row.matchAll(/<Data ss:Type="String">([\s\S]*?)<\/Data>/g)].map((match) => unescapeXml(match[1]));
    const getCell = (header, fallbackIndex = -1) => {
      const index = headerIndex[header] ?? fallbackIndex;
      return index >= 0 ? cells[index] || "" : "";
    };
    if (!hasCandidateTypeColumns) {
      return {
        id: cells[0] || "",
        name: cells[1] || "",
        email: cells[2] || "",
        role: cells[3] || "",
        experienceLevel: "experienced",
        hasInternship: false,
        start: cells[4] || "",
        candidateId: cells[5] || cells[2] || "",
        candidatePassword: cells[6] || "",
        mustChangePassword: cells[7] !== "Yes",
        passwordChangedAt: cells[7] === "Yes" ? "saved-in-excel" : "",
        inviteDelivery: cells[8] || "",
        inviteSentAt: cells[9] || "",
        onboardingStatus: cells[10] || "in-progress",
        onboardedAt: cells[11] || "",
        documentsFolder: cells[12] || ""
      };
    }
    const legacyMedicalCoverage = parseJsonCell(getCell("Medical Coverage Details"), {});
    let medicalCoverage = {
      ...legacyMedicalCoverage,
      savedAt: getCell("Medical Coverage Saved At") || legacyMedicalCoverage.savedAt || "",
      medicalEmployeeName: getCell("Medical Employee Name") || legacyMedicalCoverage.medicalEmployeeName || "",
      medicalEmployeeGender: getCell("Medical Employee Gender") || legacyMedicalCoverage.medicalEmployeeGender || "",
      medicalEmployeeEmail: getCell("Medical Employee Email") || legacyMedicalCoverage.medicalEmployeeEmail || "",
      medicalEmployeeMobile: getCell("Medical Employee Mobile") || legacyMedicalCoverage.medicalEmployeeMobile || "",
      medicalEmployeeDob: getCell("Medical Employee DOB") || legacyMedicalCoverage.medicalEmployeeDob || "",
      medicalSpouseName: getCell("Spouse Name") || legacyMedicalCoverage.medicalSpouseName || "",
      medicalSpouseGender: getCell("Spouse Gender") || legacyMedicalCoverage.medicalSpouseGender || "",
      medicalSpouseDob: getCell("Spouse DOB") || legacyMedicalCoverage.medicalSpouseDob || "",
      medicalChild1Name: getCell("Child 1 Name") || legacyMedicalCoverage.medicalChild1Name || "",
      medicalChild1Gender: getCell("Child 1 Gender") || legacyMedicalCoverage.medicalChild1Gender || "",
      medicalChild1Dob: getCell("Child 1 DOB") || legacyMedicalCoverage.medicalChild1Dob || "",
      medicalChild2Name: getCell("Child 2 Name") || legacyMedicalCoverage.medicalChild2Name || "",
      medicalChild2Gender: getCell("Child 2 Gender") || legacyMedicalCoverage.medicalChild2Gender || "",
      medicalChild2Dob: getCell("Child 2 DOB") || legacyMedicalCoverage.medicalChild2Dob || "",
      medicalChild3Name: getCell("Child 3 Name") || legacyMedicalCoverage.medicalChild3Name || "",
      medicalChild3Gender: getCell("Child 3 Gender") || legacyMedicalCoverage.medicalChild3Gender || "",
      medicalChild3Dob: getCell("Child 3 DOB") || legacyMedicalCoverage.medicalChild3Dob || "",
      medicalMotherRelation: getCell("Mother Relationship") || legacyMedicalCoverage.medicalMotherRelation || "",
      medicalMotherName: getCell("Mother Name") || legacyMedicalCoverage.medicalMotherName || "",
      medicalMotherDob: getCell("Mother DOB") || legacyMedicalCoverage.medicalMotherDob || "",
      medicalFatherRelation: getCell("Father Relationship") || legacyMedicalCoverage.medicalFatherRelation || "",
      medicalFatherName: getCell("Father Name") || legacyMedicalCoverage.medicalFatherName || "",
      medicalFatherDob: getCell("Father DOB") || legacyMedicalCoverage.medicalFatherDob || ""
    };
    const medicalSheetRecord = medicalCoverageByEmployee.get(cells[0] || "");
    if (medicalSheetRecord) medicalCoverage = medicalSheetRecord.medicalCoverage;
    return {
      id: cells[0] || "",
      name: cells[1] || "",
      email: cells[2] || "",
      role: cells[3] || "",
      experienceLevel: cells[4] === "Fresher" ? "fresher" : "experienced",
      hasInternship: cells[5] === "Yes",
      start: cells[6] || "",
      candidateId: cells[7] || cells[2] || "",
      candidatePassword: cells[8] || "",
      mustChangePassword: cells[9] !== "Yes",
      passwordChangedAt: cells[9] === "Yes" ? "saved-in-excel" : "",
      inviteDelivery: cells[10] || "",
      inviteSentAt: cells[11] || "",
      onboardingStatus: cells[12] || "in-progress",
      onboardedAt: cells[13] || "",
      documentsFolder: cells[14] || "",
      personalInfo: {
        title: cells[15] || "",
        fullName: cells[16] || "",
        dob: cells[17] || "",
        gender: cells[18] || "",
        maritalStatus: cells[19] || "",
        contactEmail: cells[20] || "",
        mobile: cells[21] || "",
        bloodgroup: hasBloodGroupColumn ? cells[22] || "" : "",
        currentAddress: cells[hasBloodGroupColumn ? 23 : 22] || "",
        permanentAddress: cells[hasBloodGroupColumn ? 24 : 23] || "",
        sameAddress: cells[hasBloodGroupColumn ? 25 : 24] === "Yes",
        emergencyName: cells[hasBloodGroupColumn ? 26 : 25] || "",
        emergencyRelationship: cells[hasBloodGroupColumn ? 27 : 26] || "",
        emergencyMobile: cells[hasBloodGroupColumn ? 28 : 27] || "",
        savedAt: cells[hasBloodGroupColumn ? 30 : 29] || ""
      },
      personalInfoCompleted: cells[hasBloodGroupColumn ? 29 : 28] === "Yes",
      profilePhotoUrl: getCell("Profile Photo URL", hasBloodGroupColumn ? 31 : 30),
      onboardingEmailSentAt: getCell("Onboarding Email Sent At"),
      onboardingEmailQueuedAt: getCell("Onboarding Email Queued At"),
      onboardingEmailDelivery: getCell("Onboarding Email Delivery"),
      bgvStatus: getCell("BGV Status") || "pending",
      bgvVerifiedAt: getCell("BGV Verified At"),
      offerAccepted: getCell("Offer Accepted") === "Yes",
      offerAcceptedAt: getCell("Offer Accepted At"),
      offerStatus: getCell("Offer Status") || (getCell("Offer Accepted") === "Yes" ? "accepted" : "pending"),
      offerDeclinedAt: getCell("Offer Declined At"),
      candidateAccessRevoked: getCell("Candidate Access Revoked") === "Yes",
      offerJoiningDate: getCell("Candidate Selected DOJ"),
      employment: {
        dateOfJoining: getCell("Date of Joining"),
        dateOfConfirmation: getCell("Date of Confirmation"),
        reportingManager: getCell("Reporting Manager"),
        buHead: getCell("BU Head"),
        department: getCell("Department"),
        designation: getCell("Designation"),
        location: getCell("Location"),
        kmpCategory: getCell("KMP / Other"),
        grade: getCell("Grade"),
        sbu: getCell("SBU"),
        sbu1: getCell("SBU 1"),
        functionGroup: getCell("Function Group"),
        functionalCategory: getCell("Functional Category"),
        tenure: getCell("Tenure"),
        employeeCode: getCell("HR Employee ID"),
        officialEmail: getCell("Official Email")
      },
      department: getCell("Department"),
      location: getCell("Location"),
      employeeCode: getCell("HR Employee ID"),
      officialEmail: getCell("Official Email"),
      companyId: resolveCompanyId(getCell("Company ID") || PORTAL_COMPANIES[0].id),
      companyName: getCell("Company Name"),
      documentDetails: (() => {
        try {
          return JSON.parse(getCell("Document Details") || "{}");
        } catch {
          return {};
        }
      })(),
      medicalCoverageCompleted: medicalSheetRecord?.completed
        ?? (getCell("Medical Coverage Completed", hasBloodGroupColumn ? 32 : 31) === "Yes"),
      medicalCoverage
    };
  }).filter((employee) => employee.id && employee.email);
}

function parseStoredFileSize(value = "") {
  const match = String(value).match(/^([\d.]+)\s*(B|KB|MB)?$/i);
  if (!match) return 0;
  const amount = Number(match[1]);
  const unit = (match[2] || "B").toUpperCase();
  if (unit === "MB") return Math.round(amount * 1024 * 1024);
  if (unit === "KB") return Math.round(amount * 1024);
  return Math.round(amount);
}

function readDocumentMetadataSheet() {
  const store = readEmployeesStore();
  return {
    uploadsByEmployee: store.uploadsByEmployee || {},
    reviewsByEmployee: store.reviewsByEmployee || {}
  };
}

function readDocumentMetadataSheetFromExcel() {
  let content = "";
  try {
    content = fs.readFileSync(employeesSheetPath, "utf8");
  } catch {
    return { uploadsByEmployee: {}, reviewsByEmployee: {} };
  }
  const worksheet = content.match(/<Worksheet ss:Name="Documents">([\s\S]*?)<\/Worksheet>/);
  if (!worksheet) return { uploadsByEmployee: {}, reviewsByEmployee: {} };
  const rows = [...worksheet[1].matchAll(/<Row>([\s\S]*?)<\/Row>/g)].map((match) => match[1]);
  const parseRow = (row) => [...row.matchAll(/<Data ss:Type="String">([\s\S]*?)<\/Data>/g)]
    .map((match) => unescapeXml(match[1]));
  if (rows.length <= 1) return { uploadsByEmployee: {}, reviewsByEmployee: {} };
  const headers = parseRow(rows[0]);
  const index = Object.fromEntries(headers.map((header, cellIndex) => [header, cellIndex]));
  const uploadsByEmployee = {};
  const reviewsByEmployee = {};

  rows.slice(1).forEach((row) => {
    const cells = parseRow(row);
    const employeeId = cells[index["Employee ID"]] || "";
    const documentId = cells[index["Document ID"]] || "";
    const uploadStatus = cells[index["Upload Status"]] || "";
    if (!employeeId || !documentId || uploadStatus !== "Uploaded") return;
    uploadsByEmployee[employeeId] = uploadsByEmployee[employeeId] || {};
    reviewsByEmployee[employeeId] = reviewsByEmployee[employeeId] || {};
    uploadsByEmployee[employeeId][documentId] = {
      name: cells[index["File Name"]] || "",
      size: parseStoredFileSize(cells[index["File Size"]] || ""),
      type: cells[index["File Type"]] || "unknown",
      uploadedAt: cells[index["Uploaded At"]] || ""
    };
    const review = cells[index["Review Status"]] || "";
    const note = cells[index["Review Notes"]] || "";
    if (review) {
      reviewsByEmployee[employeeId][documentId] = note
        ? { status: review, note }
        : review;
    }
  });
  return { uploadsByEmployee, reviewsByEmployee };
}

function escapeHeader(value = "") {
  return String(value).replace(/[\r\n]+/g, " ").trim();
}

function escapeSmtpLine(value = "") {
  return String(value).replace(/^\./gm, "..");
}

function toCrlf(value = "") {
  return String(value).replace(/\r\n/g, "\n").replace(/\n/g, "\r\n");
}

function foldBase64(value = "") {
  const compact = String(value).replace(/\s+/g, "");
  return compact.match(/.{1,76}/g)?.join("\r\n") || compact;
}

const EMAIL_LOGO_CID = "vayana-logo@vayanapulse";

function loadEmailLogoAttachment() {
  const logoPngPath = path.join(root, "assets", "Vayana-Logo.png");
  if (!fs.existsSync(logoPngPath)) return null;
  return {
    filename: "Vayana-Logo.png",
    contentType: "image/png",
    contentId: EMAIL_LOGO_CID,
    base64: fs.readFileSync(logoPngPath).toString("base64")
  };
}

function withEmailLogoCid(html = "") {
  return String(html).replace(
    /src=(["'])cid:vayana-logo(?:@[^"']*)?\1/gi,
    `src=$1cid:${EMAIL_LOGO_CID}$1`
  );
}

/** Build a Gmail/Outlook-friendly MIME message with an inline PNG logo. */
function buildSmtpDataMessage(mailSettings, invite) {
  const fromName = escapeHeader(mailSettings.senderName || invite.fromName || "Vayana HR Team");
  const headerLines = [
    `From: ${fromName} <${escapeHeader(mailSettings.senderEmail)}>`,
    `To: ${escapeHeader(invite.to)}`,
    `Subject: ${escapeHeader(invite.subject)}`,
    "MIME-Version: 1.0"
  ];

  if (!invite.html) {
    return toCrlf([...headerLines, "Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: 8bit", "", invite.body || ""].join("\r\n"));
  }

  const logo = loadEmailLogoAttachment();
  const html = toCrlf(withEmailLogoCid(invite.html));
  const text = toCrlf(invite.body || "");

  if (!logo) {
    return toCrlf([...headerLines, "Content-Type: text/html; charset=UTF-8", "Content-Transfer-Encoding: 8bit", "", html].join("\r\n"));
  }

  // Nested structure most clients (including Gmail) resolve for cid: images.
  // Top-level multipart/related (not mixed) so the PNG is treated as inline, not a separate attachment.
  const stamp = Date.now().toString(16);
  const related = `=_Vayana_Related_${stamp}`;
  const alternative = `=_Vayana_Alt_${stamp}`;
  const logoB64 = foldBase64(logo.base64);

  return toCrlf([
    ...headerLines,
    `Content-Type: multipart/related; type="text/html"; boundary="${related}"`,
    "",
    `--${related}`,
    `Content-Type: multipart/alternative; boundary="${alternative}"`,
    "",
    `--${alternative}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    text,
    `--${alternative}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    html,
    `--${alternative}--`,
    `--${related}`,
    `Content-Type: ${logo.contentType}; name="${logo.filename}"`,
    "Content-Transfer-Encoding: base64",
    `Content-ID: <${logo.contentId}>`,
    `Content-Disposition: inline; filename="${logo.filename}"; size=${Buffer.from(logo.base64, "base64").length}`,
    `X-Attachment-Id: ${logo.contentId}`,
    "",
    logoB64,
    `--${related}--`,
    ""
  ].join("\r\n"));
}

function hasSmtpSettings(settings) {
  return Boolean(settings?.smtpHost && settings?.smtpPort && settings?.smtpUser && settings?.smtpPass && settings?.senderEmail);
}

function normalizeSmtpSettings(settings = {}) {
  const normalized = { ...settings };
  if (typeof normalized.smtpHost === "string") {
    normalized.smtpHost = normalized.smtpHost.trim().toLowerCase().replace(/^smpt\./, "smtp.");
  }
  if (typeof normalized.smtpPort === "string" || typeof normalized.smtpPort === "number") {
    normalized.smtpPort = String(normalized.smtpPort).trim() || "587";
  }
  if (typeof normalized.smtpUser === "string") normalized.smtpUser = normalized.smtpUser.trim();
  if (typeof normalized.senderEmail === "string") normalized.senderEmail = normalized.senderEmail.trim();
  // Gmail rejects AUTH when username is not the Gmail mailbox that owns the app password.
  if (
    normalized.smtpHost === "smtp.gmail.com"
    && normalized.senderEmail
    && /@gmail\.com$/i.test(normalized.senderEmail)
    && normalized.smtpUser
    && normalized.smtpUser.toLowerCase() !== normalized.senderEmail.toLowerCase()
  ) {
    normalized.smtpUser = normalized.senderEmail;
  }
  return normalized;
}

function sendSmtpMail(settings, invite) {
  return new Promise((resolve, reject) => {
    const mailSettings = normalizeSmtpSettings(settings);
    const portNumber = Number(mailSettings.smtpPort || 587);
    const secure = portNumber === 465;
    let socket = secure
      ? tls.connect({ host: mailSettings.smtpHost, port: portNumber, servername: mailSettings.smtpHost })
      : net.connect({ host: mailSettings.smtpHost, port: portNumber });
    let buffer = "";
    const fail = (error) => {
      try { socket.destroy(); } catch (_error) { /* ignore */ }
      const message = error?.message || String(error);
      if (/ENOTFOUND|getaddrinfo/i.test(message)) {
        reject(new Error(`SMTP host not found: ${mailSettings.smtpHost}. Check Email Settings (use smtp.gmail.com for Gmail).`));
        return;
      }
      if (/ECONNREFUSED|ETIMEDOUT/i.test(message)) {
        reject(new Error(`Could not connect to ${mailSettings.smtpHost}:${portNumber}. Check host/port and network.`));
        return;
      }
      if (/535|Username and Password not accepted|Invalid login/i.test(message)) {
        reject(new Error("SMTP login failed. For Gmail, use the Gmail address as SMTP User and an App Password."));
        return;
      }
      reject(error instanceof Error ? error : new Error(message));
    };

    function readResponse() {
      return new Promise((responseResolve, responseReject) => {
        const onData = (chunk) => {
          buffer += chunk.toString("utf8");
          if (/\r?\n\d{3} /.test(buffer) || /\r?\n\d{3}-/.test(buffer) === false && /^\d{3} /.test(buffer.trim())) {
            // Wait until full multi-line SMTP reply completes (ends with "NNN ").
            const lines = buffer.split(/\r?\n/).filter(Boolean);
            const last = lines[lines.length - 1] || "";
            if (!/^\d{3} /.test(last)) return;
            socket.off("data", onData);
            const response = buffer;
            buffer = "";
            const code = Number(response.slice(0, 3));
            if (code >= 400) responseReject(new Error(response.trim()));
            else responseResolve(response);
          }
        };
        socket.on("data", onData);
        socket.once("error", responseReject);
      });
    }

    async function command(line) {
      socket.write(`${line}\r\n`);
      return readResponse();
    }

    socket.once("error", fail);
    socket.once("connect", async () => {
      try {
        await readResponse();
        await command("EHLO vayanapulse.local");
        if (!secure && portNumber === 587) {
          await command("STARTTLS");
          socket = tls.connect({ socket, servername: mailSettings.smtpHost });
          socket.once("error", fail);
          await new Promise((resolveTls, rejectTls) => {
            socket.once("secureConnect", resolveTls);
            socket.once("error", rejectTls);
          });
          await command("EHLO vayanapulse.local");
        }
        await command("AUTH LOGIN");
        await command(Buffer.from(mailSettings.smtpUser).toString("base64"));
        await command(Buffer.from(mailSettings.smtpPass).toString("base64"));
        await command(`MAIL FROM:<${mailSettings.senderEmail}>`);
        await command(`RCPT TO:<${invite.to}>`);
        await command("DATA");

        const message = buildSmtpDataMessage(mailSettings, invite);
        socket.write(`${escapeSmtpLine(message)}\r\n.\r\n`);
        await readResponse();
        socket.write("QUIT\r\n");
        socket.end();
        resolve();
      } catch (error) {
        fail(error);
      }
    });
  });
}

function escapeEmailHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

let dojReminderSchedulerRunning = false;

function employeeJoiningDateRaw(employee) {
  return employee?.employment?.dateOfJoining || employee?.offerJoiningDate || employee?.start || "";
}

function isEmployeeOnboarded(employee) {
  return Boolean(employee?.onboardedAt) || employee?.onboardingStatus === "onboarded";
}

function parseEmployeeDojUtc(employee, today = new Date(), { rollPastYearForward = true } = {}) {
  const rawDoj = employeeJoiningDateRaw(employee);
  if (!rawDoj) return null;
  const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const isoMatch = String(rawDoj).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    return Date.UTC(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]));
  }
  const datedValue = /\b\d{4}\b/.test(rawDoj) ? rawDoj : `${rawDoj} ${today.getFullYear()}`;
  const parsed = new Date(datedValue);
  if (Number.isNaN(parsed.getTime())) return null;
  let dojUtc = Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
  if (rollPastYearForward && !/\b\d{4}\b/.test(rawDoj) && dojUtc < todayUtc) {
    dojUtc = Date.UTC(parsed.getFullYear() + 1, parsed.getMonth(), parsed.getDate());
  }
  return dojUtc;
}

function buildDojReminderEmail(employee, normalizedDoj) {
  const dashboardUrl = `${localUrl}index.html?login=candidate#candidate`;
  const credentialLines = employee.passwordChangedAt
    ? [`Login ID: ${employee.candidateId || employee.email}`, "Password: Use the private password you created."]
    : [`Login ID: ${employee.candidateId || employee.email}`, `Temporary password: ${employee.candidatePassword}`];
  return {
    to: employee.email,
    subject: `V-Incept onboarding reminder - DOJ ${normalizedDoj}`,
    body: [
      `Hi ${employee.name},`,
      "",
      `Your Date of Joining with Vayana is ${normalizedDoj}.`,
      "Please complete all remaining onboarding information and document uploads before joining.",
      "",
      `V-Incept candidate portal: ${dashboardUrl}`,
      ...credentialLines,
      "",
      "Regards,",
      "Vayana HR Team"
    ].join("\n"),
    html: `
      <!doctype html><html><body style="margin:0;background:#f4f7fb;font-family:Arial,sans-serif;color:#162d64">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:28px 12px"><tr><td align="center">
      <table role="presentation" width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;background:#fff;border:1px solid #dbe4f0;border-radius:12px;overflow:hidden">
      <tr><td align="center" style="padding:22px 30px;border-top:5px solid #e31837;border-bottom:1px solid #dbe4f0;background:#ffffff;text-align:center"><img src="cid:vayana-logo@vayanapulse" alt="Vayana" width="155" height="40" style="display:block;margin:0 auto;border:0;outline:none;text-decoration:none;width:155px;max-width:100%;height:auto"></td></tr>
      <tr><td style="padding:34px 38px">
      <p>Dear ${escapeEmailHtml(employee.name)},</p>
      <h1 style="font-size:24px">Your Vayana joining date is approaching</h1>
      <p style="line-height:1.7;color:#425577">Your confirmed Date of Joining is <strong>${escapeEmailHtml(normalizedDoj)}</strong>. Please complete all remaining onboarding information and document uploads before joining.</p>
      <p><a href="${escapeEmailHtml(dashboardUrl)}" style="display:inline-block;padding:12px 22px;border-radius:7px;background:#162d64;color:#fff;text-decoration:none;font-weight:700">Open V-Incept</a></p>
      <p style="line-height:1.7;color:#425577"><strong>Login ID:</strong> ${escapeEmailHtml(employee.candidateId || employee.email)}<br>${employee.passwordChangedAt ? "Use the private password you created." : `<strong>Temporary password:</strong> ${escapeEmailHtml(employee.candidatePassword)}`}</p>
      <p style="margin-top:28px;color:#425577">Regards,<br><strong>Vayana HR Team</strong></p>
      </td></tr><tr><td style="padding:16px;background:#162d64;color:#fff;text-align:center;font-size:11px">Vayana Network Services Pvt. Ltd. | Official onboarding communication</td></tr>
      </table></td></tr></table></body></html>
    `.trim(),
    emailType: "doj-15-day-reminder"
  };
}

function buildMissedOnboardingReminderEmail(employee, normalizedDoj, daysOverdue) {
  const dashboardUrl = `${localUrl}index.html?login=candidate#candidate`;
  const overdueLabel = daysOverdue === 1 ? "1 day" : `${daysOverdue} days`;
  const credentialLines = employee.passwordChangedAt
    ? [`Login ID: ${employee.candidateId || employee.email}`, "Password: Use the private password you created."]
    : [`Login ID: ${employee.candidateId || employee.email}`, `Temporary password: ${employee.candidatePassword}`];
  return {
    to: employee.email,
    subject: `V-Incept reminder - Missed onboarding date ${normalizedDoj}`,
    body: [
      `Hi ${employee.name},`,
      "",
      `Your onboarding / Date of Joining was ${normalizedDoj}, and our records show you have not completed onboarding yet (${overdueLabel} overdue).`,
      "Please sign in to V-Incept and finish any pending documents or details as soon as possible, and contact HR if you need help.",
      "",
      `V-Incept candidate portal: ${dashboardUrl}`,
      ...credentialLines,
      "",
      "Regards,",
      "Vayana HR Team"
    ].join("\n"),
    html: `
      <!doctype html><html><body style="margin:0;background:#f4f7fb;font-family:Arial,sans-serif;color:#162d64">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:28px 12px"><tr><td align="center">
      <table role="presentation" width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;background:#fff;border:1px solid #dbe4f0;border-radius:12px;overflow:hidden">
      <tr><td align="center" style="padding:22px 30px;border-top:5px solid #e31837;border-bottom:1px solid #dbe4f0;background:#ffffff;text-align:center"><img src="cid:vayana-logo@vayanapulse" alt="Vayana" width="155" height="40" style="display:block;margin:0 auto;border:0;outline:none;text-decoration:none;width:155px;max-width:100%;height:auto"></td></tr>
      <tr><td style="padding:34px 38px">
      <p>Dear ${escapeEmailHtml(employee.name)},</p>
      <h1 style="font-size:24px">Your onboarding date has passed</h1>
      <p style="line-height:1.7;color:#425577">Your Date of Joining was <strong>${escapeEmailHtml(normalizedDoj)}</strong>, and you have not completed onboarding yet (<strong>${escapeEmailHtml(overdueLabel)} overdue</strong>). Please finish any pending documents or details in V-Incept as soon as possible, and contact HR if you need support.</p>
      <p><a href="${escapeEmailHtml(dashboardUrl)}" style="display:inline-block;padding:12px 22px;border-radius:7px;background:#162d64;color:#fff;text-decoration:none;font-weight:700">Open V-Incept</a></p>
      <p style="line-height:1.7;color:#425577"><strong>Login ID:</strong> ${escapeEmailHtml(employee.candidateId || employee.email)}<br>${employee.passwordChangedAt ? "Use the private password you created." : `<strong>Temporary password:</strong> ${escapeEmailHtml(employee.candidatePassword)}`}</p>
      <p style="margin-top:28px;color:#425577">Regards,<br><strong>Vayana HR Team</strong></p>
      </td></tr><tr><td style="padding:16px;background:#162d64;color:#fff;text-align:center;font-size:11px">Vayana Network Services Pvt. Ltd. | Official onboarding communication</td></tr>
      </table></td></tr></table></body></html>
    `.trim(),
    emailType: "missed-onboarding-reminder"
  };
}

function hasReminderRecord(reminders, employeeId, doj, reminderType) {
  return reminders.some((record) =>
    record.employeeId === employeeId
    && record.doj === doj
    && record.deliveryStatus === "sent"
    && (
      reminderType === "doj-15-day"
        ? (!record.reminderType || record.reminderType === "doj-15-day")
        : record.reminderType === reminderType
    )
  );
}

async function sendDojReminderEmail(employee, options = {}) {
  const { force = false, source = "automatic" } = options;
  const settings = normalizeSmtpSettings(readJsonFile(emailSettingsPath, null) || {});
  if (!hasSmtpSettings(settings)) {
    throw new Error("Email is not connected. Configure Email Settings first.");
  }
  if (!employee?.email) throw new Error("Candidate email is missing.");
  if (employee.candidateAccessRevoked) throw new Error("Portal access is revoked for this candidate.");
  if (isEmployeeOnboarded(employee)) {
    return { skipped: true, reason: "already-onboarded" };
  }

  const today = new Date();
  const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const dojUtc = parseEmployeeDojUtc(employee, today, { rollPastYearForward: true });
  if (!Number.isFinite(dojUtc)) throw new Error("Candidate does not have a valid Date of Joining.");
  const normalizedDoj = new Date(dojUtc).toISOString().slice(0, 10);
  const daysUntil = Math.round((dojUtc - todayUtc) / 86400000);
  if (daysUntil < 0) throw new Error("Date of Joining is already past.");
  if (source === "automatic" && daysUntil > 15) {
    return { skipped: true, reason: "outside-window", doj: normalizedDoj, daysUntil };
  }

  const reminders = readJsonFile(dojReminderPath, []);
  if (hasReminderRecord(reminders, employee.id, normalizedDoj, "doj-15-day") && !force) {
    return { skipped: true, reason: "already-sent", doj: normalizedDoj, daysUntil };
  }

  await sendSmtpMail(settings, buildDojReminderEmail(employee, normalizedDoj));
  const record = {
    employeeId: employee.id,
    candidateName: employee.name,
    email: employee.email,
    doj: normalizedDoj,
    reminderType: "doj-15-day",
    scheduledDaysBefore: 15,
    sentAt: new Date().toISOString(),
    deliveryStatus: "sent",
    source
  };
  appendJsonRecord(dojReminderPath, record);
  return { sent: true, record, daysUntil };
}

async function sendMissedOnboardingReminderEmail(employee, options = {}) {
  const { force = false, source = "automatic" } = options;
  const settings = normalizeSmtpSettings(readJsonFile(emailSettingsPath, null) || {});
  if (!hasSmtpSettings(settings)) {
    throw new Error("Email is not connected. Configure Email Settings first.");
  }
  if (!employee?.email) throw new Error("Candidate email is missing.");
  if (employee.candidateAccessRevoked) throw new Error("Portal access is revoked for this candidate.");
  if (isEmployeeOnboarded(employee)) {
    return { skipped: true, reason: "already-onboarded" };
  }

  const today = new Date();
  const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const dojUtc = parseEmployeeDojUtc(employee, today, { rollPastYearForward: false });
  if (!Number.isFinite(dojUtc)) throw new Error("Candidate does not have a valid Date of Joining.");
  const normalizedDoj = new Date(dojUtc).toISOString().slice(0, 10);
  const daysUntil = Math.round((dojUtc - todayUtc) / 86400000);
  const daysOverdue = -daysUntil;
  if (daysUntil >= 0) {
    return { skipped: true, reason: "not-missed-yet", doj: normalizedDoj, daysUntil };
  }
  // Only auto-send within 60 days after the missed date.
  if (source === "automatic" && daysOverdue > 60) {
    return { skipped: true, reason: "outside-window", doj: normalizedDoj, daysUntil };
  }

  const reminders = readJsonFile(dojReminderPath, []);
  if (hasReminderRecord(reminders, employee.id, normalizedDoj, "missed-onboarding") && !force) {
    return { skipped: true, reason: "already-sent", doj: normalizedDoj, daysUntil };
  }

  await sendSmtpMail(settings, buildMissedOnboardingReminderEmail(employee, normalizedDoj, daysOverdue));
  const record = {
    employeeId: employee.id,
    candidateName: employee.name,
    email: employee.email,
    doj: normalizedDoj,
    reminderType: "missed-onboarding",
    daysOverdue,
    sentAt: new Date().toISOString(),
    deliveryStatus: "sent",
    source
  };
  appendJsonRecord(dojReminderPath, record);
  return { sent: true, record, daysUntil, daysOverdue };
}

async function runDojReminderScheduler() {
  if (dojReminderSchedulerRunning) return;
  dojReminderSchedulerRunning = true;
  try {
    const settings = readJsonFile(emailSettingsPath, null);
    if (!hasSmtpSettings(settings)) return;
    const employees = readEmployeesSheet();
    for (const employee of employees) {
      if (employee.offerStatus !== "accepted" || employee.candidateAccessRevoked || isEmployeeOnboarded(employee)) continue;
      try {
        await sendDojReminderEmail(employee, { source: "automatic", force: false });
      } catch (error) {
        console.warn(`DOJ reminder for ${employee.email || employee.id}: ${error.message}`);
      }
      try {
        await sendMissedOnboardingReminderEmail(employee, { source: "automatic", force: false });
      } catch (error) {
        console.warn(`Missed onboarding reminder for ${employee.email || employee.id}: ${error.message}`);
      }
    }
  } catch (error) {
    console.warn(`DOJ reminder scheduler: ${error.message}`);
  } finally {
    dojReminderSchedulerRunning = false;
  }
}

function serveFile(request, response) {
  const cleanUrl = request.url.split("?")[0];
  const loginRoutes = {
    "/candidate-login": "/index.html?login=candidate",
    "/admin-login": "/index.html?login=admin"
  };
  if (loginRoutes[cleanUrl]) {
    response.writeHead(302, { Location: loginRoutes[cleanUrl] });
    response.end();
    return;
  }

  const requestPath = request.url === "/" ? "/index.html" : cleanUrl;
  const resolvedPath = path.normalize(path.join(root, requestPath));

  if (!resolvedPath.startsWith(root)) {
    send(response, 403, "Forbidden", "text/plain; charset=utf-8");
    return;
  }

  fs.readFile(resolvedPath, (error, content) => {
    if (error) {
      send(response, 404, "Not found", "text/plain; charset=utf-8");
      return;
    }

    send(response, 200, content, contentTypes[path.extname(resolvedPath)] || "application/octet-stream");
  });
}

function canonicalExtractDocumentId(documentId) {
  const aliases = {
    aadhar: "Aadhar",
    pan: "Pan",
    uan: "UAN",
    bank: "Bank Details",
    education10: "10th Education Certificate",
    education12: "12th Education Certificate"
  };
  return aliases[String(documentId || "")] || documentId;
}

function extractFieldKeys(documentId) {
  const fields = {
    Aadhar: ["aadharNumber"],
    Pan: ["panNumber"],
    UAN: ["uanNumber"],
    "Bank Details": ["accountHolderName", "bankName", "accountNumber", "ifscCode"],
    "Address Proof": ["addressLine"],
    "10th Education Certificate": ["secondaryschoolname", "secondaryschoolyearofpassing"],
    "12th Education Certificate": ["highersecondaryschoolname", "highersecondaryschoolyearofpassing"],
    "Graduation Certificate": ["institutionName", "degree", "yearOfPassing"],
    "Post Graduation Certificate": ["institutionName", "degree", "yearOfPassing"],
    "Current Employer Details": ["employerName", "designation"],
    "Experience Letters": ["previousEmployerName", "lastDesignation"]
  };
  return fields[canonicalExtractDocumentId(documentId)] || [];
}

function parseJsonObject(text) {
  const raw = String(text || "").trim();
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : raw;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("AI did not return readable details");
  return JSON.parse(candidate.slice(start, end + 1));
}

function pickExtractedFields(parsed, keys) {
  const fields = {};
  keys.forEach((key) => {
    const value = parsed && typeof parsed === "object" ? parsed[key] : "";
    fields[key] = value == null ? "" : String(value).trim();
  });
  return fields;
}

function extractPrompt(documentId, fileName, keys) {
  return [
    `Extract details from this uploaded onboarding document: ${documentId} (${fileName}).`,
    `Return JSON only with these exact keys: ${keys.join(", ")}.`,
    "Use an empty string when a value is not clearly visible. Do not invent numbers or names.",
    "Aadhaar: 12 digits. PAN: ABCDE1234F. UAN: 12 digits. IFSC: 11 characters."
  ].join(" ");
}

function responsesOutputText(payload) {
  if (payload?.output_text) return payload.output_text;
  const parts = [];
  for (const item of payload?.output || []) {
    for (const part of item.content || []) {
      if (part.type === "output_text" && part.text) parts.push(part.text);
    }
  }
  return parts.join("\n");
}

function openaiApiKey() {
  return String(process.env.OPENAI_API_KEY || process.env.OPENAI_KEY || "").trim();
}

async function extractWithOpenAi(buffer, { documentId, fileName, mimeType, keys }) {
  const apiKey = openaiApiKey();
  if (!apiKey) return null;
  const mime = String(mimeType || "").toLowerCase();
  const dataUrl = `data:${mime || "application/octet-stream"};base64,${buffer.toString("base64")}`;
  const isPdf = mime.includes("pdf") || /\.pdf$/i.test(fileName);
  const isImage = mime.startsWith("image/");
  if (!isPdf && !isImage) throw new Error("AI extract supports images and PDFs only");
  const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";
  const content = [
    { type: "input_text", text: extractPrompt(documentId, fileName, keys) }
  ];
  if (isImage) content.push({ type: "input_image", image_url: dataUrl });
  else content.push({ type: "input_file", filename: fileName || "document.pdf", file_data: dataUrl });

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      input: [{ role: "user", content }],
      text: { format: { type: "json_object" } }
    })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (isImage) {
      const chat = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model,
          response_format: { type: "json_object" },
          messages: [{
            role: "user",
            content: [
              { type: "text", text: extractPrompt(documentId, fileName, keys) },
              { type: "image_url", image_url: { url: dataUrl } }
            ]
          }]
        })
      });
      const chatPayload = await chat.json().catch(() => ({}));
      if (!chat.ok) {
        throw new Error(chatPayload.error?.message || payload.error?.message || `OpenAI extract failed (${response.status})`);
      }
      return pickExtractedFields(parseJsonObject(chatPayload.choices?.[0]?.message?.content || ""), keys);
    }
    throw new Error(payload.error?.message || `OpenAI extract failed (${response.status})`);
  }
  return pickExtractedFields(parseJsonObject(responsesOutputText(payload)), keys);
}

function ollamaBaseUrl() {
  return String(process.env.OLLAMA_URL || "http://localhost:11434").replace(/\/$/, "");
}

function ollamaVisionModel() {
  return String(process.env.OLLAMA_VISION_MODEL || "llama3.2-vision").trim() || "llama3.2-vision";
}

function ollamaTextModel() {
  return String(process.env.OLLAMA_MODEL || "llama3.2").trim() || "llama3.2";
}

function documentAiProvider() {
  return String(process.env.DOCUMENT_AI_PROVIDER || process.env.AI_PROVIDER || "ollama").trim().toLowerCase();
}

function extractTextFromPdf(buffer) {
  const raw = buffer.toString("latin1");
  const parts = [];
  const re = /\((?:\\.|[^\\)]){2,}\)/g;
  let match;
  while ((match = re.exec(raw))) {
    const text = match[0].slice(1, -1)
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "")
      .replace(/\\\(/g, "(")
      .replace(/\\\)/g, ")")
      .replace(/\\\\/g, "\\");
    if (/[A-Za-z0-9]/.test(text)) parts.push(text);
  }
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

async function ollamaChat(messages, model, keys) {
  const response = await fetch(`${ollamaBaseUrl()}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      stream: false,
      format: "json",
      messages
    })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const missing = /not found|pull/i.test(String(payload.error || ""));
    throw new Error(
      missing
        ? `Ollama model missing. In a terminal run: ollama pull ${model}`
        : (payload.error || `Ollama extract failed (${response.status})`)
    );
  }
  return pickExtractedFields(parseJsonObject(payload.message?.content || payload.response || ""), keys);
}

async function extractWithOllama(buffer, { documentId, fileName, mimeType, keys }) {
  const mime = String(mimeType || "").toLowerCase();
  const isPdf = mime.includes("pdf") || /\.pdf$/i.test(fileName);
  const isImage = mime.startsWith("image/");
  if (!isPdf && !isImage) throw new Error("Ollama extract supports images and PDFs only");
  const prompt = extractPrompt(documentId, fileName, keys);
  if (isImage) {
    return ollamaChat([{
      role: "user",
      content: prompt,
      images: [buffer.toString("base64")]
    }], ollamaVisionModel(), keys);
  }
  const pdfText = extractTextFromPdf(buffer);
  if (pdfText.length >= 40) {
    return ollamaChat([{
      role: "user",
      content: `${prompt}\n\nDocument text:\n${pdfText.slice(0, 8000)}`
    }], ollamaTextModel(), keys);
  }
  throw new Error("This PDF looks like a scan. Upload a JPG/PNG photo so Ollama vision can read it");
}

async function extractDocumentFields(buffer, options) {
  const errors = [];
  const preferOllama = documentAiProvider() !== "openai";
  const steps = preferOllama
    ? [() => extractWithOllama(buffer, options), () => extractWithOpenAi(buffer, options)]
    : [() => extractWithOpenAi(buffer, options), () => extractWithOllama(buffer, options)];
  for (const step of steps) {
    try {
      const fields = await step();
      if (fields) return fields;
    } catch (error) {
      const message = String(error.message || "extract failed");
      errors.push(message === "fetch failed" ? "Ollama is not running. Open the Ollama app on this PC." : message);
    }
  }
  throw new Error(errors[0] || "Could not auto-read this document");
}

function isVinceptApiPath(pathname) {
  const pathOnly = String(pathname || "").split("?")[0];
  return (
    pathOnly === "/api/employees" ||
    pathOnly === "/api/offer-letter" ||
    pathOnly === "/api/email-settings" ||
    pathOnly === "/api/candidate-invite" ||
    pathOnly === "/api/doj-reminders" ||
    pathOnly === "/api/doj-reminders/send" ||
    pathOnly === "/api/profile-photo" ||
    pathOnly === "/api/documents/upload" ||
    pathOnly === "/api/documents/finalize" ||
    pathOnly === "/api/hr-pulse/admin-access" ||
    pathOnly.startsWith("/api/documents/") ||
    pathOnly.startsWith("/api/profile-photo")
  );
}

async function handleVinceptRequest(request, response, options = {}) {
  const embedded = Boolean(options.embedded);
  const cleanRequestUrl = request.url.split("?")[0];

  if (cleanRequestUrl === "/api/profile-photo" && request.method === "POST") {
    try {
      const requestUrl = new URL(request.url, localUrl);
      const employeeId = safePathPart(requestUrl.searchParams.get("employeeId"), "employee");
      const requestedName = requestUrl.searchParams.get("fileName") || "profile.jpg";
      const requestedExtension = path.extname(requestedName).toLowerCase();
      const extension = [".png", ".jpg", ".jpeg", ".webp"].includes(requestedExtension)
        ? requestedExtension
        : ".jpg";
      const content = await readBinaryBody(request);
      if (!content.length) throw new Error("The profile picture is empty");

      fs.mkdirSync(profilePhotosDir, { recursive: true });
      for (const entry of fs.readdirSync(profilePhotosDir)) {
        if (entry.startsWith(`${employeeId}.`)) fs.unlinkSync(path.join(profilePhotosDir, entry));
      }
      fs.writeFileSync(path.join(profilePhotosDir, `${employeeId}${extension}`), content);
      send(response, 200, JSON.stringify({
        ok: true,
        photoUrl: `/api/profile-photo?employeeId=${encodeURIComponent(employeeId)}`
      }));
    } catch (error) {
      send(response, 400, JSON.stringify({ ok: false, error: error.message }));
    }
    return;
  }

  if (cleanRequestUrl === "/api/profile-photo" && request.method === "GET") {
    try {
      const requestUrl = new URL(request.url, localUrl);
      const employeeId = safePathPart(requestUrl.searchParams.get("employeeId"), "employee");
      const entry = fs.existsSync(profilePhotosDir)
        ? fs.readdirSync(profilePhotosDir).find((name) => name.startsWith(`${employeeId}.`))
        : null;
      if (!entry) {
        send(response, 404, "Profile picture not found", "text/plain; charset=utf-8");
        return;
      }
      const filePath = path.join(profilePhotosDir, entry);
      send(
        response,
        200,
        fs.readFileSync(filePath),
        contentTypes[path.extname(entry).toLowerCase()] || "application/octet-stream"
      );
    } catch (error) {
      send(response, 404, error.message, "text/plain; charset=utf-8");
    }
    return;
  }

  if (cleanRequestUrl === "/api/documents/upload" && request.method === "POST") {
    try {
      const requestUrl = new URL(request.url, localUrl);
      const employeeId = requestUrl.searchParams.get("employeeId");
      const documentId = requestUrl.searchParams.get("documentId");
      const fileName = requestUrl.searchParams.get("fileName");
      if (!employeeId || !documentId || !fileName) throw new Error("Missing upload details");

      const content = await readBinaryBody(request);
      if (!content.length) throw new Error("The uploaded file is empty");

      const filePath = pendingDocumentPath(
        employeeId,
        documentId,
        fileName,
        requestUrl.searchParams.get("companyId") || "",
        requestUrl.searchParams.get("employeeName") || ""
      );
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, content);
      send(response, 200, JSON.stringify({ ok: true, saved: true, fileName: path.basename(filePath) }));
    } catch (error) {
      send(response, 400, JSON.stringify({ ok: false, error: error.message }));
    }
    return;
  }

  if (cleanRequestUrl === "/api/documents/extract" && request.method === "POST") {
    try {
      const requestUrl = new URL(request.url, localUrl);
      const documentId = requestUrl.searchParams.get("documentId") || "";
      const fileName = requestUrl.searchParams.get("fileName") || "document";
      const mimeType = requestUrl.searchParams.get("mimeType") || request.headers["content-type"] || "";
      const keys = extractFieldKeys(documentId);
      if (!keys.length) {
        send(response, 200, JSON.stringify({ ok: false, error: "No detail fields for this document" }));
        return;
      }
      const content = await readBinaryBody(request, 8 * 1024 * 1024);
      if (!content.length) throw new Error("The uploaded file is empty");
      const fields = await extractDocumentFields(content, {
        documentId: canonicalExtractDocumentId(documentId),
        fileName,
        mimeType,
        keys
      });
      send(response, 200, JSON.stringify({ ok: true, fields }));
    } catch (error) {
      send(response, 400, JSON.stringify({ ok: false, error: error.message }));
    }
    return;
  }

  if (cleanRequestUrl === "/api/documents/list" && request.method === "GET") {
    try {
      const requestUrl = new URL(request.url, localUrl);
      const employeeId = requestUrl.searchParams.get("employeeId") || "";
      const email = requestUrl.searchParams.get("email") || "";
      const employeeCode = requestUrl.searchParams.get("employeeCode") || "";
      if (!String(employeeId).trim() && !String(email).trim() && !String(employeeCode).trim()) {
        throw new Error("Missing employee lookup");
      }
      const employee = findOnboardingRecord({ employeeId, email, employeeCode }) || {
        id: employeeId,
        name: "",
        companyId: "",
        employment: { employeeCode }
      };
      const extraIds = [employeeId, employeeCode, employee.id, employee.employment?.employeeCode].filter(Boolean);
      send(response, 200, JSON.stringify({
        ok: true,
        employeeId: employee.id || employeeId,
        files: listOnboardingDocumentFiles(employee, extraIds)
      }));
    } catch (error) {
      send(response, 400, JSON.stringify({ ok: false, error: error.message, files: [] }));
    }
    return;
  }

  if (cleanRequestUrl === "/api/documents/file" && request.method === "GET") {
    try {
      const requestUrl = new URL(request.url, localUrl);
      const employeeId = requestUrl.searchParams.get("employeeId") || "";
      const email = requestUrl.searchParams.get("email") || "";
      const employeeCode = requestUrl.searchParams.get("employeeCode") || "";
      const storedName = requestUrl.searchParams.get("storedName") || "";
      if (!String(employeeId).trim() && !String(email).trim() && !String(employeeCode).trim()) {
        throw new Error("Missing employee lookup");
      }
      if (!storedName) throw new Error("Missing document file name");
      const employee = findOnboardingRecord({ employeeId, email, employeeCode }) || {
        id: employeeId,
        name: "",
        companyId: "",
        employment: { employeeCode }
      };
      const extraIds = [employeeId, employeeCode, employee.id, employee.employment?.employeeCode].filter(Boolean);
      const filePath = onboardingDocumentFilePath(employee, storedName, extraIds);
      if (!filePath) {
        send(response, 404, "Document not found", "text/plain; charset=utf-8");
        return;
      }
      const storedBase = path.basename(filePath);
      const dash = storedBase.indexOf(" - ");
      const downloadName = dash > 0 ? storedBase.slice(dash + 3) : storedBase;
      const download = requestUrl.searchParams.get("download") === "1";
      response.writeHead(200, {
        "Content-Type": contentTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream",
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${String(downloadName).replace(/["\r\n]/g, "_")}"`,
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        "Pragma": "no-cache"
      });
      response.end(fs.readFileSync(filePath));
    } catch (error) {
      send(response, 400, error.message, "text/plain; charset=utf-8");
    }
    return;
  }

  if (cleanRequestUrl === "/api/documents/finalize" && request.method === "POST") {
    try {
      const body = JSON.parse(await readBody(request));
      const employeeId = safePathPart(body.employeeId, "employee");
      const employeeName = safePathPart(body.employeeName, "Employee");
      const store = readEmployeesStore();
      const savedEmployee = store.records.find((employee) => employee.id === body.employeeId)
        || readEmployeesSheet().find((employee) => employee.id === body.employeeId);
      const documents = Array.isArray(store.documents) && store.documents.length
        ? store.documents
        : (Array.isArray(body.documents) ? body.documents : []);
      const uploads = {
        ...(store.uploadsByEmployee?.[body.employeeId] || {}),
        ...(body.uploads || {})
      };
      const reviews = {
        ...(store.reviewsByEmployee?.[body.employeeId] || {}),
        ...(body.reviews || {})
      };
      const employment = {
        ...(savedEmployee?.employment || {}),
        ...(body.employeeEmployment || {})
      };
      if (body.employeeCode) employment.employeeCode = body.employeeCode;
      if (body.employeeEmail) employment.officialEmail = String(body.employeeEmail).trim().toLowerCase();
      const pulseEmail = employment.officialEmail || body.employeeEmail;
      const employeeForGates = {
        ...savedEmployee,
        offerAccepted: body.offerAccepted ?? savedEmployee?.offerAccepted,
        offerStatus: body.offerStatus || savedEmployee?.offerStatus
          || ((body.offerAccepted ?? savedEmployee?.offerAccepted) ? "accepted" : "pending"),
        personalInfoCompleted: body.personalInfoCompleted ?? savedEmployee?.personalInfoCompleted,
        medicalCoverageCompleted: body.medicalCoverageCompleted ?? savedEmployee?.medicalCoverageCompleted,
        bgvStatus: body.bgvStatus || savedEmployee?.bgvStatus || "pending",
        experienceLevel: body.experienceLevel || savedEmployee?.experienceLevel || "experienced",
        hasInternship: body.hasInternship ?? savedEmployee?.hasInternship,
        candidateAccessRevoked: body.candidateAccessRevoked ?? savedEmployee?.candidateAccessRevoked
      };
      const missing = getFinalizeBlockers({
        employee: employeeForGates,
        uploads,
        reviews,
        documents,
        employment,
        pulseEmail
      });
      if (missing.length) {
        send(response, 200, JSON.stringify({
          ok: true,
          onboarded: false,
          reason: "requirements-not-met",
          missing
        }));
        return;
      }

      const companyId = body.employeeCompanyId || savedEmployee?.companyId || PORTAL_COMPANIES[0].id;
      const company = companyById(companyId);
      const employeeFolder = employeeDocumentFolder(
        body.employeeId || employeeId,
        body.employeeName || employeeName,
        companyId
      );
      if (!fs.existsSync(employeeFolder)) throw new Error("Uploaded document files are not available on the backend");
      fs.mkdirSync(employeeFolder, { recursive: true });
      const onboardingStatus = writeOnboardingStatus(
        employeeFolder,
        body.employeeId || employeeId,
        body.employeeName || employeeName,
        `${company.code} - ${company.name}`
      );
      const tempPassword = String(body.employeePassword || "").trim() || generatePulseTempPassword();
      const hrPulsePath = upsertHrPulseEmployee({
        employeeId: body.employeeId || employeeId,
        employeeCode: employment.employeeCode,
        name: body.employeeName || employeeName,
        email: String(pulseEmail).trim().toLowerCase(),
        department: body.employeeDepartment || employment.department || savedEmployee?.department,
        role: body.employeeRole || employment.designation || savedEmployee?.role,
        location: body.employeeLocation || employment.location || savedEmployee?.location || "",
        employment,
        companyId: resolveCompanyId(body.employeeCompanyId || savedEmployee?.companyId || PORTAL_COMPANIES[0].id),
        companyName: body.employeeCompanyName || savedEmployee?.companyName || "",
        onboardedAt: new Date().toISOString(),
        tempPassword
      });

      send(response, 200, JSON.stringify({
        ok: true,
        onboarded: true,
        folderPath: employeeFolder,
        statusPath: onboardingStatus.path,
        statusFallback: onboardingStatus.fallback,
        hrPulseSynced: true,
        hrPulsePath,
        tempPassword
      }));
    } catch (error) {
      send(response, 400, JSON.stringify({ ok: false, onboarded: false, error: error.message }));
    }
    return;
  }

  if (cleanRequestUrl === "/api/employees" && request.method === "GET") {
    const store = readEmployeesStore();
    send(response, 200, JSON.stringify({
      saved: Boolean(store.records.length),
      records: store.records,
      uploadsByEmployee: store.uploadsByEmployee,
      reviewsByEmployee: store.reviewsByEmployee,
      sheetPath: employeesSheetPath,
      storage: "sqlite",
      sqlitePath: sqliteDbPath
    }));
    return;
  }

  if (cleanRequestUrl === "/api/hr-pulse/admin-access" && request.method === "POST") {
    try {
      const body = JSON.parse(await readBody(request));
      const accessPath = upsertHrPulseAdmin(body);
      send(response, 200, JSON.stringify({ ok: true, synced: true, path: accessPath }));
    } catch (error) {
      send(response, 400, JSON.stringify({ ok: false, error: error.message }));
    }
    return;
  }

  if (cleanRequestUrl === "/api/employees" && request.method === "POST") {
    try {
      const body = await readBody(request);
      const employeeData = JSON.parse(body);
      const records = Array.isArray(employeeData.records) ? employeeData.records : [];
      const documents = Array.isArray(employeeData.documents) ? employeeData.documents : [];
      const uploadsByEmployee = employeeData.uploadsByEmployee || {};
      const reviewsByEmployee = employeeData.reviewsByEmployee || {};
      writeEmployees(records, { documents, uploadsByEmployee, reviewsByEmployee });
      send(response, 200, JSON.stringify({
        ok: true,
        records: records.length,
        documentRows: records.length * documents.length,
        sheetPath: employeesSheetPath,
        storage: "sqlite",
        sqlitePath: sqliteDbPath,
        allEntitiesPath: path.join(laptopDocumentsRoot, "All Entities.xls"),
        companySheets: PORTAL_COMPANIES.map((company) => ({
          id: company.id,
          code: company.code,
          path: path.join(companyDocumentRoot(company.id), `${company.code}.xls`)
        }))
      }));
    } catch (error) {
      send(response, 400, JSON.stringify({ ok: false, error: error.message }));
    }
    return;
  }

  if (request.url === "/api/offer-letter" && request.method === "GET") {
    const offer = readJsonFile(offerPath, null);
    if (!offer) {
      send(response, 200, JSON.stringify({ saved: false, offer: null, storage: "sqlite", sqlitePath: sqliteDbPath }));
      return;
    }
    send(response, 200, JSON.stringify({ saved: true, offer, storage: "sqlite", sqlitePath: sqliteDbPath }));
    return;
  }

  if (request.url === "/api/offer-letter" && request.method === "POST") {
    try {
      const body = await readBody(request);
      const offer = { ...JSON.parse(body), savedAt: new Date().toISOString() };
      writeJsonFile(offerPath, offer);
      send(response, 200, JSON.stringify({ ok: true, path: offerPath, storage: "sqlite", sqlitePath: sqliteDbPath }));
    } catch (error) {
      send(response, 400, JSON.stringify({ ok: false, error: error.message }));
    }
    return;
  }

  if (request.url === "/api/email-settings" && request.method === "GET") {
    const settings = readJsonFile(emailSettingsPath, null);
    if (!settings) {
      send(response, 200, JSON.stringify({ saved: false, settings: null }));
      return;
    }
    send(response, 200, JSON.stringify({
      saved: true,
      settings: { ...settings, smtpPass: "" }
    }));
    return;
  }

  if (cleanRequestUrl === "/api/doj-reminders" && request.method === "GET") {
    const settings = readJsonFile(emailSettingsPath, null);
    send(response, 200, JSON.stringify({
      ok: true,
      records: readJsonFile(dojReminderPath, []),
      emailConnected: hasSmtpSettings(settings)
    }));
    return;
  }

  if (cleanRequestUrl === "/api/doj-reminders/send" && request.method === "POST") {
    try {
      const body = JSON.parse(await readBody(request) || "{}");
      const employeeId = body.employeeId || body.employee?.id;
      if (!employeeId) throw new Error("employeeId is required");

      const sheetEmployee = readEmployeesSheet().find((employee) => employee.id === employeeId) || {};
      const employee = {
        ...sheetEmployee,
        ...(body.employee || {}),
        id: employeeId
      };
      if (!employee.email && !employee.name) {
        throw new Error("Candidate was not found.");
      }

      const result = await sendDojReminderEmail(employee, {
        force: Boolean(body.force),
        source: "manual"
      });
      if (result.skipped) {
        send(response, 200, JSON.stringify({
          ok: true,
          sent: false,
          skipped: true,
          reason: result.reason,
          doj: result.doj,
          emailConnected: true
        }));
        return;
      }
      send(response, 200, JSON.stringify({
        ok: true,
        sent: true,
        record: result.record,
        emailConnected: true
      }));
    } catch (error) {
      send(response, 400, JSON.stringify({ ok: false, error: error.message }));
    }
    return;
  }

  if (request.url === "/api/email-settings" && request.method === "POST") {
    try {
      const body = await readBody(request);
      const settings = JSON.parse(body);
      const existingSettings = readJsonFile(emailSettingsPath, {});
      const merged = normalizeSmtpSettings({
        ...existingSettings,
        ...settings,
        smtpPass: settings.smtpPass || existingSettings.smtpPass || "",
        savedAt: new Date().toISOString()
      });
      writeJsonFile(emailSettingsPath, merged);
      setImmediate(runDojReminderScheduler);
      send(response, 200, JSON.stringify({ ok: true, connected: true, path: emailSettingsPath }));
    } catch (error) {
      send(response, 400, JSON.stringify({ ok: false, error: error.message }));
    }
    return;
  }

  if (request.url === "/api/candidate-invite" && request.method === "POST") {
    try {
      const body = await readBody(request);
      const invite = JSON.parse(body);
      if (!invite?.to) throw new Error("Invite recipient email is missing.");
      const settings = normalizeSmtpSettings(readJsonFile(emailSettingsPath, null) || {});
      if (hasSmtpSettings(settings)) {
        await sendSmtpMail(settings, invite);
        const inviteLog = appendJsonRecord(candidateInvitePath, {
          ...invite,
          sentAt: new Date().toISOString(),
          fromEmail: settings.senderEmail,
          deliveryStatus: "sent"
        });
        send(response, 200, JSON.stringify({
          ok: true,
          sent: true,
          queued: false,
          fromEmail: settings.senderEmail,
          path: inviteLog.path,
          fallbackLog: inviteLog.fallback
        }));
        return;
      }

      const inviteLog = appendJsonRecord(candidateInvitePath, {
        ...invite,
        queuedAt: new Date().toISOString(),
        deliveryStatus: "queued"
      });
      send(response, 200, JSON.stringify({
        ok: true,
        sent: false,
        queued: true,
        path: inviteLog.path,
        fallbackLog: inviteLog.fallback
      }));
    } catch (error) {
      send(response, 400, JSON.stringify({ ok: false, error: error.message }));
    }
    return true;
  }

  if (embedded) return false;
  serveFile(request, response);
  return true;
}

function openBrowser(url) {
  if (process.env.OPEN_BROWSER === "0" || embeddedOnly) return;
  const command = process.platform === "win32"
    ? `rundll32 url.dll,FileProtocolHandler ${url}`
    : process.platform === "darwin"
      ? `open ${url}`
      : `xdg-open ${url}`;
  childProcess.exec(command, () => {});
}

let vinceptBootstrapped = false;
function bootstrapVincept() {
  if (vinceptBootstrapped) return { dataDir, sqliteDbPath, publicOrigin, root };
  migrateLegacyDocumentFolders();
  normalizeCandidateFolderNames();
  initSqliteStore();
  runDojReminderScheduler();
  setInterval(runDojReminderScheduler, 60 * 60 * 1000).unref();
  vinceptBootstrapped = true;
  return { dataDir, sqliteDbPath, publicOrigin, root };
}

function createVinceptMount(options = {}) {
  bootstrapVincept();
  const urlPrefix = String(options.urlPrefix || "/onboarding").replace(/\/$/, "") || "/onboarding";
  return {
    urlPrefix,
    root,
    dataDir,
    sqliteDbPath,
    publicOrigin,
    isApiPath: isVinceptApiPath,
    async handleApi(request, response) {
      return handleVinceptRequest(request, response, { embedded: true });
    },
    async handle(request, response) {
      return handleVinceptRequest(request, response, { embedded: true });
    }
  };
}

if (require.main === module && !embeddedOnly) {
  bootstrapVincept();
  const server = http.createServer(async (request, response) => {
    await handleVinceptRequest(request, response, { embedded: false });
  });
  server.listen(port, "127.0.0.1", () => {
    console.log(`V-Incept portal running at ${localUrl}`);
    console.log(`Portal storage: SQLite -> ${sqliteDbPath}`);
    openBrowser(localUrl);
  });
  module.exports = server;
} else {
  module.exports = {
    bootstrapVincept,
    createVinceptMount,
    handleVinceptRequest,
    isVinceptApiPath,
    root,
    dataDir,
    sqliteDbPath,
    publicOrigin
  };
}
