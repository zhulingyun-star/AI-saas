FROM node:20-bookworm-slim AS build
WORKDIR /source
COPY fronted/package*.json ./
RUN npm ci --registry=https://registry.npmjs.org --no-audit --no-fund
COPY fronted/ ./
RUN npm run build

FROM nginx:1.28-alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /source/dist /usr/share/nginx/html
EXPOSE 80
