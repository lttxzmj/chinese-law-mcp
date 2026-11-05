# chinese-law-mcp

中国法律法规 MCP 服务器：让 Claude、Cursor 等 AI 助手直接逐条查询 **1500+ 部现行中国法律、法律解释、司法解释与行政法规**（56,000+ 条，官方来源逐部人工核对）。实时数量以上游语料为准，见 [chinese-law-corpus](https://github.com/lttxzmj/chinese-law-corpus)（其 README 计数由脚本生成）。

MCP server for Chinese statutes: search 1500+ Chinese statutes, judicial interpretations and administrative regulations in force and fetch any article verbatim, with citable source links.

## 工具

| Tool | 说明 |
| --- | --- |
| `search_laws` | 按名称搜索法律（如「民法典」「劳动合同」） |
| `get_article` | 取指定条文原文（如民法典第 577 条），带章节位置、施行日期与可引用链接 |
| `search_in_law` | 在某部法律全文内按关键词检索条文 |

## 安装

无需安装，`npx` 直接运行。Claude Desktop / Cursor 等客户端配置：

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

## 数据与合规

- 数据来自 [chinese-law-corpus](https://github.com/lttxzmj/chinese-law-corpus)（CC0），经 jsDelivr CDN 只读拉取，进程内缓存；本服务器无遥测、无写操作。
- 法律文本依《著作权法》第五条不受著作权保护；本项目为非官方整理，正式引用请以官方公布文本为准，工具输出自带此提示。
- 每条结果附网页版链接（[法脉法律库](https://lttxzmj.github.io/lawpulse-site/)，57,000+ 页逐条可引用）。

## 关于

由 [法脉 LawPulse](https://lttxzmj.github.io/lawpulse-site/) 维护——给中国执业律师的本地优先桌面研究工具（离线法律库 + 法条笔记 + 引用可核实的合同审查）。数据随法律季度更新。

MIT License.
