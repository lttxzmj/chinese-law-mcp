// 真实 stdio MCP 冒烟：服务器、公共语料通道及条文格式必须全部可用。
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: process.execPath, args: ["index.js"],
  // Docker 曾设置此变量为空字符串；确保默认公共数据地址仍可用。
  env: { ...process.env, LAW_MCP_DATA_BASE: "" },
});
const client = new Client({ name: "live-smoke", version: "1.0.0" });
try {
  await client.connect(transport);
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((t) => t.name).sort(), ["get_article", "list_laws", "search_in_law", "search_laws"]);
  const page = await client.callTool({ name: "list_laws", arguments: { limit: 1 } });
  assert.ok(!page.isError, JSON.stringify(page));
  assert.ok(page.structuredContent.total > 0);
  const art = await client.callTool({ name: "get_article", arguments: { law: "民法典", article_number: 577 } });
  assert.ok(!art.isError, JSON.stringify(art));
  const text = art.content[0].text;
  assert.ok(text.includes("第五百七十七条") && text.includes("civil-code/577.html"), text.slice(0, 300));
  console.log(`live smoke OK: ${page.structuredContent.total} laws; Civil Code article 577 verified`);
} finally {
  await client.close();
}
