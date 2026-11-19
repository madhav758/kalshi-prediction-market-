import { Router } from "express";
import { resolve } from "../controller/resolve";
import { auth } from "../middleware";

const router = Router();

router.post("/", auth, resolve);

export default router;

