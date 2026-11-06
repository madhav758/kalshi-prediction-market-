// signup , signin , onramp , getProfile , getTransactions

import { Router } from "express";
import { getProfile, getTransactions, onramp, signin, signup } from "../controller/auth";
import auth from "../middleware";


const router = Router();


router.post("/signup", signup);
router.post("/signin", signin);
//needs middleware-> todo 
router.post("/onramp", auth, onramp);
router.get("/getProfile", auth, getProfile)
router.get("/getTransaction", auth, getTransactions)

export default router;

