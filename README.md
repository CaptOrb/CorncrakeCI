# MolCI

## About

MolCI is an in progress self hosted CI system

## Prerequisites
* Docker
* Node.js

# Compiling and running code
1. Clone the repository:
2. Rename `.env.sample` to `.env` in /server and fill in the database credentials and OAuth secrets in that file.
3. Inside /server directory, run:
   ```sh
   pnpm install
   ```
   then

   ```
   pnpm migrate
   ```
   then

   ```sh
   docker compose up --build
   ```
4. In another terminal inside /server directory, run:

   ```sh
   pnpm run dev
   ```

