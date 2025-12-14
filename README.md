# MolCI

[![CI status badge](https://ci.emunest.net/api/badges/5/status.svg)](https://ci.emunest.net/repos/5)

## About

MolCI is an in-progress self-hosted CI system.

## Prerequisites
* Docker
* Node.js
* [`pnpm` package manager](https://pnpm.io/)

# Compiling and running code
1. Clone the repository:
2. Rename `.env.sample` to `.env` in /server and fill in the database credentials and OAuth secrets in that file.
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
