import { ErrorRequestHandler, RequestHandler } from "express";
import multer from "multer";
import { ZodError } from "zod";
import { AppError } from "../errors/app-error";

type SupabaseErrorLike = {
  message: string;
  code?: string;
  details?: string | null;
  hint?: string | null;
};

const isSupabaseError = (value: unknown): value is SupabaseErrorLike => {
  if (!value || typeof value !== "object") {
    return false;
  }

  return "message" in value && typeof (value as SupabaseErrorLike).message === "string";
};

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new AppError(404, `Route not found: ${req.method} ${req.originalUrl}`));
};

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof ZodError) {
    return res.status(400).json({
      error: "Validation error",
      details: error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    });
  }

  if (error instanceof multer.MulterError) {
    return res.status(400).json({
      error: "Upload error",
      details: error.message,
    });
  }

  if (error instanceof AppError) {
    return res.status(error.statusCode).json({
      error: error.message,
      details: error.details,
    });
  }

  if (isSupabaseError(error)) {
    return res.status(400).json({
      error: error.message,
      details: {
        code: error.code,
        details: error.details,
        hint: error.hint,
      },
    });
  }

  console.error(error);
  return res.status(500).json({ error: "Internal server error" });
};
