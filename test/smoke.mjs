// 真实 stdio JSON-RPC 冒烟：同时验证服务器、jsDelivr 可用性与语料格式。
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

const p = spawn("node", ["index.js"], { stdio: ["pipe", "pipe", "inherit"] });
const rl = createInterface({ input: p.stdout });
const pending = new Map();
rl.on("line", (line) => {
  try {
    const msg = JSON.parse(line);
    if (msg.id && pending.has(msg.id)) pending.get(msg.id)(msg);
  } catch {}
});
const send = (msg) => p.stdin.write(JSON.stringify(msg) + "\n");
const call = (id, method, params) =>
  new Promise((resolve, reject) => {
    pending.set(id, resolve);
    setTimeout(() => reject(new Error(`timeout: ${method}`)), 30000);
    send({ jsonrpc: "2.0", id, method, params });
  });

const init = await call(1, "initialize", {
  protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "smoke", version: "0" },
});
if (init.result.serverInfo.name !== "chinese-law") throw new Error("bad serverInfo");
send({ jsonrpc: "2.0", method: "notifications/initialized" });

const tools = await call(2, "tools/list", {});
const names = tools.result.tools.map((t) => t.name).sort();
if (JSON.stringify(names) !== JSON.stringify(["get_article", "search_in_law", "search_laws"]))
  throw new Error(`tools drift: ${names}`);

const art = await call(3, "tools/call", { name: "get_article", arguments: { law: "民法典", article_number: 577 } });
const text = art.result.content[0].text;
if (!text.includes("第五百七十七条") || !text.includes("civil-code/577.html"))
  throw new Error(`get_article broken:\n${text.slice(0, 200)}`);

console.log("smoke OK");
p.kill();
process.exit(0);
