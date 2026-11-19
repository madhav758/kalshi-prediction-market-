import { z } from "zod";
export const clientMessageSchema = z.discriminatedUnion("type",
    [
        z.object({
            type: z.literal("subscribe"),
            marketId: z.string().min(1)
        }),
        z.object({
            type: z.literal("unsubscribe"),
            marketId: z.string().min(1)
        }),
        z.object({ type: z.literal("ping") }),

    ]);
//Automatically creates the TS type from the Zod schema!
export type ClientMessage = z.infer<typeof clientMessageSchema>;


export type Depth = {
    bids: { price: number; totalQty: number }[];
    asks: { price: number; totalQty: number }[];
};
export type ServerMessage =
    | { type: "subscribed"; marketId: string }
    | { type: "unsubscribed"; marketId: string }
    | { type: "pong" }
    | { type: "error"; message: string }
    | { type: "orderbook.update"; marketId: string; side: "yes" | "no"; depth: Depth };