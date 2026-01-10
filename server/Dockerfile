FROM node:20-slim

RUN corepack enable && corepack prepare pnpm@10.16.0 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml ./

RUN pnpm install --frozen-lockfile

# Copy source files
COPY . .

RUN pnpm run generate

EXPOSE 3000

# Start server with tsx (handles TypeScript directly, no build step needed)
# tsx handles ES modules and TypeScript without requiring explicit file extensions
CMD ["pnpm", "exec", "tsx", "src/index.ts"]
