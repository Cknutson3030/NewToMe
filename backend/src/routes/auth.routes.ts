import { Router } from "express";
import { signup, login, refresh, me, logout } from "../controllers/auth.controller";

export const authRouter = Router();

authRouter.post("/signup", signup);
authRouter.post("/login", login);
authRouter.post("/refresh", refresh);
authRouter.get("/me", me);
authRouter.post("/logout", logout);
