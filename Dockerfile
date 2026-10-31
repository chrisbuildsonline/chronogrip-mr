# Serves the production build on port 4173. `bun run check` in this image runs typecheck, unit tests and both Playwright projects.
# The Playwright image tag must match @playwright/test in package.json.
FROM mcr.microsoft.com/playwright:v1.64.1-noble

RUN npm install -g bun@1.4.2

WORKDIR /app
RUN chown pwuser:pwuser /app
USER pwuser

COPY --chown=pwuser:pwuser package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY --chown=pwuser:pwuser . .

RUN bun run build

EXPOSE 4173

CMD ["bun", "run", "serve"]
