# CorncrakeCI

[![CI status badge](https://ci.emunest.net/api/badges/5/status.svg)](https://ci.emunest.net/repos/5)

## About

CorncrakeCI is an in-progress self-hosted CI system.

## Prerequisites
* Docker
* Node.js
* [`pnpm` package manager](https://pnpm.io/)

# Compiling and running code
1. Clone the repository:
2. Rename `.env.sample` to `.env` in /server and fill in the database credentials, OAuth secrets and encryption key in that file.

   Could use ``openssl rand -hex 32`` to generate an encryption key

3. Inside /server directory, run:
   ```sh
   pnpm install
   ```
   then

   ```
   pnpm generate
   ```
   then

   ```sh
   docker compose up --build
   ```
4. In another terminal inside /server directory, run:

   ```sh
   pnpm run dev
   ```
