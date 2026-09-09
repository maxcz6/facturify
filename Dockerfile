FROM node:24-alpine AS build
WORKDIR /app
RUN apk add --no-cache openssl
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci
RUN npx prisma generate
COPY . .
RUN npm run build

FROM build AS migration
CMD ["npx", "prisma", "migrate", "deploy"]

FROM build AS runtime-dependencies
RUN npm prune --omit=dev --omit=peer
RUN npm uninstall prisma --omit=dev --omit=peer && npm prune --omit=dev --omit=peer
RUN test ! -d node_modules/prisma && test ! -d node_modules/@prisma/config

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache openssl
COPY package*.json ./
COPY --from=runtime-dependencies /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
EXPOSE 3000
CMD ["node", "dist/main"]
