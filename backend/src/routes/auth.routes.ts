import { Router } from "express";
import { signup, login, refresh, me, logout, updateProfile } from "../controllers/auth.controller";

export const authRouter = Router();

authRouter.post("/signup", signup);
authRouter.post("/login", login);
authRouter.post("/refresh", refresh);
authRouter.get("/me", me);
authRouter.post("/logout", logout);
authRouter.patch("/profile", updateProfile);
