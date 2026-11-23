#!/usr/bin/env node
/**
 * chinese-law-mcp：中国法律法规 MCP 服务器。
 *
 * 数据来自开源语料库 chinese-law-corpus（Gitee，CC0，国家级现行法律、法律解释、
 * 司法解释与行政法规，全部取自官方来源），经其对象存储直读通道只读拉取，
 * 本进程内缓存。无遥测，无写操作。
 *
 * **规模数不在本文件里写死**：语料随官方公布持续增长，写死的数上次停在 412 部
 * （实际已超三倍），而工具描述里的数是模型唯一看得见的那个。现在一律从
 * laws/index.json 现算（见 corpusSize），文案里只留不会过期的下界。
 *
 * 由法脉 LawPulse（律师的本地优先桌面法律研究工具）维护：
 * https://lttxzmj.github.io/lawpulse-site/
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const DATA_BASE =
  process.env.LAW_MCP_DATA_BASE?.trim().replace(/\/+$/, "") ||
  "https://lawpulse-data-1256098921.cos.ap-beijing.myqcloud.com/corpus";
const SITE_BASE = "https://lttxzmj.github.io/lawpulse-site";
const DISCLAIMER = "（来源：chinese-law-corpus，非官方整理；正式引用请以官方公布文本为准）";

const cache = new Map();

async function fetchJson(path) {
  if (cache.has(path)) {
    return cache.get(path);
  }
  const response = await fetch(`${DATA_BASE}/${path}`, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) {
    throw new Error(`数据拉取失败 HTTP ${response.status}: ${path}`);
  }
  const data = await response.json();
  cache.set(path, data);
  return data;
}

const lawIndex = () => fetchJson("laws/index.json");

/** 语料规模：取自刚拉到的索引，永远与上游一致。 */
const corpusSize = (index) => `${index.length} 部`;

/** 法名解析：精确 > 去「中华人民共和国」前缀精确 > 包含。 */
async function resolveLaw(query) {
  const index = await lawIndex();
  const q = query.trim();
  const strip = (t) => t.replace(/^中华人民共和国/, "");
  const exact = index.find((l) => l.title === q || l.slug === q) ??
    index.find((l) => strip(l.title) === strip(q));
  if (exact) return exact;
  const matches = index.filter((l) => l.title.includes(q) || strip(l.title).includes(strip(q)));
  if (matches.length > 1) {
    throw new Error(`法律名称「${q}」有多个匹配，请先用 search_laws 查找，再传入准确 id：\n` +
      matches.slice(0, 20).map((l) => `${l.title}（id: ${l.slug}）`).join("\n"));
  }
  return matches[0];
}

const articleUrl = (slug, n) => `${SITE_BASE}/laws/${slug}/${n}.html`;

/** 效力状态说人话：原来 effective 之外的值会把 pending 这样的字段值原样报给模型。 */
const statusLabel = (status) =>
  ({ effective: "现行有效", pending: "已公布尚未生效" })[status] ?? "见原文";
const text = (value, structuredContent) => ({
  content: [{ type: "text", text: value }],
  ...(structuredContent ? { structuredContent } : {}),
});
const errorText = (value) => ({ ...text(value), isError: true });
const nonEmpty = () => z.string().trim().min(1).max(200);
const readOnly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };
const pagination = {
  offset: z.number().int().min(0).default(0).describe("从第几条结果开始（0 起始）；下一页使用返回的 next_offset，默认 0"),
  limit: z.number().int().min(1).max(100).default(20).describe("每页结果数，1–100，默认 20"),
};
const pageOf = (laws, offset, limit) => ({
  total: laws.length,
  offset,
  next_offset: offset + limit < laws.length ? offset + limit : null,
  laws: laws.slice(offset, offset + limit).map((l) => ({
    id: l.slug, title: l.title, article_count: l.articleCount,
    ...(l.category ? { category: l.category } : {}),
    ...(l.status ? { status: l.status } : {}),
  })),
});
const formatPage = (page) => `共 ${page.total} 部，本页 ${page.laws.length} 部；next_offset: ${page.next_offset ?? "无"}\n` +
  page.laws.map((l) => `${l.title}（id: ${l.id}，共 ${l.article_count} 条）`).join("\n") + `\n${DISCLAIMER}`;

const server = new McpServer({ name: "chinese-law", version: "1.1.0" });

server.tool(
  "list_laws",
  "分页浏览语料库的法律目录，无需已知法名。适合发现可查法律和取得准确 id；已知名称时优先用 search_laws。返回 total、laws（id/title/article_count，及上游提供的 category/status）、next_offset；next_offset 为 null 表示结束。目录以运行时语料为准，不含地方性法规，效力状态以 get_article 的全文元数据为准。只读，无需 API key。例：{limit:20,offset:0}。",
  pagination,
  readOnly,
  async ({ offset, limit }) => {
    const page = pageOf(await lawIndex(), offset, limit);
    return text(formatPage(page), page);
  },
);

server.tool(
  "search_laws",
  "按名称关键词或准确 id 查找中国法律、法律解释、司法解释与行政法规，不检索条文正文。返回 total、laws（id/title/article_count）、next_offset，默认每页20部；无匹配返回空列表。将结果 id 传给 get_article 或 search_in_law；不知道法名时用 list_laws。覆盖范围和数量由实时目录决定，不含地方性法规；效力状态以全文元数据为准。只读，无需 API key。例：{query:'劳动合同'}。",
  { query: nonEmpty().describe("非空法律名称、名称关键词或准确 id，如「民法典」「劳动合同」或 civil-code；不是条文正文关键词"), ...pagination },
  readOnly,
  async ({ query, offset, limit }) => {
    const index = await lawIndex();
    const q = query.trim().replace(/^中华人民共和国/, "");
    if (!q) return errorText("请输入具体法名或关键词；浏览全部目录请使用 list_laws。");
    const hits = index.filter((l) => l.title.includes(q) || l.slug === query);
    const page = pageOf(hits, offset, limit);
    if (!hits.length) {
      return text(
        `未找到包含「${query}」的法律。语料库收录国家级法律、法律解释、司法解释与行政法规 ${corpusSize(index)}，不含地方性法规。可用 list_laws 浏览目录。`, page,
      );
    }
    return text(formatPage(page), page);
  },
);

server.tool(
  "get_article",
  "已知法律和条号时取指定条文原文，不用于关键词搜索或法律意见。优先传 search_laws/list_laws 返回的准确 id；法名存在多个匹配会报错并列候选，不会擅自选择。返回条文全文、章节位置、效力状态、施行日期与逐条引用链接；不存在的法律或条号返回 isError。条号只接受正整数，不支持“之一”等附加条号。只读，无需 API key。例：{law:'civil-code',article_number:577}。",
  {
    law: nonEmpty().describe("准确法律 id（推荐）或非空法律名称，如 civil-code 或「民法典」；名称歧义时先 search_laws"),
    article_number: z.number().int().positive().describe("条号（阿拉伯数字），如 577"),
  },
  readOnly,
  async ({ law, article_number }) => {
    const meta = await resolveLaw(law);
    if (!meta) {
      return errorText(`未找到法律「${law}」。可先用 search_laws 查准确名称。`);
    }
    const full = await fetchJson(`laws/${meta.slug}.json`);
    const article = full.articles.find((a) => a.articleNumber === article_number);
    if (!article) {
      return errorText(`《${full.title}》共 ${full.articleCount} 条，没有第 ${article_number} 条。`);
    }
    const lines = [
      `《${full.title}》${article.displayNumber}`,
      article.path?.length ? `（${article.path.join(" · ")}）` : "",
      "",
      article.text,
      "",
      `效力状态：${statusLabel(full.status)}；施行日期：${full.effectiveDate ?? "见原文"}`,
      `引用链接：${articleUrl(meta.slug, article_number)}`,
      DISCLAIMER,
    ];
    return text(lines.filter((l) => l !== "").join("\n"));
  },
);

server.tool(
  "search_in_law",
  "在一部指定法律的条文正文内检索关键词，不跨法律搜索，也不搜索法律名称。多个词用空格分隔，按 OR 匹配、命中词数降序排列，同分按原文顺序；最多返回10条摘录和引用链接，并报告全部命中数。用 get_article 按条号取完整原文。无命中为正常空结果；法名不存在或歧义返回 isError。只读，无需 API key。例：{law:'civil-code',keywords:'违约 赔偿'}。",
  {
    law: nonEmpty().describe("准确法律 id（推荐）或非空法律名称；可先用 search_laws 获取，如 civil-code"),
    keywords: nonEmpty().describe("非空正文关键词，多个词用空格分隔，OR 匹配并按命中词数排序，如「违约 赔偿」；不是自然语言问题"),
  },
  readOnly,
  async ({ law, keywords }) => {
    const meta = await resolveLaw(law);
    if (!meta) {
      return errorText(`未找到法律「${law}」。可先用 search_laws 查准确名称。`);
    }
    const full = await fetchJson(`laws/${meta.slug}.json`);
    const terms = [...new Set(keywords.trim().split(/\s+/).filter(Boolean))];
    const scored = full.articles
      .map((a) => ({ a, score: terms.filter((t) => a.text.includes(t)).length }))
      .filter((x) => x.score > 0)
      .sort((x, y) => y.score - x.score);
    if (!scored.length) {
      return text(`《${full.title}》中未检索到「${keywords}」。`);
    }
    return text(
      `《${full.title}》共命中 ${scored.length} 条，显示前 ${Math.min(scored.length, 10)} 条：\n\n` +
        scored.slice(0, 10)
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
