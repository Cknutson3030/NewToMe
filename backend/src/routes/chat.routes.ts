import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware";
import {
  getOrCreateConversation,
  listConversations,
  getMessages,
  sendMessage,
} from "../controllers/chat.controller";

export const chatRouter = Router();

// All chat routes require authentication
chatRouter.use(requireAuth);

chatRouter.post("/", getOrCreateConversation);
chatRouter.get("/", listConversations);
chatRouter.get("/:id/messages", getMessages);
chatRouter.post("/:id/messages", sendMessage);
