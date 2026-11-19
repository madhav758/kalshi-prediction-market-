import { z } from "zod";

// endpints. createMarketSchema , placeBetSchema

export const createMarketSchema = z.object({
    //title,initalWager,expiry, side
    title: z.string().trim().min(3),
    expiry: z.coerce.date().refine((d) => d > new Date(), {
        message: "expiry must be in the future",
    }),
})


export const createOrderSchema = z.object({
    //marketId, type,side, betAmount, qty
    marketId: z.string(),
    type: z.enum(["buy", "sell"]),
    side: z.enum(["yes", "no"]),
    amount: z.number().int().min(1).max(99),
    qty: z.number().int().positive(),
})

export const deleteOrderSchema = z.object({
    orderId: z.string(),
    orderType: z.enum(["buy", "sell"]),
})

export const mintSchema = z.object({
    marketId: z.string(),
    qty: z.number().int().positive(),
});