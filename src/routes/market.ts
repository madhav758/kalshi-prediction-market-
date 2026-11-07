

import { Router } from "express";
import { 
    createMarket, 
    createOrder, 
    deleteOrder, 
    getmarkets, 
    getUserOrders, 
    getUserPositions 
} from "../controller/market";
import auth from "../middleware";

const router = Router();

router.post("/createOrder", auth, createOrder);
router.delete("/order", auth, deleteOrder);
router.post("/market", auth, createMarket);
router.get("/", getmarkets);
router.get("/positions", auth, getUserPositions);
router.get("/my-orders", auth, getUserOrders);

export default router;