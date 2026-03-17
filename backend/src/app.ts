import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";

import { healthRouter } from "./routes/health.routes";
import { authRouter } from "./routes/auth.routes";
import { listingsRouter } from "./routes/listings.routes";
import { transactionsRouter } from "./routes/transactions.routes";
import { errorHandler, notFoundHandler } from "./middleware/error.middleware";

export const app = express();

app.use(helmet());
app.use(cors({ origin: "*" })); // temporary for debug; lock down in prod
app.use(express.json({ limit: "2mb" }));
app.use(morgan("dev"));


app.use("/health", healthRouter);
app.use("/auth", authRouter);
app.use("/listings", listingsRouter);
app.use("/transactions", transactionsRouter);

app.use(notFoundHandler);
app.use(errorHandler);
