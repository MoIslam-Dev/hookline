# HookLine — zero-dependency Node server.
#
# There is no `npm install` step on purpose: the app uses only the Node standard
# library, so the image is the runtime plus your source.
#
#   docker build -t hookline .
#   docker run -p 4000:4000 -e HOOKLINE_TOKEN=$(openssl rand -hex 24) hookline
#
# Node 24 (not 22) is deliberate: node:sqlite is available without the
# --experimental-sqlite flag from 22.13 onward, and 24 LTS prints no experimental
# warning. See the version note in README.md.
FROM node:24-alpine

WORKDIR /app

# The app is on the standard library, so there is nothing to install.
COPY package.json ./
COPY src ./src
COPY public ./public

# Never run as root. `node` already exists in the base image.
RUN mkdir -p /app/data && chown -R node:node /app
USER node

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4000 \
    HOOKLINE_DATA=/app/data

# The SQLite file must survive restarts and image rebuilds — mount a volume here.
VOLUME ["/app/data"]

EXPOSE 4000

# The app ships a health endpoint, so a failing container is detectable without
# scraping the dashboard HTML.
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# No token is baked in: HOOKLINE_TOKEN must be supplied at run time, otherwise
# HookLine generates one and stores it in the database. Supplying your own is
# what makes a public deployment safe.
CMD ["node", "src/cli.js"]
