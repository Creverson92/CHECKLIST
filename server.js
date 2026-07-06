const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const path = require("path");

const port = process.env.PORT || 10000;
const indexPath = path.join(__dirname, "index.html");
const publicFiles = {
  "/manifest.json": { path: path.join(__dirname, "manifest.json"), type: "application/manifest+json" },
  "/icon.svg": { path: path.join(__dirname, "icon.svg"), type: "image/svg+xml" }
};
const sessions = new Map();

const users = [
  {
    username: process.env.ADMIN_USER || "Creverson",
    password: process.env.ADMIN_PASSWORD,
    passwordHash: process.env.ADMIN_PASSWORD_HASH,
    role: "admin",
    name: process.env.ADMIN_NAME || "Creverson"
  },
  {
    username: process.env.APP_USER || "Anderson",
    password: process.env.APP_PASSWORD,
    passwordHash: process.env.APP_PASSWORD_HASH,
    role: "app",
    name: process.env.APP_NAME || "Anderson"
  }
];

function sendJson(response, status, body, headers = {}) {
  response.writeHead(status, {
    "Content-Type": "application/json",
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

function sha256(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function passwordMatches(user, password) {
  if (user.password) return user.password.trim() === String(password);
  if (user.passwordHash) return user.passwordHash === sha256(password);
  return false;
}

const server = http.createServer(async (request, response) => {
  try {
    if (request.method === "POST" && request.url === "/api/login") {
      if (users.some(user => !user.password && !user.passwordHash)) {
        return sendJson(response, 500, { error: "Credenciais do servidor nao configuradas." });
      }

      const payload = await readJsonBody(request);
      if (!payload) return sendJson(response, 400, { error: "Requisicao de login invalida." });

      const normalized = String(payload.username || "").trim().toLowerCase();
      const user = users.find(entry => entry.username.toLowerCase() === normalized && passwordMatches(entry, payload.password));

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

  if (request.method === "POST" && request.url === "/api/logout") {
    const token = parseCookies(request).session;
    if (token) sessions.delete(token);
    return sendJson(response, 200, { ok: true }, {
      "Set-Cookie": "session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0"
    });
  }

  if (request.method === "GET" && request.url === "/api/session") {
    return sendJson(response, 200, { user: currentSession(request) });
  }

  if (request.method === "GET" && publicFiles[request.url]) {
    response.writeHead(200, {
      "Content-Type": publicFiles[request.url].type,
      "Cache-Control": "public, max-age=300"
    });
    response.end(fs.readFileSync(publicFiles[request.url].path));
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
