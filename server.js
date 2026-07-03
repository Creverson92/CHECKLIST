const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const path = require("path");

const port = process.env.PORT || 10000;
const indexPath = path.join(__dirname, "index.html");
const sessions = new Map();

const users = [
  {
    username: process.env.ADMIN_USER || "Creverson",
    password: process.env.ADMIN_PASSWORD,
    role: "admin",
    name: process.env.ADMIN_NAME || "Creverson"
  },
  {
    username: process.env.APP_USER || "Anderson",
    password: process.env.APP_PASSWORD,
    role: "app",
    name: process.env.APP_NAME || "Anderson"
  }
];

function sendJson(response, status, body, headers = {}) {
  response.writeHead(status, { "Content-Type": "application/json", ...headers });
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

function safeUser(user) {
  return { role: user.role, name: user.name };
}

const server = http.createServer(async (request, response) => {
  if (request.method === "POST" && request.url === "/api/login") {
    if (users.some(user => !user.password)) {
      return sendJson(response, 500, { error: "Credenciais do servidor nao configuradas." });
    }

    const payload = JSON.parse(await readBody(request) || "{}");
    const normalized = String(payload.username || "").trim().toLowerCase();
    const user = users.find(entry => entry.username.toLowerCase() === normalized && entry.password === payload.password);

    if (!user) return sendJson(response, 401, { error: "Usuario ou senha invalidos." });

    const token = crypto.randomBytes(32).toString("hex");
    sessions.set(token, safeUser(user));
    return sendJson(response, 200, { user: safeUser(user) }, {
      "Set-Cookie": `session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=28800`
    });
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

  if (request.method === "GET") {
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(fs.readFileSync(indexPath));
    return;
  }

  response.writeHead(405);
  response.end();
});

server.listen(port, () => {
  console.log(`UNICO Checklist listening on ${port}`);
});
