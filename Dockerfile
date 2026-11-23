# MCP 服务器走 stdio，容器只是封装运行环境，不开端口。
# awesome-mcp-servers 与 Glama 的质量分要求能容器化运行，故留此文件。
FROM node:22-alpine

WORKDIR /app

# 只装生产依赖：装 devDependencies 会把镜像和构建时间都拖大，而 stdio
# 服务器运行期不需要测试工具链。
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY index.js ./

# 语料直读通道可被覆盖（私有镜像或自建网关）。
# 留空或不设置 LAW_MCP_DATA_BASE 时使用服务器的默认公共语料地址。

ENTRYPOINT ["node", "/app/index.js"]
