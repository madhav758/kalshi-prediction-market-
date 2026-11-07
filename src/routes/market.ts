

import { Router } from "express";
import {
    createMarket,
    createOrder,
    deleteOrder,
    getmarkets,
    getOrderBookDepth,
    getUserOrders,
    getUserPositions
} from "../controller/market";
import auth from "../middleware";

const router = Router();

router.post("/createorder", auth, createOrder);
router.post("/createmarket", auth, createMarket);
router.delete("/deleteorder", auth, deleteOrder);
router.get("/", getmarkets);
router.get("/:marketId/orderbook", getOrderBookDepth);
router.get("/positions", auth, getUserPositions);
router.get("/my-orders", auth, getUserOrders);

export default router;