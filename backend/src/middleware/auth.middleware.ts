import { Request, Response, NextFunction } from "express";
import { supabaseAnon } from "../config/supabase";
import { AppError } from "../errors/app-error";

// Custom interface to extend Express Request with user and accessToken
interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
  };
  accessToken?: string;
}

export async function requireAuth(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new AppError(401, "Missing or invalid Authorization header");
    }

    const token = authHeader.slice("Bearer ".length).trim();

    if (!token) {
      throw new AppError(401, "Missing bearer token");
    }

    const { data, error } = await supabaseAnon.auth.getUser(token);

    if (error || !data.user) {
      throw new AppError(401, "Invalid or expired token");
    }

    req.user = { id: data.user.id };
    req.accessToken = token;

    next();
  } catch (error) {
    next(error);
  }
}
