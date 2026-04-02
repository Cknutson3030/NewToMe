import { RequestHandler } from "express";
import { supabaseAdmin, supabaseAnon } from "../config/supabase";
import { AppError } from "../errors/app-error";

/**
 * POST /auth/signup
 * Body: { email, password }
 * Creates a new user via Supabase Auth.
 */
export const signup: RequestHandler = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      throw new AppError(400, "Email and password are required");
    }

    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // auto-confirm for now; remove if you want email verification
    });

    if (error) {
      throw new AppError(400, error.message);
    }

    // Sign the user in immediately so we can return a session
    // Use supabaseAnon so we don't contaminate supabaseAdmin's in-memory session
    const { data: signInData, error: signInError } =
      await supabaseAnon.auth.signInWithPassword({ email, password });

    if (signInError || !signInData.session) {
      // User created but auto-login failed — still a success, they can log in manually
      res.status(201).json({
        data: {
          user: { id: data.user.id, email: data.user.email },
          session: null,
        },
      });
      return;
    }

    res.status(201).json({
      data: {
        user: {
          id: signInData.user.id,
          email: signInData.user.email,
        },
        session: {
          access_token: signInData.session.access_token,
          refresh_token: signInData.session.refresh_token,
          expires_at: signInData.session.expires_at,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /auth/login
 * Body: { email, password }
 * Returns access_token + refresh_token.
 */
export const login: RequestHandler = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      throw new AppError(400, "Email and password are required");
    }

    // Use supabaseAnon so we don't contaminate supabaseAdmin's in-memory session
    const { data, error } = await supabaseAnon.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      throw new AppError(401, error.message);
    }

    if (!data.session) {
      throw new AppError(401, "Login failed — no session returned");
    }

    res.status(200).json({
      data: {
        user: {
          id: data.user.id,
          email: data.user.email,
        },
        session: {
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
          expires_at: data.session.expires_at,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /auth/refresh
 * Body: { refresh_token }
 * Returns a fresh access_token.
 */
export const refresh: RequestHandler = async (req, res, next) => {
  try {
    const { refresh_token } = req.body;

    if (!refresh_token) {
      throw new AppError(400, "refresh_token is required");
    }

    // Use supabaseAnon so we don't contaminate supabaseAdmin's in-memory session
    const { data, error } = await supabaseAnon.auth.refreshSession({
      refresh_token,
    });

    if (error || !data.session) {
      throw new AppError(401, error?.message ?? "Unable to refresh session");
    }

    res.status(200).json({
      data: {
        user: {
          id: data.user!.id,
          email: data.user!.email,
        },
        session: {
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
          expires_at: data.session.expires_at,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /auth/me
 * Requires Authorization: Bearer <access_token>
 * Returns the current user including display_name from profile.
 */
export const me: RequestHandler = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith("Bearer ")) {
      throw new AppError(401, "Missing or invalid Authorization header");
    }

    const token = authHeader.slice("Bearer ".length).trim();
    const { data, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !data.user) {
      throw new AppError(401, "Invalid or expired token");
    }

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("display_name, ghg_balance")
      .eq("id", data.user.id)
      .maybeSingle();

    res.status(200).json({
      data: {
        user: {
          id: data.user.id,
          email: data.user.email,
          display_name: profile?.display_name ?? null,
          ghg_balance: Number(profile?.ghg_balance ?? 0),
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /auth/profile
 * Requires Authorization: Bearer <access_token>
 * Body: { display_name }
 * Creates or updates the user's display name.
 */
export const updateProfile: RequestHandler = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith("Bearer ")) {
      throw new AppError(401, "Missing or invalid Authorization header");
    }

    const token = authHeader.slice("Bearer ".length).trim();
    const { data, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !data.user) {
      throw new AppError(401, "Invalid or expired token");
    }

    const { display_name } = req.body as { display_name?: string };

    if (!display_name || display_name.trim().length === 0) {
      throw new AppError(400, "display_name is required");
    }

    if (display_name.trim().length > 100) {
      throw new AppError(400, "display_name must be 100 characters or fewer");
    }

    const { error: upsertError } = await supabaseAdmin
      .from("profiles")
      .upsert({ id: data.user.id, display_name: display_name.trim() });

    if (upsertError) throw upsertError;

    res.status(200).json({ data: { display_name: display_name.trim() } });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /auth/logout
 * Requires Authorization: Bearer <access_token>
 * Revokes the session on the Supabase side.
 */
export const logout: RequestHandler = async (req, res, next) => {
  try {
    // Best-effort server-side sign-out; the frontend clears its token regardless
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice("Bearer ".length).trim();
      // admin.signOut requires the user's id, so we look it up first
      const { data } = await supabaseAdmin.auth.getUser(token);
      if (data.user) {
        await supabaseAdmin.auth.admin.signOut(token);
      }
    }

    res.status(204).send();
  } catch (error) {
    // Even if server-side revocation fails, return 204 so the client clears its state
    res.status(204).send();
  }
};
