import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware";
import { validate } from "../middleware/validate.middleware";
import { requestTransaction, respondTransaction } from "../controllers/transactions.controller";
import { getMyTransactions } from "../controllers/transactions.controller";
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

// List transactions for current user (optional query: role=seller|buyer|all, status)
transactionsRouter.get(
  "/mine",
  requireAuth,
  getMyTransactions
);
