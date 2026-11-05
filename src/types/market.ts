import { z } from "zod";

// endpints. createMarketSchema , placeBetSchema

export const createMarketSchema = z.object({
    //title,initalWager,expiry, side
    title: z.string().trim().min(3),
})


export const createOrderSchema = z.object({
    //marketId, type,side, betAmount, qty
    marketId: z.string(),
    type: z.enum(["buy", "sell"]),
    side: z.enum(["yes", "no"]),
    amount: z.number().int().min(1).max(99),
    qty: z.number().int().positive(),
})
