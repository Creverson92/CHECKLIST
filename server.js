const crypto = require("crypto");
const fs = require("fs");
const https = require("https");
const http = require("http");
const path = require("path");

const port = process.env.PORT || 10000;
const indexPath = path.join(__dirname, "index.html");
const dataDir = process.env.DATA_DIR || path.join(__dirname, "data");
const reportsPath = path.join(dataDir, "reports.json");
const usersPath = path.join(dataDir, "users.json");
const routesPath = path.join(dataDir, "routes.json");
const locationsPath = path.join(dataDir, "locations.json");
const publicFiles = {
  "/manifest.json": { path: path.join(__dirname, "manifest.json"), type: "application/manifest+json" },
  "/icon.svg": { path: path.join(__dirname, "icon.svg"), type: "image/svg+xml" },
  "/logo-normal.webp": { path: path.join(__dirname, "logo-normal.webp"), type: "image/webp" }
};
const logoPath = path.join(__dirname, "logo-normal.webp");
const sessions = new Map();
const databaseUrl = process.env.DATABASE_URL || "";
const runningOnRender = process.env.RENDER === "true";
const requireDatabaseForReports = process.env.REQUIRE_DATABASE_FOR_REPORTS === "true" || runningOnRender;
const cloudinaryConfig = {
  cloudName: process.env.CLOUDINARY_CLOUD_NAME || "",
  apiKey: process.env.CLOUDINARY_API_KEY || "",
  apiSecret: process.env.CLOUDINARY_API_SECRET || "",
  folder: process.env.CLOUDINARY_FOLDER || "unico-checklist"
};
let pgPool = null;
let reportTableReady = null;
let PDFDocument = null;
let sharpImage = null;

function reportDatabaseRequired() {
  return requireDatabaseForReports;
}

function storageStatus() {
  return {
    cloudinaryConfigured: cloudinaryReady(),
    databaseConfigured: Boolean(databaseUrl),
    runningOnRender,
    reportsRequireDatabase: reportDatabaseRequired(),
    reportsPermanent: Boolean(databaseUrl),
    message: databaseUrl
      ? "Historico permanente conectado."
      : "Historico permanente desconectado. Configure DATABASE_URL no Render; Cloudinary salva apenas fotos e assinaturas."
  };
}

function getPdfDocument() {
  if (PDFDocument) return PDFDocument;
  try {
    PDFDocument = require("pdfkit");
    return PDFDocument;
  } catch (error) {
    console.error("PDFKit nao esta disponivel:", error.message);
    return null;
  }
}

function getSharp() {
  if (sharpImage) return sharpImage;
  try {
    sharpImage = require("sharp");
    return sharpImage;
  } catch (error) {
    console.error("Sharp nao esta disponivel:", error.message);
    return null;
  }
}

function databaseSslConfig() {
  if (!databaseUrl || /localhost|127\.0\.0\.1/i.test(databaseUrl)) return false;
  return { rejectUnauthorized: false };
}

function getPgPool() {
  if (!databaseUrl) return null;
  if (pgPool) return pgPool;
  try {
    const { Pool } = require("pg");
    pgPool = new Pool({
      connectionString: databaseUrl,
      ssl: databaseSslConfig(),
      max: 5
    });
    pgPool.on("error", error => {
      console.error("Erro no banco de dados do historico:", error.message);
    });
    return pgPool;
  } catch (error) {
    console.error("DATABASE_URL foi configurado, mas o pacote pg nao esta disponivel:", error.message);
    return null;
  }
}

async function ensureReportTable() {
  const pool = getPgPool();
  if (!pool) return false;
  if (!reportTableReady) {
    reportTableReady = pool.query(`
      CREATE TABLE IF NOT EXISTS checklist_reports (
        id TEXT PRIMARY KEY,
        report JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
  }
  await reportTableReady;
  return true;
}

const seedUsers = [
  {
    username: process.env.ADMIN_USER || "Creverson",
    password: process.env.ADMIN_PASSWORD || "123456",
    passwordHash: process.env.ADMIN_PASSWORD_HASH,
    role: "admin",
    name: process.env.ADMIN_NAME || "Creverson"
  },
  {
    username: process.env.APP_USER || "Anderson",
    password: process.env.APP_PASSWORD || "123456",
    passwordHash: process.env.APP_PASSWORD_HASH,
    role: "app",
    name: process.env.APP_NAME || "Anderson"
  }
];

const seedLocations = [
  { id: 1, name: "Unico Logistica - Matriz", type: "Matriz", address: "Rodovia Fernao Dias, Pouso Alegre-MG" },
  { id: 2, name: "Unico Logistica - Filial Pouso Alegre", type: "Filial", address: "Rod. JK BR 459, Pouso Alegre-MG" },
  { id: 3, name: "Unico Logistica - Filial Sao Paulo", type: "Filial", address: "Av. Brig. Faria Lima, Sao Paulo-SP" }
];

const seedRoutes = [
  {
    id: "recebimento-verallia",
    title: "RECEBIMENTO VERALLIA",
    description: "Checklist de Recebimento Verallia",
    locationIds: [1, 2],
    items: [
      {
        id: 1783373459888,
        type: "number",
        title: "NOTA FISCAL:",
        support: "",
        min: "",
        max: "",
        observations: true,
        evidence: false,
        required: true,
        mediaMode: "camera",
        evidenceMode: "both",
        options: []
      },
      {
        id: 1783373531014,
        type: "text",
        title: "NOME COMPLETO DO MOTORISTA:",
        support: "",
        min: "",
        max: "",
        observations: true,
        evidence: false,
        required: true,
        mediaMode: "camera",
        evidenceMode: "both",
        options: []
      },
      {
        id: 1783373556622,
        type: "media",
        title: "PLACAS DO VEÍCULO:",
        support: "",
        min: "1",
        max: "5",
        observations: true,
        evidence: true,
        required: true,
        mediaMode: "both",
        evidenceMode: "both",
        options: []
      },
      {
        id: 1783373649132,
        type: "text",
        title: "TRANSPORTADORA:",
        support: "",
        min: "",
        max: "",
        observations: true,
        evidence: false,
        required: true,
        mediaMode: "camera",
        evidenceMode: "both",
        options: []
      },
      {
        id: 1783373675419,
        type: "signature",
        title: "ASSINATURA DO MOTORISTA:",
        support: "",
        min: "",
        max: "",
        observations: true,
        evidence: false,
        required: true,
        mediaMode: "camera",
        evidenceMode: "both",
        options: []
      },
      {
        id: 1783373712406,
        type: "media",
        title: "REGISTRE FOTOS LATERAIS DA CARGA COMPLETA:",
        support: "SE POSSÍVEL AINDA EM CIMA DO VEÍCULO",
        min: "2",
        max: "6",
        observations: true,
        evidence: true,
        required: true,
        mediaMode: "both",
        evidenceMode: "both",
        options: []
      },
      {
        id: 1783373770089,
        type: "media",
        title: "REGISTRE A MERCADORIA RECEBIDA:",
        support: "DE 2 EM 2 PALLETS",
        min: 1,
        max: 30,
        observations: true,
        evidence: true,
        required: true,
        mediaMode: "both",
        evidenceMode: "both",
        options: []
      },
      {
        id: 1783373805565,
        type: "positive",
        title: "PRODUTO POSSUI ALGUMA AVARIA?",
        support: "",
        min: "",
        max: "",
        observations: true,
        evidence: true,
        required: true,
        mediaMode: "camera",
        evidenceMode: "both",
        options: ["SIM", "NÃO"]
      },
      {
        id: 1783373835220,
        type: "number",
        title: "QUANTIDADE RECEBIDA: PALLETS OU PESO DA NF.",
        support: "",
        min: "",
        max: "",
        observations: true,
        evidence: false,
        required: true,
        mediaMode: "camera",
        evidenceMode: "both",
        options: []
      },
      {
        id: 1783373865533,
        type: "text",
        title: "OPERADOR DE EMPILHADEIRA:",
        support: "",
        min: "",
        max: "",
        observations: true,
        evidence: false,
        required: false,
        mediaMode: "camera",
        evidenceMode: "both",
        options: []
      },
      {
        id: 1783373888141,
        type: "text",
        title: "RESPONSÁVEL PELO CHECKLIST:",
        support: "",
        min: "",
        max: "",
        observations: true,
        evidence: false,
        required: true,
        mediaMode: "camera",
        evidenceMode: "both",
        options: []
      }
    ],
    updatedAt: "2026-07-06T21:38:19.752Z"
  },
  {
    id: "expedicao-verallia",
    title: "EXPEDIÇÃO VERALLIA",
    description: "Checklist para expedição da Verallia.",
    locationIds: [1, 2],
    items: [
      {
        id: 1783370738670,
        type: "text",
        title: "NOME COMPLETO DO MOTORISTA:",
        support: "",
        min: "",
        max: "",
        observations: true,
        evidence: false,
        required: false,
        mediaMode: "Camera",
        options: []
      },
      {
        id: 1783370773535,
        type: "text",
        title: "TRANSPORTADORA:",
        support: "",
        min: "",
        max: "",
        observations: true,
        evidence: true,
        required: false,
        mediaMode: "Camera",
        options: []
      },
      {
        id: 1783370799407,
        type: "text",
        title: "PLACA DO VEÍCULO:",
        support: "",
        min: "",
        max: "",
        observations: true,
        evidence: true,
        required: false,
        mediaMode: "Camera",
        options: []
      },
      {
        id: 1783371085638,
        type: "number",
        title: "NUMERO DA NF-E:",
        support: "",
        min: 1,
        max: 30,
        observations: true,
        evidence: true,
        required: false,
        mediaMode: "Camera",
        options: []
      },
      {
        id: 1783371104271,
        type: "number",
        title: "QUANTIDADE DE PALLETS CARREGADOS:",
        support: "",
        min: 1,
        max: 30,
        observations: true,
        evidence: true,
        required: false,
        mediaMode: "Camera",
        options: []
      },
      {
        id: 1783371151896,
        type: "media",
        title: "REGISTRE O CARREGAMENTO ANTES DA AMARRAÇÃO:",
        support: "FOTOS DE 2 EM 2 PALLETS.",
        min: "12",
        max: 30,
        observations: true,
        evidence: true,
        required: false,
        mediaMode: "Camera",
        options: []
      },
      {
        id: 1783371523135,
        type: "media",
        title: "REGISTRE FOTOS LATERAIS COM VEÍCULO TODO CARREGADO.",
        support: "AO MENOS UMA FOTO DE CADA LADO",
        min: 1,
        max: 30,
        observations: true,
        evidence: true,
        required: false,
        mediaMode: "Camera",
        options: []
      },
      {
        id: 1783371781807,
        type: "positive",
        title: "EXISTE ALGUMA AVARIA NAS GARRAFAS OU PALLETS QUEBRADOS?",
        support: "",
        min: "",
        max: "",
        observations: true,
        evidence: true,
        required: false,
        mediaMode: "Camera",
        options: ["SIM", "NÃO"]
      },
      {
        id: 1783371832423,
        type: "positive",
        title: "PALLETS COM FALTA DE CINTAS, SUJOS OU MOLHADOS?",
        support: "",
        min: "",
        max: "",
        observations: true,
        evidence: true,
        required: false,
        mediaMode: "Camera",
        options: ["SIM", "NÃO"]
      },
      {
        id: 1783371864328,
        type: "media",
        title: "REGISTRE A AMARRAÇÃO DO VEÍCULO COM CINTAS:",
        support: "FOTOS LATERAIS DA CARGA TODA AMARRADA E FOTO DO \"X\" NA TRASEIRA. ",
        min: "6",
        max: 30,
        observations: true,
        evidence: true,
        required: false,
        mediaMode: "Camera",
        options: []
      },
      {
        id: 1783371955567,
        type: "text",
        title: "OPERADOR DE EMPILHADEIRA:",
        support: "",
        min: "",
        max: "",
        observations: true,
        evidence: true,
        required: false,
        mediaMode: "Camera",
        options: []
      },
      {
        id: 1783371993399,
        type: "text",
        title: "RESPONSÁVEL PELO CHECKLIST:",
        support: "",
        min: "",
        max: "",
        observations: true,
        evidence: true,
        required: false,
        mediaMode: "Camera",
        options: []
      },
      {
        id: 1783372000743,
        type: "signature",
        title: "ASSINATURA DO MOTORISTA:",
        support: "Este check-list tem por objetivo assegurar que os clientes recebam as mercadorias em conformidade com o pedido. Portanto, qualquer dano que ocorra na mercadoria ou sua embalagem durante o transporte ou mesmo na descarga, é de responsabilidade do transportador. Acompanhei e estou de acordo com o carregamento, enlonamento e amarração efetuados em meu caminhão e a carga está em condições de transportar da ÚNICO Logística até o destino.",
        min: "",
        max: "",
        observations: true,
        evidence: false,
        required: false,
        mediaMode: "Camera",
        options: []
      }
    ],
    updatedAt: "2026-07-06T21:08:48.832Z"
  }
];

function cloneData(value) {
  return JSON.parse(JSON.stringify(value));
}

function cloudinaryReady() {
  return Boolean(cloudinaryConfig.cloudName && cloudinaryConfig.apiKey && cloudinaryConfig.apiSecret);
}

function isDataUrl(value) {
  return typeof value === "string" && /^data:image\/[a-z0-9.+-]+;base64,/i.test(value);
}

function safeCloudinaryPart(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "arquivo";
}

function signCloudinaryParams(params) {
  const payload = Object.keys(params)
    .filter(key => params[key] !== undefined && params[key] !== null && params[key] !== "")
    .sort()
    .map(key => `${key}=${params[key]}`)
    .join("&");
  return crypto.createHash("sha1").update(payload + cloudinaryConfig.apiSecret).digest("hex");
}

function cloudinaryUpload(dataUrl, options = {}) {
  if (!cloudinaryReady() || !isDataUrl(dataUrl)) return Promise.resolve(null);

  const timestamp = Math.floor(Date.now() / 1000);
  const uploadParams = {
    folder: options.folder,
    public_id: options.publicId,
    timestamp,
    overwrite: "true"
  };
  const signature = signCloudinaryParams(uploadParams);
  const form = new URLSearchParams({
    file: dataUrl,
    api_key: cloudinaryConfig.apiKey,
    signature,
    ...Object.fromEntries(Object.entries(uploadParams).map(([key, value]) => [key, String(value)]))
  }).toString();

  return new Promise((resolve, reject) => {
    const request = https.request({
      method: "POST",
      hostname: "api.cloudinary.com",
      path: `/v1_1/${encodeURIComponent(cloudinaryConfig.cloudName)}/image/upload`,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": Buffer.byteLength(form)
      }
    }, response => {
      let body = "";
      response.on("data", chunk => body += chunk);
      response.on("end", () => {
        let parsed = {};
        try {
          parsed = JSON.parse(body || "{}");
        } catch (error) {}

        if (response.statusCode >= 200 && response.statusCode < 300 && parsed.secure_url) {
          resolve({
            url: parsed.secure_url,
            secureUrl: parsed.secure_url,
            publicId: parsed.public_id,
            width: parsed.width,
            height: parsed.height,
            bytes: parsed.bytes,
            format: parsed.format,
            resourceType: parsed.resource_type,
            provider: "cloudinary"
          });
          return;
        }

        reject(new Error(parsed.error?.message || `Cloudinary retornou status ${response.statusCode}`));
      });
    });

    request.on("error", reject);
    request.write(form);
    request.end();
  });
}

async function uploadReportImages(report) {
  if (!cloudinaryReady()) return report;

  const next = cloneData(report);
  const answers = next.answers || {};
  const reportFolder = `${cloudinaryConfig.folder}/${safeCloudinaryPart(next.id)}`;
  let uploadIndex = 0;

  async function uploadPhoto(photo, prefix) {
    if (!photo || !isDataUrl(photo.url)) return photo;
    uploadIndex += 1;
    const uploaded = await cloudinaryUpload(photo.url, {
      folder: reportFolder,
      publicId: `${safeCloudinaryPart(prefix)}-${String(uploadIndex).padStart(3, "0")}`
    });
    if (!uploaded) return photo;
    return {
      ...photo,
      url: uploaded.secureUrl,
      cloudinaryUrl: uploaded.secureUrl,
      cloudinaryPublicId: uploaded.publicId,
      width: uploaded.width || photo.width,
      height: uploaded.height || photo.height,
      size: uploaded.bytes || photo.size,
      format: uploaded.format,
      provider: "cloudinary",
      quality: "original-cloudinary"
    };
  }

  for (const [answerId, answer] of Object.entries(answers)) {
    if (!answer || typeof answer !== "object") continue;
    if (Array.isArray(answer.photos)) {
      answer.photos = await Promise.all(answer.photos.map((photo, index) => uploadPhoto(photo, `pergunta-${answerId}-foto-${index + 1}`)));
    }
    if (Array.isArray(answer.evidencePhotos)) {
      answer.evidencePhotos = await Promise.all(answer.evidencePhotos.map((photo, index) => uploadPhoto(photo, `pergunta-${answerId}-evidencia-${index + 1}`)));
    }
    if (isDataUrl(answer.signatureUrl)) {
      const uploaded = await cloudinaryUpload(answer.signatureUrl, {
        folder: reportFolder,
        publicId: `pergunta-${safeCloudinaryPart(answerId)}-assinatura`
      });
      if (uploaded) {
        answer.signatureUrl = uploaded.secureUrl;
        answer.signatureCloudinaryPublicId = uploaded.publicId;
      }
    }
  }

  next.mediaProvider = "cloudinary";
  next.mediaUploadedAt = new Date().toISOString();
  return next;
}

function sendJson(response, status, body, headers = {}) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...headers
  });
  response.end(JSON.stringify(body));
}

function sendFileBuffer(response, status, buffer, headers = {}) {
  response.writeHead(status, headers);
  response.end(buffer);
}

function sanitizeFilename(value) {
  return String(value || "checklist")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90) || "checklist";
}

function textValue(value, fallback = "Nao informado") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function formatPdfAnswerValue(answer) {
  const value = answer?.value;
  if (Array.isArray(value)) return value.length ? value.join(", ") : "Nao informado";
  if (value === true) return "Assinado";
  if (value === false || value === undefined || value === null || value === "") return "Nao informado";
  return String(value);
}

function dataUrlToBuffer(value) {
  const match = String(value || "").match(/^data:([^;]+);base64,(.+)$/i);
  if (!match) return null;
  return Buffer.from(match[2], "base64");
}

function fetchRemoteBuffer(resourceUrl, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    if (redirectCount > 4) return reject(new Error("Redirecionamentos demais ao buscar imagem."));
    let parsed;
    try {
      parsed = new URL(resourceUrl);
    } catch (error) {
      return reject(error);
    }

    const transport = parsed.protocol === "https:" ? https : http;
    const request = transport.get(parsed, response => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume();
        const nextUrl = new URL(response.headers.location, parsed).toString();
        fetchRemoteBuffer(nextUrl, redirectCount + 1).then(resolve, reject);
        return;
      }

      if (response.statusCode < 200 || response.statusCode >= 300) {
        response.resume();
        reject(new Error(`Imagem retornou status ${response.statusCode}`));
        return;
      }

      const chunks = [];
      let total = 0;
      response.on("data", chunk => {
        total += chunk.length;
        if (total > 35 * 1024 * 1024) {
          request.destroy(new Error("Imagem excede o limite de 35 MB."));
          return;
        }
        chunks.push(chunk);
      });
      response.on("end", () => resolve(Buffer.concat(chunks)));
    });

    request.setTimeout(25000, () => request.destroy(new Error("Tempo esgotado ao buscar imagem.")));
    request.on("error", reject);
  });
}

async function readImageSource(source) {
  if (!source) return null;
  if (Buffer.isBuffer(source)) return source;
  const value = String(source);
  const dataBuffer = dataUrlToBuffer(value);
  if (dataBuffer) return dataBuffer;
  if (/^https?:\/\//i.test(value)) return fetchRemoteBuffer(value);
  if (fs.existsSync(value)) return fs.readFileSync(value);
  return null;
}

async function imageForPdf(source, options = {}) {
  const input = await readImageSource(source);
  if (!input) return null;
  const sharp = getSharp();
  if (!sharp) {
    return {
      buffer: input,
      width: options.width || null,
      height: options.height || null
    };
  }

  const resize = options.logo
    ? { width: 920, height: 260, fit: "inside", withoutEnlargement: true }
    : { width: 3200, height: 3200, fit: "inside", withoutEnlargement: true };
  const pipeline = sharp(input, { failOn: "none", limitInputPixels: false })
    .rotate()
    .resize(resize);
  const output = options.logo || options.signature
    ? await pipeline.png({ compressionLevel: 9 }).toBuffer({ resolveWithObject: true })
    : await pipeline.jpeg({ quality: 96, chromaSubsampling: "4:4:4" }).toBuffer({ resolveWithObject: true });

  return {
    buffer: output.data,
    width: output.info.width || options.width || null,
    height: output.info.height || options.height || null
  };
}

function pdfContentWidth(doc) {
  return doc.page.width - doc.page.margins.left - doc.page.margins.right;
}

function pdfContentBottom(doc) {
  return doc.page.height - doc.page.margins.bottom - 32;
}

function ensurePdfSpace(doc, height) {
  if (doc.y + height > pdfContentBottom(doc)) {
    doc.addPage();
    doc.y = doc.page.margins.top;
  }
}

function drawPdfSection(doc, title) {
  ensurePdfSpace(doc, 32);
  const left = doc.page.margins.left;
  doc
    .save()
    .rect(left, doc.y, pdfContentWidth(doc), 24)
    .fill("#f4f5f6")
    .fillColor("#111111")
    .font("Helvetica-Bold")
    .fontSize(10)
    .text(String(title || "").toUpperCase(), left + 10, doc.y + 7, { width: pdfContentWidth(doc) - 20 })
    .restore();
  doc.y += 34;
}

function drawPdfHeader(doc, report, logo) {
  const pageWidth = doc.page.width;
  const left = doc.page.margins.left;
  doc.save();
  doc.rect(0, 0, pageWidth, 86).fill("#111111");
  doc.rect(0, 83, pageWidth, 3).fill("#e30613");
  doc.roundedRect(left, 16, 174, 54, 2).fill("#ffffff");
  if (logo?.buffer) {
    try {
      doc.image(logo.buffer, left + 12, 25, { fit: [150, 34], align: "center", valign: "center" });
    } catch (error) {
      doc.fillColor("#111111").font("Helvetica-Bold").fontSize(18).text("UNICO", left + 18, 31);
    }
  } else {
    doc.fillColor("#111111").font("Helvetica-Bold").fontSize(18).text("UNICO", left + 18, 31);
  }
  doc
    .fillColor("#ffffff")
    .font("Helvetica-Bold")
    .fontSize(13)
    .text("CHECKLIST OPERACIONAL", left + 210, 29, { width: 220 })
    .font("Helvetica")
    .fontSize(9)
    .fillColor("#d9d9d9")
    .text("UNICO Logistica LTDA", left + 210, 48, { width: 220 });
  doc
    .font("Helvetica")
    .fontSize(8)
    .fillColor("#d9d9d9")
    .text("Checklist", pageWidth - 168, 26, { width: 120, align: "right" })
    .font("Helvetica-Bold")
    .fontSize(13)
    .fillColor("#ffffff")
    .text(textValue(report.id), pageWidth - 168, 40, { width: 120, align: "right" });
  doc.restore();
  doc.y = 106;
}

function drawPdfWatermark(doc) {
  const centerX = doc.page.width / 2;
  const centerY = doc.page.height / 2;
  doc.save();
  doc.rotate(-35, { origin: [centerX, centerY] });
  doc.opacity(0.035);
  doc.fillColor("#e30613").font("Helvetica-Bold").fontSize(62);
  doc.text("UNICO LOGISTICA", centerX - 250, centerY - 28, { width: 500, align: "center" });
  doc.restore();
}

function drawPdfFooter(doc, pageNumber, totalPages, report) {
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const y = doc.page.height - 58;
  doc.save();
  doc.strokeColor("#e30613").lineWidth(1).moveTo(left, y).lineTo(right, y).stroke();
  doc
    .fillColor("#666666")
    .font("Helvetica")
    .fontSize(8)
    .text(`UNICO Logistica LTDA | Checklist ${textValue(report.id)}`, left, y + 8, { width: right - left - 96 })
    .text(`Pagina ${pageNumber} de ${totalPages}`, right - 92, y + 8, { width: 92, align: "right" });
  doc.restore();
}

function addReportMeta(doc, label, value, x, y, width) {
  doc
    .roundedRect(x, y, width, 42, 3)
    .strokeColor("#dfe4e7")
    .lineWidth(0.8)
    .stroke()
    .font("Helvetica-Bold")
    .fontSize(8)
    .fillColor("#6d757b")
    .text(label, x + 9, y + 8, { width: width - 18 })
    .font("Helvetica")
    .fontSize(10)
    .fillColor("#24282c")
    .text(textValue(value), x + 9, y + 21, { width: width - 18, height: 14 });
}

function drawReportMetaGrid(doc, report) {
  const left = doc.page.margins.left;
  const gap = 10;
  const colWidth = (pdfContentWidth(doc) - gap) / 2;
  const startY = doc.y;
  const rows = [
    ["Unidade", "UNICO Logistica LTDA"],
    ["Roteiro", report.route],
    ["Filial", report.branch],
    ["Objeto", report.object],
    ["Criado em", report.created],
    ["Finalizado em", report.finished],
    ["Executor", report.executor || report.executorName || report.executorUsername],
    ["Status", report.status || "Execucao finalizada"]
  ];
  rows.forEach((row, index) => {
    const x = left + (index % 2) * (colWidth + gap);
    const y = startY + Math.floor(index / 2) * 50;
    addReportMeta(doc, row[0], row[1], x, y, colWidth);
  });
  doc.y = startY + Math.ceil(rows.length / 2) * 50 + 6;
}

async function drawPdfPhoto(doc, photo, caption, options = {}) {
  const image = await imageForPdf(photo?.url, {
    width: photo?.width,
    height: photo?.height,
    signature: options.signature
  }).catch(error => {
    console.error("Nao foi possivel carregar imagem para PDF:", error.message);
    return null;
  });
  if (!image?.buffer) {
    ensurePdfSpace(doc, 22);
    doc.fillColor("#8a8f94").font("Helvetica").fontSize(9).text(`${caption}: imagem indisponivel no PDF.`);
    doc.moveDown(0.5);
    return;
  }

  const left = doc.page.margins.left;
  const width = pdfContentWidth(doc);
  const captionHeight = 18;
  const minImageHeight = options.signature ? 110 : 280;
  if (doc.y + minImageHeight + captionHeight + 18 > pdfContentBottom(doc)) {
    doc.addPage();
    doc.y = doc.page.margins.top;
  }

  const availableHeight = Math.max(minImageHeight, pdfContentBottom(doc) - doc.y - captionHeight - 14);
  const maxHeight = options.signature ? Math.min(150, availableHeight) : Math.min(610, availableHeight);
  const naturalWidth = image.width || photo?.width || width;
  const naturalHeight = image.height || photo?.height || maxHeight;
  const ratio = naturalWidth && naturalHeight ? naturalWidth / naturalHeight : width / maxHeight;
  let drawWidth = width - 18;
  let drawHeight = drawWidth / ratio;
  if (drawHeight > maxHeight) {
    drawHeight = maxHeight;
    drawWidth = drawHeight * ratio;
  }

  const boxHeight = drawHeight + captionHeight + 18;
  doc.save();
  doc.roundedRect(left, doc.y, width, boxHeight, 4).strokeColor("#dfe4e7").lineWidth(0.8).stroke();
  const imageX = left + (width - drawWidth) / 2;
  const imageY = doc.y + 9;
  doc.image(image.buffer, imageX, imageY, { width: drawWidth, height: drawHeight });
  doc
    .fillColor("#6d757b")
    .font("Helvetica")
    .fontSize(8)
    .text(caption, left + 9, imageY + drawHeight + 5, { width: width - 18, align: "center" });
  doc.restore();
  doc.y += boxHeight + 10;
}

async function createReportPdfBuffer(report) {
  const Document = getPdfDocument();
  if (!Document) throw new Error("Gerador de PDF indisponivel.");

  const doc = new Document({
    size: "A4",
    margin: 36,
    bufferPages: true,
    info: {
      Title: `Checklist ${textValue(report.id)}`,
      Author: "UNICO Logistica",
      Subject: "Checklist operacional"
    }
  });
  const chunks = [];
  doc.on("data", chunk => chunks.push(chunk));

  const logo = await imageForPdf(logoPath, { logo: true }).catch(error => {
    console.error("Nao foi possivel preparar o logo para PDF:", error.message);
    return null;
  });

  return new Promise((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    (async () => {
      const reportItems = Array.isArray(report.items) ? report.items : [];
      const answers = report.answers || {};

      drawPdfHeader(doc, report, logo);
      doc
        .fillColor("#111111")
        .font("Helvetica-Bold")
        .fontSize(18)
        .text(textValue(report.route, "Checklist operacional"), doc.page.margins.left, doc.y, { width: pdfContentWidth(doc) })
        .moveDown(0.25)
        .fillColor("#6d757b")
        .font("Helvetica")
        .fontSize(10)
        .text(`Documento gerado em ${new Date().toLocaleString("pt-BR")}`, { width: pdfContentWidth(doc) });
      doc.moveDown(0.8);

      drawPdfSection(doc, "Dados do checklist");
      drawReportMetaGrid(doc, report);

      drawPdfSection(doc, "Itens verificados");
      for (const [index, item] of reportItems.entries()) {
        const answer = answers[item.id] || {};
        ensurePdfSpace(doc, 72);
        doc
          .fillColor("#111111")
          .font("Helvetica-Bold")
          .fontSize(11)
          .text(`${index + 1}. ${textValue(item.title)}`, { width: pdfContentWidth(doc) })
          .moveDown(0.2)
          .fillColor("#24282c")
          .font("Helvetica")
          .fontSize(10)
          .text(`Resposta: ${formatPdfAnswerValue(answer)}`, { width: pdfContentWidth(doc) });
        if (answer.observation) {
          doc
            .moveDown(0.2)
            .fillColor("#555555")
            .fontSize(9)
            .text(`Observacoes: ${answer.observation}`, { width: pdfContentWidth(doc) });
        }
        doc.moveDown(0.4);

        const photos = Array.isArray(answer.photos) ? answer.photos : [];
        for (const [photoIndex, photo] of photos.entries()) {
          await drawPdfPhoto(doc, photo, `Foto ${photoIndex + 1} - ${textValue(photo.name, "Imagem")} - ${photo.width || ""}${photo.width && photo.height ? " x " : ""}${photo.height || ""}`.trim());
        }

        const evidence = Array.isArray(answer.evidencePhotos) ? answer.evidencePhotos : [];
        for (const [photoIndex, photo] of evidence.entries()) {
          await drawPdfPhoto(doc, photo, `Evidencia ${photoIndex + 1} - ${textValue(photo.name, "Imagem")}`.trim());
        }

        if (answer.signatureUrl) {
          await drawPdfPhoto(doc, { url: answer.signatureUrl, width: 900, height: 360 }, "Assinatura registrada", { signature: true });
        }

        doc.moveDown(0.25);
      }

      const range = doc.bufferedPageRange();
      for (let index = 0; index < range.count; index += 1) {
        doc.switchToPage(range.start + index);
        drawPdfWatermark(doc);
        drawPdfFooter(doc, index + 1, range.count, report);
      }
      doc.end();
    })().catch(error => {
      doc.end();
      reject(error);
    });
  });
}

function canAccessReport(session, report) {
  if (!session || !report) return false;
  if (isAdminSession(session)) return true;
  const username = String(session.username || "").toLowerCase();
  return String(report.executorUsername || "").toLowerCase() === username;
}

function reportsForSession(session, reports) {
  const list = Array.isArray(reports) ? reports : [];
  if (isAdminSession(session)) return list;
  return list.filter(report => canAccessReport(session, report));
}

function parseCookies(request) {
  return Object.fromEntries((request.headers.cookie || "").split(";").filter(Boolean).map(cookie => {
    const [key, ...value] = cookie.trim().split("=");
    return [key, decodeURIComponent(value.join("="))];
  }));
}

function currentSession(request) {
  const token = parseCookies(request).session;
  return token ? sessions.get(token) : null;
}

function isAdminSession(session) {
  return session?.role === "admin" || String(session?.username || "").toLowerCase() === "creverson";
}

function readBody(request) {
  return new Promise(resolve => {
    let body = "";
    request.on("data", chunk => body += chunk);
    request.on("end", () => resolve(body));
  });
}

async function readJsonBody(request) {
  try {
    return JSON.parse(await readBody(request) || "{}");
  } catch (error) {
    return null;
  }
}

function safeUser(user) {
  const username = user.username;
  const isCreverson = username.toLowerCase() === "creverson";
  return {
    username,
    role: isCreverson ? "admin" : user.role,
    name: user.name
  };
}

function publicUser(user) {
  return {
    username: user.username,
    name: user.name || user.username,
    role: safeUser(user).role
  };
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function passwordMatches(user, password) {
  if (user.password) return user.password.trim() === String(password);
  if (user.passwordHash) return user.passwordHash === sha256(password);
  return false;
}

function readManagedUsers() {
  try {
    const stored = JSON.parse(fs.readFileSync(usersPath, "utf8"));
    return Array.isArray(stored) ? stored : [];
  } catch (error) {
    return [];
  }
}

function writeManagedUsers(users) {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(usersPath, JSON.stringify(users, null, 2));
}

function allUsers() {
  const byUsername = new Map();
  seedUsers.forEach(user => byUsername.set(user.username.toLowerCase(), user));
  readManagedUsers().forEach(user => byUsername.set(user.username.toLowerCase(), user));
  return [...byUsername.values()];
}

function readReportsFromFile() {
  try {
    const reports = JSON.parse(fs.readFileSync(reportsPath, "utf8"));
    return Array.isArray(reports) ? reports : [];
  } catch (error) {
    return [];
  }
}

function writeReportsToFile(reports) {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(reportsPath, JSON.stringify(reports, null, 2));
}

async function readReportsFromDatabase() {
  try {
    if (!await ensureReportTable()) return null;
    const result = await pgPool.query("SELECT report FROM checklist_reports ORDER BY updated_at DESC, created_at DESC");
    if (!result.rows.length) {
      const fileReports = readReportsFromFile();
      if (fileReports.length) {
        await writeReportsToDatabase(fileReports);
        return fileReports;
      }
    }
    return result.rows.map(row => row.report).filter(Boolean);
  } catch (error) {
    console.error("Nao foi possivel ler historico no banco:", error.message);
    return null;
  }
}

async function writeReportsToDatabase(reports) {
  let client;
  try {
    if (!await ensureReportTable()) return false;
    client = await pgPool.connect();
    await client.query("BEGIN");
    await client.query("DELETE FROM checklist_reports");
    for (const report of reports) {
      if (!report?.id) continue;
      await client.query(
        `INSERT INTO checklist_reports (id, report, created_at, updated_at)
         VALUES ($1, $2::jsonb, COALESCE($3::timestamptz, NOW()), NOW())
         ON CONFLICT (id) DO UPDATE SET report = EXCLUDED.report, updated_at = NOW()`,
        [String(report.id), JSON.stringify(report), report.createdAt || report.finishedAt || null]
      );
    }
    await client.query("COMMIT");
    return true;
  } catch (error) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    console.error("Nao foi possivel gravar historico no banco:", error.message);
    return false;
  } finally {
    if (client) client.release();
  }
}

async function readReports() {
  const databaseReports = await readReportsFromDatabase();
  if (Array.isArray(databaseReports)) return databaseReports;
  if (reportDatabaseRequired()) return [];
  return readReportsFromFile();
}

async function writeReports(reports) {
  if (reportDatabaseRequired()) {
    const savedInDatabase = await writeReportsToDatabase(reports);
    if (!savedInDatabase) return false;
    writeReportsToFile(reports);
    return true;
  }

  const savedInDatabase = await writeReportsToDatabase(reports);
  if (savedInDatabase) {
    writeReportsToFile(reports);
    return true;
  }
  writeReportsToFile(reports);
  return true;
}

function readRoutes() {
  try {
    if (!fs.existsSync(routesPath)) return cloneData(seedRoutes);
    const routes = JSON.parse(fs.readFileSync(routesPath, "utf8"));
    return Array.isArray(routes) ? routes : cloneData(seedRoutes);
  } catch (error) {
    return cloneData(seedRoutes);
  }
}

function writeRoutes(routes) {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(routesPath, JSON.stringify(routes, null, 2));
}

function readLocations() {
  try {
    const locations = JSON.parse(fs.readFileSync(locationsPath, "utf8"));
    return Array.isArray(locations) ? locations : seedLocations;
  } catch (error) {
    return seedLocations;
  }
}

function writeLocations(locations) {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(locationsPath, JSON.stringify(locations, null, 2));
}

const server = http.createServer(async (request, response) => {
  const requestUrl = new URL(request.url, "http://localhost");
  const pathname = requestUrl.pathname;

  try {
    if (request.method === "POST" && pathname === "/api/login") {
      const payload = await readJsonBody(request);
      if (!payload) return sendJson(response, 400, { error: "Requisicao de login invalida." });

      const normalized = String(payload.username || "").trim().toLowerCase();
      const user = allUsers().find(entry => entry.username.toLowerCase() === normalized && passwordMatches(entry, payload.password));

      if (!user) return sendJson(response, 401, { error: "Usuario ou senha invalidos." });

      const token = crypto.randomBytes(32).toString("hex");
      const maxAge = payload.remember ? 60 * 60 * 24 * 30 : 60 * 60 * 8;
      sessions.set(token, safeUser(user));
      return sendJson(response, 200, { user: safeUser(user) }, {
        "Set-Cookie": `session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}`
      });
    }
  } catch (error) {
    return sendJson(response, 500, { error: "Erro interno no login." });
  }

  if (request.method === "POST" && pathname === "/api/logout") {
    const token = parseCookies(request).session;
    if (token) sessions.delete(token);
    return sendJson(response, 200, { ok: true }, {
      "Set-Cookie": "session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0"
    });
  }

  if (request.method === "GET" && pathname === "/api/session") {
    return sendJson(response, 200, { user: currentSession(request) });
  }

  if (pathname === "/api/sync") {
    const session = currentSession(request);
    if (!session) return sendJson(response, 401, { error: "Sessao expirada." });
    const reports = await readReports();

    const body = {
      locations: readLocations(),
      routes: readRoutes(),
      reports: reportsForSession(session, reports),
      storage: storageStatus(),
      users: isAdminSession(session) ? allUsers().map(publicUser) : []
    };
    return sendJson(response, 200, body);
  }

  if (pathname === "/api/locations") {
    const session = currentSession(request);
    if (!session) return sendJson(response, 401, { error: "Sessao expirada." });

    if (request.method === "GET") {
      return sendJson(response, 200, { locations: readLocations() });
    }

    if (request.method === "POST") {
      if (!isAdminSession(session)) return sendJson(response, 403, { error: "Acesso negado." });
      const payload = await readJsonBody(request);
      const location = {
        id: Number(payload?.id || Date.now()),
        name: String(payload?.name || "").trim(),
        type: String(payload?.type || "Filial").trim(),
        address: String(payload?.address || "").trim()
      };
      if (!location.name) return sendJson(response, 400, { error: "Informe o nome da localidade." });

      const locations = readLocations().filter(item => Number(item.id) !== Number(location.id));
      locations.push(location);
      writeLocations(locations);
      return sendJson(response, 200, { location });
    }
  }

  if (request.method === "DELETE" && pathname.startsWith("/api/locations/")) {
    const session = currentSession(request);
    if (!isAdminSession(session)) return sendJson(response, 403, { error: "Acesso negado." });

    const id = Number(decodeURIComponent(pathname.replace("/api/locations/", "")));
    writeLocations(readLocations().filter(location => Number(location.id) !== id));
    return sendJson(response, 200, { ok: true });
  }

  if (pathname === "/api/routes") {
    const session = currentSession(request);
    if (!session) return sendJson(response, 401, { error: "Sessao expirada." });

    if (request.method === "GET") {
      return sendJson(response, 200, { routes: readRoutes() });
    }

    if (request.method === "POST") {
      if (!isAdminSession(session)) return sendJson(response, 403, { error: "Acesso negado." });
      const payload = await readJsonBody(request);
      if (!payload || typeof payload !== "object") return sendJson(response, 400, { error: "Roteiro invalido." });

      const route = {
        ...payload,
        id: String(payload.id || `route-${Date.now()}`),
        title: String(payload.title || "").trim(),
        updatedAt: new Date().toISOString()
      };
      if (!route.title) return sendJson(response, 400, { error: "Informe o titulo do roteiro." });

      const routes = readRoutes().filter(item => String(item.id) !== route.id);
      routes.unshift(route);
      writeRoutes(routes);
      return sendJson(response, 200, { route });
    }
  }

  if (request.method === "DELETE" && pathname.startsWith("/api/routes/")) {
    const session = currentSession(request);
    if (!isAdminSession(session)) return sendJson(response, 403, { error: "Acesso negado." });

    const id = decodeURIComponent(pathname.replace("/api/routes/", ""));
    writeRoutes(readRoutes().filter(route => String(route.id) !== id));
    return sendJson(response, 200, { ok: true });
  }

  if (pathname === "/api/users") {
    const session = currentSession(request);
    if (!isAdminSession(session)) return sendJson(response, 403, { error: "Acesso negado." });

    if (request.method === "GET") {
      return sendJson(response, 200, { users: allUsers().map(publicUser) });
    }

    if (request.method === "POST") {
      const payload = await readJsonBody(request);
      const username = String(payload?.username || "").trim();
      const name = String(payload?.name || username).trim();
      const role = payload?.role === "admin" ? "admin" : "app";
      const password = String(payload?.password || "");

      if (!username) return sendJson(response, 400, { error: "Informe o usuario." });
      if (!/^[a-z0-9._-]+$/i.test(username)) return sendJson(response, 400, { error: "Use apenas letras, numeros, ponto, traco ou underline no usuario." });

      const managed = readManagedUsers();
      const existing = managed.find(user => user.username.toLowerCase() === username.toLowerCase());
      if (!existing && password.length < 4) return sendJson(response, 400, { error: "Informe uma senha com pelo menos 4 caracteres." });

      const user = {
        username,
        name,
        role,
        passwordHash: password ? sha256(password) : existing?.passwordHash
      };
      const next = managed.filter(entry => entry.username.toLowerCase() !== username.toLowerCase());
      next.push(user);
      writeManagedUsers(next);
      return sendJson(response, 200, { user: publicUser(user) });
    }
  }

  if (request.method === "DELETE" && pathname.startsWith("/api/users/")) {
    const session = currentSession(request);
    if (!isAdminSession(session)) return sendJson(response, 403, { error: "Acesso negado." });

    const username = decodeURIComponent(pathname.replace("/api/users/", ""));
    if (username.toLowerCase() === String(session.username || "").toLowerCase()) {
      return sendJson(response, 400, { error: "Voce nao pode excluir o proprio usuario logado." });
    }

    writeManagedUsers(readManagedUsers().filter(user => user.username.toLowerCase() !== username.toLowerCase()));
    return sendJson(response, 200, { ok: true });
  }

  if (pathname === "/api/reports") {
    const session = currentSession(request);
    if (!session) return sendJson(response, 401, { error: "Sessao expirada." });

    if (request.method === "GET") {
      const reports = await readReports();
      return sendJson(response, 200, { reports: reportsForSession(session, reports) });
    }

    if (request.method === "POST") {
      const payload = await readJsonBody(request);
      if (!payload || typeof payload !== "object") {
        return sendJson(response, 400, { error: "Checklist invalido." });
      }
      if (reportDatabaseRequired() && !databaseUrl) {
        return sendJson(response, 503, {
          error: "Banco de dados permanente nao configurado no Render. Configure a variavel DATABASE_URL para salvar o historico."
        });
      }

      let report;
      try {
        report = await uploadReportImages({
          ...payload,
          id: String(payload.id || Date.now()),
          executor: session.name || session.username || payload.executor || "Nao informado",
          executorName: session.name || session.username || payload.executorName || payload.executor || "Nao informado",
          executorUsername: session.username || payload.executorUsername || ""
        });
      } catch (error) {
        console.error("Nao foi possivel enviar midias para o Cloudinary:", error.message);
        return sendJson(response, 502, { error: "Nao foi possivel enviar fotos para o Cloudinary. O checklist ficara pendente para tentar novamente." });
      }
      const reports = (await readReports()).filter(item => String(item.id) !== report.id);
      reports.unshift(report);
      const saved = await writeReports(reports);
      if (!saved) {
        return sendJson(response, 503, {
          error: "Nao foi possivel gravar o checklist no banco permanente. Ele ficou pendente para nova sincronizacao."
        });
      }
      return sendJson(response, 201, { report });
    }
  }

  if (request.method === "GET" && /^\/api\/reports\/[^/]+\/pdf$/.test(pathname)) {
    const session = currentSession(request);
    if (!session) return sendJson(response, 401, { error: "Sessao expirada." });

    const id = decodeURIComponent(pathname.replace(/^\/api\/reports\//, "").replace(/\/pdf$/, ""));
    const report = (await readReports()).find(item => String(item.id) === id);
    if (!report) return sendJson(response, 404, { error: "Checklist nao encontrado." });
    if (!canAccessReport(session, report)) return sendJson(response, 403, { error: "Acesso negado." });

    try {
      const pdf = await createReportPdfBuffer(report);
      return sendFileBuffer(response, 200, pdf, {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${sanitizeFilename(`checklist-${report.id}-${report.route || ""}`)}.pdf"`,
        "Cache-Control": "no-store",
        "Content-Length": pdf.length
      });
    } catch (error) {
      console.error("Nao foi possivel gerar PDF:", error.message);
      return sendJson(response, 500, { error: "Nao foi possivel gerar o PDF agora." });
    }
  }

  if (request.method === "DELETE" && pathname.startsWith("/api/reports/")) {
    const session = currentSession(request);
    if (!isAdminSession(session)) return sendJson(response, 403, { error: "Acesso negado." });

    const id = decodeURIComponent(pathname.replace("/api/reports/", ""));
    await writeReports((await readReports()).filter(item => String(item.id) !== id));
    return sendJson(response, 200, { ok: true });
  }

  if (request.method === "GET" && publicFiles[pathname]) {
    response.writeHead(200, {
      "Content-Type": publicFiles[pathname].type,
      "Cache-Control": "public, max-age=300"
    });
    response.end(fs.readFileSync(publicFiles[pathname].path));
    return;
  }

  if (request.method === "GET") {
    response.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store"
    });
    response.end(fs.readFileSync(indexPath));
    return;
  }

  response.writeHead(405);
  response.end();
});

server.listen(port, () => {
  console.log(`UNICO Checklist listening on ${port}`);
});
