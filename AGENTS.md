# Kalsho – prediction market (Express + Mongoose, Bun/tsx)

## Run
- Install: `bun install`
- Dev server: `bun run dev` (runs `tsx src/index.ts`; real entry is `src/index.ts`, root `index.ts` is empty)
- Tests: `bun test` (`src/engine/orderbook.test.ts`)
- Env (`.env`): `DATABASE_URL`, `JWT_SECRET`, `PORT`

## Layout
- `src/index.ts` – express app, mounts `/api/v1/auth`, `/api/v1/market`; connects mongoose
- `src/routes/*` → `src/controller/*` (auth, market, resolve) → `src/model/*` (Mongoose)
- `src/types/*` – zod request schemas
- `src/engine/index.ts` – in-memory matching engine (`OrderBook`, `Engine`, singleton `engine`)
- `src/middleware.ts` – JWT auth, sets `req.userId`

## Domain
- Prices are integers 1–99; a winning share pays 100.
- Each market has two books (yes, no). Orders: `Bid`/`Ask`; balances: `User.balance/lockedBalance`, `StockBalance.qty/locked`.
- Intended ownership: controller = validate + lock funds + persist; engine = match only; controller persists engine fills.

## Known gaps
See conversation notes: engine is not wired into `createOrder`; Mongo-based matching still lives in the controller.

