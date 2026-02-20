import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";

import { healthRouter } from "./routes/health.routes";
import { listingsRouter } from "./routes/listings.routes";
import { errorHandler, notFoundHandler } from "./middleware/error.middleware";

export const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(morgan("dev"));

app.use("/health", healthRouter);
app.use("/listings", listingsRouter);

app.use(notFoundHandler);
app.use(errorHandler);
