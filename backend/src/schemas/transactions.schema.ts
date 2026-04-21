import { z } from "zod";

export const requestTransactionSchema = z.object({
  listingId: z.string().uuid(),
  offeredPrice: z.number().nonnegative(),
  ghgDiscount: z.number().nonnegative().optional().default(0),
  notes: z.string().max(1000).optional(),
});

export const respondTransactionSchema = z.object({
  transactionId: z.string().uuid(),
  action: z.enum(["approved", "rejected"]),
});

export const confirmTransactionSchema = z.object({});
