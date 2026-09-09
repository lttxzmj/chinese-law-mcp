#!/usr/bin/env node
/**
 * chinese-law-mcp：中国法律法规 MCP 服务器。
 *
 * 数据来自开源语料库 chinese-law-corpus（CC0，412 部现行有效法律与司法解释、
 * 26,000+ 条逐条结构化，官方来源逐部人工核对），经 jsDelivr CDN 只读拉取，
 * 本进程内缓存。无遥测，无写操作。
 *
 * 由法脉 LawPulse（律师的本地优先桌面法律研究工具）维护：
 * https://lttxzmj.github.io/lawpulse-site/
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const DATA_BASE =
  process.env.LAW_MCP_DATA_BASE ?? "https://cdn.jsdelivr.net/gh/lttxzmj/chinese-law-corpus@master";
const SITE_BASE = "https://lttxzmj.github.io/lawpulse-site";
const DISCLAIMER = "（来源：chinese-law-corpus，非官方整理；正式引用请以官方公布文本为准）";

const cache = new Map();

async function fetchJson(path) {
  if (cache.has(path)) {
    return cache.get(path);
  }
  const response = await fetch(`${DATA_BASE}/${path}`);
  if (!response.ok) {
    throw new Error(`数据拉取失败 HTTP ${response.status}: ${path}`);
  }
  const data = await response.json();
  cache.set(path, data);
  return data;
}

const lawIndex = () => fetchJson("laws/index.json");

/** 法名解析：精确 > 去「中华人民共和国」前缀精确 > 包含。 */
async function resolveLaw(query) {
  const index = await lawIndex();
  const q = query.trim();
  const strip = (t) => t.replace(/^中华人民共和国/, "");
  return (
    index.find((l) => l.title === q || l.slug === q) ??
    index.find((l) => strip(l.title) === strip(q)) ??
    index.find((l) => l.title.includes(q) || strip(l.title).includes(strip(q)))
  );
}

const articleUrl = (slug, n) => `${SITE_BASE}/laws/${slug}/${n}.html`;
const text = (value) => ({ content: [{ type: "text", text: value }] });

const server = new McpServer({ name: "chinese-law", version: "1.0.0" });

server.tool(
  "search_laws",
  "按名称搜索中国现行有效的法律与司法解释（412 部）。返回法律标题、id 与条数。",
  { query: z.string().describe("法律名称或关键词，如「民法典」「劳动合同」") },
  async ({ query }) => {
    const index = await lawIndex();
    const q = query.trim().replace(/^中华人民共和国/, "");
    const hits = index.filter((l) => l.title.includes(q)).slice(0, 20);
    if (!hits.length) {
      return text(`未找到包含「${query}」的法律。语料库收录现行有效国家法律与司法解释 412 部，不含地方性法规。`);
    }
    return text(
      hits
        .map((l) => `${l.title}（id: ${l.slug}，共 ${l.articleCount} 条）`)
        .join("\n") + `\n${DISCLAIMER}`,
    );
  },
);

server.tool(
  "get_article",
  "取某部法律的指定条文原文。返回条文全文、章节位置、施行日期与可引用的网页链接。",
  {
    law: z.string().describe("法律名称或 id，如「民法典」或 civil-code"),
    article_number: z.number().int().positive().describe("条号（阿拉伯数字），如 577"),
  },
  async ({ law, article_number }) => {
    const meta = await resolveLaw(law);
    if (!meta) {
      return text(`未找到法律「${law}」。可先用 search_laws 查准确名称。`);
    }
    const full = await fetchJson(`laws/${meta.slug}.json`);
    const article = full.articles.find((a) => a.articleNumber === article_number);
    if (!article) {
      return text(`《${full.title}》共 ${full.articleCount} 条，没有第 ${article_number} 条。`);
    }
    const lines = [
      `《${full.title}》${article.displayNumber}`,
      article.path?.length ? `（${article.path.join(" · ")}）` : "",
      "",
      article.text,
      "",
      `效力状态：${full.status === "effective" ? "现行有效" : full.status}；施行日期：${full.effectiveDate ?? "见原文"}`,
      `引用链接：${articleUrl(meta.slug, article_number)}`,
      DISCLAIMER,
    ];
    return text(lines.filter((l) => l !== "").join("\n"));
  },
);

server.tool(
  "search_in_law",
  "在某部法律的全部条文里按关键词检索，返回命中条文的条号、摘录与链接。",
  {
    law: z.string().describe("法律名称或 id"),
    keywords: z.string().describe("检索关键词，空格分隔多个"),
  },
  async ({ law, keywords }) => {
    const meta = await resolveLaw(law);
    if (!meta) {
      return text(`未找到法律「${law}」。可先用 search_laws 查准确名称。`);
    }
    const full = await fetchJson(`laws/${meta.slug}.json`);
    const terms = keywords.trim().split(/\s+/).filter(Boolean);
    const scored = full.articles
      .map((a) => ({ a, score: terms.filter((t) => a.text.includes(t)).length }))
      .filter((x) => x.score > 0)
      .sort((x, y) => y.score - x.score)
      .slice(0, 10);
    if (!scored.length) {
      return text(`《${full.title}》中未检索到「${keywords}」。`);
    }
    return text(
      `《${full.title}》命中 ${scored.length} 条：\n\n` +
        scored
          .map(({ a }) => {
            const i = a.text.indexOf(terms.find((t) => a.text.includes(t)));
            const snippet = a.text.slice(Math.max(0, i - 20), i + 60).replace(/\n/g, " ");
            return `${a.displayNumber}：…${snippet}…\n  ${articleUrl(meta.slug, a.articleNumber)}`;
          })
          .join("\n") + `\n${DISCLAIMER}`,
    );
  },
);

await server.connect(new StdioServerTransport());
