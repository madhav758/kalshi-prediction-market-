

import { Router } from "express";
import { createMarket, createOrder, getmarkets } from "../controller/market";
import auth from "../middleware";

const router = Router();

router.post("/createOrder", auth, createOrder)
router.post("/market", auth, createMarket);
router.get("/", getmarkets);

export default router;