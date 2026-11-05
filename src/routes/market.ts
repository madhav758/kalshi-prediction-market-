

import { Router } from "express";
import { createMarket, getmarkets } from "../controller/market";

const router = Router();


router.post("/", createMarket);
router.get("/", getmarkets);

export default router;