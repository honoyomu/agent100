FROM node:22-slim AS build
WORKDIR /app
RUN npm install -g pnpm@11.20.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY patches patches
COPY apps/web/package.json apps/web/
COPY apps/server/package.json apps/server/
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm -r build
RUN pnpm --filter server deploy --prod --legacy /out

FROM node:22-slim
ENV NODE_ENV=production PORT=3000 WEB_DIST=/app/web
COPY --from=build /out /app/server
COPY --from=build /app/apps/web/dist /app/web
WORKDIR /app/server
EXPOSE 3000
CMD ["node", "dist/index.js"]
