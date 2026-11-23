# chinese-law-mcp

[![Glama score](https://glama.ai/mcp/servers/lttxzmj/chinese-law-mcp/badges/score.svg)](https://glama.ai/mcp/servers/lttxzmj/chinese-law-mcp)

中国法律法规 MCP 服务器：让 Claude、Cursor 等 AI 助手直接逐条查询 **1500+ 部现行中国法律、法律解释、司法解释与行政法规**（56,000+ 条）。实时数量以上游语料为准，见 [chinese-law-corpus](https://gitee.com/chengzi_h/chinese-law-corpus)（其 README 计数由脚本生成）。

MCP server for Chinese statutes: search 1500+ Chinese statutes, judicial interpretations and administrative regulations in force and fetch any article verbatim, with citable source links. Install with `npx -y github:lttxzmj/chinese-law-mcp` — no API key, no telemetry, read-only.

```json
{ "mcpServers": { "chinese-law": { "command": "npx", "args": ["-y", "github:lttxzmj/chinese-law-mcp"] } } }
```

## 工具

| Tool | 说明 |
| --- | --- |
| `list_laws` | 不知道法名时分页浏览目录，获取准确法律 id |
| `search_laws` | 按名称关键词或准确 id 搜索法律，可分页（如「民法典」「劳动合同」） |
| `get_article` | 取指定条文原文（如民法典第 577 条），带章节位置、施行日期与可引用链接 |
| `search_in_law` | 在某部法律全文内按关键词检索条文 |

建议先用 `search_laws` 查找法律，将返回的准确 `id` 传给 `get_article` 或 `search_in_law`。
名称存在多个匹配时会返回错误与候选，不自动选择第一部法律。
`list_laws` 和 `search_laws` 默认每页 20 部，`limit` 范围为 1–100，`offset` 从 0 开始；
返回的 `structuredContent` 包含 `total`、`laws` 和 `next_offset`，后者为 `null` 表示结束。
`search_in_law` 的多个关键词用空格分隔、按 OR 匹配；返回全部命中数及前 10 条摘录，完整原文请用 `get_article`。
空白参数、歧义法名、缺失条文和取数失败会通过 MCP `isError` 标识；搜索无命中是正常空结果。
条号使用正整数，暂不支持“之一”等附加条号。目录可能包含已公布尚未生效的文本，效力状态以条文返回的全文元数据为准。

## 安装

无需安装，`npx` 直接运行。Claude Desktop / Cursor / Cline 等客户端配置：

```json
{
  "mcpServers": {
    "chinese-law": {
      "command": "npx",
      "args": ["-y", "github:lttxzmj/chinese-law-mcp"]
    }
  }
}
```

容器运行（stdio，不开端口）：

```bash
docker build -t chinese-law-mcp .
docker run -i --rm chinese-law-mcp
```

无需配置环境变量。可用 `LAW_MCP_DATA_BASE` 指定同格式语料镜像；未设置或留空均使用默认公共地址。
语料按文件缓存于当前进程，重启进程可刷新。单次取数超时为 15 秒。

## 开发验证

```bash
npm install
npm test             # 本机夹具 + 真实 stdio MCP 协议回归，不依赖公网语料
npm run test:smoke   # 真实公共语料目录与民法典第 577 条冒烟，需要网络
```

`npm test` 覆盖分页、参数边界、法名歧义、效力状态、检索截断和上游 HTTP 故障恢复。
在 Glama 中使用构建步骤 `["npm install --omit=dev --no-audit --no-fund"]`，
启动参数 `["mcp-proxy", "--", "node", "./index.js"]`，无需 `npm run build` 或 API key。

## 配置教程

面向律师的图文配置步骤（含客户端选择、安全注意项与使用示例）：
[让 AI 助手直接查到现行法条：给律师的 MCP 入门](https://lttxzmj.github.io/lawpulse-site/blog/mcp-connect-ai-to-law.html)。
更多律师 AI 实务教程见 [律师 AI 实务手册](https://lttxzmj.github.io/lawpulse-site/blog/index.html)。

## 数据与合规

- 数据来自 [chinese-law-corpus](https://gitee.com/chengzi_h/chinese-law-corpus)（Gitee，CC0），经其对象存储直读通道只读拉取，进程内缓存；本服务器无遥测、无写操作。
- 法律文本依《著作权法》第五条不受著作权保护；本项目为非官方整理，正式引用请以官方公布文本为准，工具输出自带此提示。
- 每条结果附网页版链接（[法脉法律库](https://lttxzmj.github.io/lawpulse-site/)，57,000+ 页逐条可引用）。

## 关于

由 [法脉 LawPulse](https://lttxzmj.github.io/lawpulse-site/) 维护——给中国执业律师的本地优先桌面研究工具（离线法律库 + 法条笔记 + 引用可核实的合同审查）。数据随法律季度更新。

MIT License.

## 相关项目

- [chinese-law-skills](https://github.com/lttxzmj/chinese-law-skills)：同一语料的 Agent 技能库（法条引用核验、合同审查清单、诉讼计算器等 13 个，Claude Code 一条命令安装，plugin 已捆带本 MCP）。
- [法脉桌面端](https://lttxzmj.github.io/lawpulse-site/)：离线法律库 + 法条笔记 + AI 合同审查。
