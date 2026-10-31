# Runs the whole check suite: typecheck, unit tests, both Playwright projects.
# The Playwright image tag must match @playwright/test in package.json.
FROM mcr.microsoft.com/playwright:v1.64.1-noble

RUN npm install -g bun@1.4.2

WORKDIR /app
RUN chown pwuser:pwuser /app
USER pwuser

COPY --chown=pwuser:pwuser package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY --chown=pwuser:pwuser . .

CMD ["sh", "-c", "bun run typecheck && bun run test && bun run e2e"]
