import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware";
import { validate } from "../middleware/validate.middleware";
import {
  requestTransaction,
  respondTransaction,
  confirmTransaction,
  getMyTransactions,
  getGhgHistory,
} from "../controllers/transactions.controller";
import { requestTransactionSchema, respondTransactionSchema } from "../schemas/transactions.schema";

export const transactionsRouter = Router();

// Buyer requests to buy a listing
transactionsRouter.post(
	"/request",
	requireAuth,
	validate({ body: requestTransactionSchema }),
	requestTransaction
);

// Seller responds to a transaction (approve/reject)
transactionsRouter.post(
	"/respond",
	requireAuth,
	validate({ body: respondTransactionSchema }),
	respondTransaction
);

// Buyer or seller confirms transaction completion
transactionsRouter.post(
	"/:id/confirm",
	requireAuth,
	confirmTransaction
);

// List transactions for current user (optional query: role=seller|buyer|all, status)
transactionsRouter.get(
  "/mine",
  requireAuth,
  getMyTransactions
);

// Get GHG history for current user
transactionsRouter.get(
  "/ghg-history",
  requireAuth,
  getGhgHistory
);
