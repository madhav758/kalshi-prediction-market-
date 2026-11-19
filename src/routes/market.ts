

import { Router } from "express";
import {
    createMarket,
    createOrder,
    deleteOrder,
    getmarkets,
    getOrderBookDepth,
    getUserOrders,
    getUserPositions,
    mint
} from "../controller/market";
import { auth, rateLimiter } from "../middleware";

const router = Router();

router.post("/createorder", auth, rateLimiter(10, 60), createOrder);
router.post("/createmarket", auth, createMarket);
router.delete("/deleteorder", auth, deleteOrder);
router.get("/", getmarkets);
router.get("/:marketId/orderbook", getOrderBookDepth);
router.get("/positions", auth, getUserPositions);
router.get("/my-orders", auth, getUserOrders);
router.post("/mint", auth, mint);


export default router;