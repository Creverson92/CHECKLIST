const crypto = require("crypto");
const fs = require("fs");
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
const sessions = new Map();

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

function sendJson(response, status, body, headers = {}) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...headers
  });
  response.end(JSON.stringify(body));
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

function readReports() {
  try {
    const reports = JSON.parse(fs.readFileSync(reportsPath, "utf8"));
    return Array.isArray(reports) ? reports : [];
  } catch (error) {
    return [];
  }
}

function writeReports(reports) {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(reportsPath, JSON.stringify(reports, null, 2));
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

    const body = {
      locations: readLocations(),
      routes: readRoutes(),
      reports: isAdminSession(session) ? readReports() : [],
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
      return sendJson(response, 200, { reports: readReports() });
    }

    if (request.method === "POST") {
      const payload = await readJsonBody(request);
      if (!payload || typeof payload !== "object") {
        return sendJson(response, 400, { error: "Checklist invalido." });
      }

      const report = {
        ...payload,
        id: String(payload.id || Date.now()),
        executor: payload.executor || session.name || session.username
      };
      const reports = readReports().filter(item => String(item.id) !== report.id);
      reports.unshift(report);
      writeReports(reports);
      return sendJson(response, 201, { report });
    }
  }

  if (request.method === "DELETE" && pathname.startsWith("/api/reports/")) {
    const session = currentSession(request);
    if (!isAdminSession(session)) return sendJson(response, 403, { error: "Acesso negado." });

    const id = decodeURIComponent(pathname.replace("/api/reports/", ""));
    writeReports(readReports().filter(item => String(item.id) !== id));
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
