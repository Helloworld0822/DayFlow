FROM node:20-alpine AS builder
WORKDIR /app

# install dependencies
COPY package.json package-lock.json ./
RUN npm ci --silent

# copy sources and build
COPY . .
RUN npm run build

# Exporter stage: copy built files to an output location at runtime
FROM alpine:3.18 AS exporter
WORKDIR /out
COPY --from=builder /app/dist /out/dist
# entrypoint copies /out/dist -> mounted /dist-out when run
COPY --from=builder /app/dist /out/dist
CMD ["/bin/sh","-c","cp -r /out/dist/* /dist-out/ || true"]
