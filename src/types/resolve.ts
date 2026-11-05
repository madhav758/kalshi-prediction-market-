import { z } from "zod";

// endpints. resolveMarket


export const resolveMarketSchema = z.object({
    //marketId ,  resolution
    marketId: z.string(),
    resolution: z.enum(["yes", "no"])

})
