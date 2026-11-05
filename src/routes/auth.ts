// signup , signin , onramp , getProfile , getTransactions

import { Router } from "express";
import { getProfile, getTransactions, onramp, signin, signup } from "../controller/auth";


const router = Router();


router.post("/signup", signup);
router.post("/signin", signin);
//needs middleware-> todo 
router.post("/onramp", onramp);
router.get("/getProfile", getProfile)
router.get("/getTransaction", getTransactions)

export default router;

