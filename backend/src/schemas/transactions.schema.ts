import { z } from "zod";

export const requestTransactionSchema = z.object({
  listingId: z.string().uuid(),
  offeredPrice: z.number().nonnegative(),
});

export const respondTransactionSchema = z.object({
  transactionId: z.string().uuid(),
  action: z.enum(["approved", "rejected"]),
});
