FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --chown=node:node package.json ./package.json
COPY --chown=node:node scripts/relay-server.mjs ./scripts/relay-server.mjs
COPY --chown=node:node worker/handler.js worker/stream.js ./worker/
COPY --chown=node:node dist/providers.js ./dist/providers.js
USER node
EXPOSE 8080
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||process.env.LIFE_CFO_PORT||8080)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "scripts/relay-server.mjs"]
