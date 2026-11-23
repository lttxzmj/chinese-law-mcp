import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { after, before, test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const index = [
  { slug: "civil-code", title: "中华人民共和国民法典", articleCount: 12 },
  { slug: "labor-law", title: "中华人民共和国劳动法", articleCount: 1 },
  { slug: "labor-contract", title: "中华人民共和国劳动合同法", articleCount: 1 },
  { slug: "pending-law", title: "待施行法", articleCount: 1 },
  { slug: "unavailable", title: "故障测试法", articleCount: 1 },
];
let unavailableRequests = 0;
const fixture = createServer((req, res) => {
  res.setHeader("Content-Type", "application/json");
  if (req.url === "/laws/index.json") return res.end(JSON.stringify(index));
  const meta = index.find((l) => req.url === `/laws/${l.slug}.json`);
  if (!meta || (meta.slug === "unavailable" && unavailableRequests++ === 0)) {
    res.writeHead(503); return res.end('{}');
  }
  res.end(JSON.stringify({
    ...meta, status: meta.slug === "pending-law" ? "pending" : "effective", effectiveDate: "2027-01-01",
    articles: Array.from({ length: meta.articleCount }, (_, i) => ({
      articleNumber: i + 1, displayNumber: `第${i + 1}条`, path: ["第一章"],
      text: i === 0 ? "违约 赔偿责任" : `违约责任第${i + 1}项`,
    })),
  }));
});
const client = new Client({ name: "protocol-regression", version: "1.0.0" });
before(async () => {
  fixture.listen(0, "127.0.0.1");
  await once(fixture, "listening");
  await client.connect(new StdioClientTransport({
    command: process.execPath, args: ["index.js"],
    env: { ...process.env, LAW_MCP_DATA_BASE: `http://127.0.0.1:${fixture.address().port}/` },
  }));
});
after(async () => { await client.close(); await new Promise((resolve) => fixture.close(resolve)); });
const call = (name, args) => client.callTool({ name, arguments: args });
const body = (result) => result.content.map((c) => c.text ?? "").join("\n");

test("real MCP handshake exposes four described read-only tools", async () => {
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((t) => t.name).sort(), ["get_article", "list_laws", "search_in_law", "search_laws"]);
  for (const tool of tools) {
    assert.equal(tool.annotations.readOnlyHint, true);
    assert.equal(tool.annotations.destructiveHint, false);
    assert.equal(tool.inputSchema.type, "object");
  }
});
test("catalog pagination reaches every law without gaps or duplicates", async () => {
  const ids = [];
  let offset = 0;
  do {
    const result = await call("list_laws", { offset, limit: 2 });
    assert.ok(!result.isError);
    assert.equal(result.structuredContent.total, 5);
    ids.push(...result.structuredContent.laws.map((l) => l.id));
    offset = result.structuredContent.next_offset;
  } while (offset !== null);
  assert.deepEqual(ids, index.map((l) => l.slug));
  assert.equal((await call("list_laws", { offset: 99 })).structuredContent.next_offset, null);
});
test("name search supports exact slugs and reports full counts before paging", async () => {
  const result = await call("search_laws", { query: "劳动", limit: 1 });
  assert.equal(result.structuredContent.total, 2);
  assert.equal(result.structuredContent.next_offset, 1);
  const byId = await call("search_laws", { query: "civil-code" });
  assert.equal(byId.structuredContent.laws[0].title, "中华人民共和国民法典");
  const empty = await call("search_laws", { query: "不存在" });
  assert.ok(!empty.isError);
  assert.equal(empty.structuredContent.total, 0);
});
test("ambiguous names never silently select a statute", async () => {
  for (const [name, args] of [
    ["get_article", { law: "劳动", article_number: 1 }],
    ["search_in_law", { law: "劳动", keywords: "违约" }],
  ]) {
    const result = await call(name, args);
    assert.equal(result.isError, true);
    assert.match(body(result), /labor-law/);
    assert.match(body(result), /labor-contract/);
  }
});
test("blank values, invalid article numbers and oversized pages are rejected", async () => {
  for (const [name, args] of [
    ["get_article", { law: "  ", article_number: 1 }],
    ["get_article", { law: "civil-code", article_number: 0 }],
    ["get_article", { law: "civil-code", article_number: 1.5 }],
    ["search_laws", { query: "  " }],
    ["search_laws", { query: "中华人民共和国" }],
    ["search_in_law", { law: "civil-code", keywords: "  " }],
    ["list_laws", { limit: 101 }],
    ["list_laws", { offset: -1 }],
  ]) assert.equal((await call(name, args)).isError, true, `${name}: ${JSON.stringify(args)}`);
});
test("article retrieval includes citation, status and date; missing articles are errors", async () => {
  const result = await call("get_article", { law: " 民法典 ", article_number: 1 });
  assert.ok(!result.isError);
  assert.match(body(result), /civil-code\/1\.html/);
  assert.match(body(result), /现行有效/);
  const pending = await call("get_article", { law: "pending-law", article_number: 1 });
  assert.match(body(pending), /已公布尚未生效.*2027-01-01/);
  assert.equal((await call("get_article", { law: "civil-code", article_number: 99 })).isError, true);
  assert.equal((await call("get_article", { law: "不存在", article_number: 1 })).isError, true);
});
test("OR keyword search reports all hits while capping output at ten", async () => {
  const result = await call("search_in_law", { law: "civil-code", keywords: "违约 赔偿 赔偿" });
  assert.ok(!result.isError);
  assert.match(body(result), /共命中 12 条，显示前 10 条/);
  assert.equal((body(result).match(/https:\/\//g) ?? []).length, 10);
  assert.ok(body(result).indexOf("civil-code/1.html") < body(result).indexOf("civil-code/2.html"));
  const none = await call("search_in_law", { law: "civil-code", keywords: "不存在" });
  assert.ok(!none.isError);
  assert.match(body(none), /未检索到/);
});
test("upstream HTTP failures are actionable errors and can recover on retry", async () => {
  const args = { law: "unavailable", article_number: 1 };
  const failed = await call("get_article", args);
  assert.equal(failed.isError, true);
  assert.match(body(failed), /HTTP 503/);
  const recovered = await call("get_article", args);
  assert.ok(!recovered.isError);
});
