import { randomUUID } from "crypto";
import path from "path";
import { Request, RequestHandler } from "express";
import { env } from "../config/env";
import { createRlsClient, supabaseAdmin, supabaseAnon } from "../config/supabase";
import { AppError } from "../errors/app-error";

// Custom interface to extend Express Request with user and accessToken
interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
  };
  accessToken?: string;
}

const MAX_IMAGES_PER_LISTING = 5;

const LISTING_SELECT = `
  id,
  owner_user_id,
  title,
  description,
  price,
  category,
  item_condition,
  location_city,
  status,
  is_deleted,
  created_at,
  updated_at,
  listing_images (
    id,
    listing_id,
    owner_user_id,
    storage_path,
    image_url,
    sort_order,
    created_at,
    updated_at
  )
`;

const IMAGE_SELECT = `
  id,
  listing_id,
  owner_user_id,
  storage_path,
  image_url,
  sort_order,
  created_at,
  updated_at
`;

const toFileExtension = (mimetype: string): string => {
  switch (mimetype) {
    case "image/png":
      return ".png";
    case "image/webp":
      return ".webp";
    default:
      return ".jpg";
  }
};

const sanitizeSearchTerm = (term: string): string => term.replace(/[,%()]/g, " ").trim();

// Helper function to get user and accessToken from authenticated request
// ORIGINAL VERSION - COMMENTED OUT FOR TESTING
// const getAuthContext = (req: AuthenticatedRequest): { userId: string; accessToken: string } => {
//   if (!req.user?.id || !req.accessToken) {
//     throw new AppError(401, "Authentication required");
//   }
//   return { userId: req.user.id, accessToken: req.accessToken };
// };

// TEMPORARY MOCK VERSION FOR TESTING - REMOVE AND RESTORE ORIGINAL WHEN AUTH IS READY
const getAuthContext = (_req: AuthenticatedRequest): { userId: string; accessToken: string } => {
  // Return mock values for testing (no auth required)
  return { userId: "test-user-id", accessToken: "test-token" };
};

const toNotFound = (message: string, error: { code?: string }): never => {
  if (error.code === "PGRST116") {
    throw new AppError(404, message);
  }

  throw error;
};

export const getListings: RequestHandler = async (req, res, next) => {
  try {
    const query = req.query as Record<string, string | number | undefined>;
    const limit = Number(query.limit ?? 20);
    const offset = Number(query.offset ?? 0);
    const sortBy = String(query.sort_by ?? "created_at");
    const sortOrder = String(query.sort_order ?? "desc");

    let supabaseQuery = supabaseAnon
      .from("listings")
      .select(LISTING_SELECT)
      .eq("status", "active")
      .eq("is_deleted", false);

    if (query.category) {
      supabaseQuery = supabaseQuery.eq("category", query.category);
    }

    if (query.item_condition) {
      supabaseQuery = supabaseQuery.eq("item_condition", query.item_condition);
    }

    if (query.location_city) {
      supabaseQuery = supabaseQuery.ilike("location_city", `%${String(query.location_city)}%`);
    }

    if (query.min_price !== undefined) {
      supabaseQuery = supabaseQuery.gte("price", Number(query.min_price));
    }

    if (query.max_price !== undefined) {
      supabaseQuery = supabaseQuery.lte("price", Number(query.max_price));
    }

    if (query.q) {
      const term = sanitizeSearchTerm(String(query.q));
      if (term.length > 0) {
        supabaseQuery = supabaseQuery.or(
          `title.ilike.%${term}%,description.ilike.%${term}%`
        );
      }
    }

    supabaseQuery = supabaseQuery
      .order(sortBy, { ascending: sortOrder === "asc" })
      .range(offset, offset + limit - 1);

    const { data, error } = await supabaseQuery;

    if (error) {
      throw error;
    }

    res.status(200).json({
      data: data ?? [],
      meta: {
        limit,
        offset,
        count: data?.length ?? 0,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getListingById: RequestHandler = async (req, res, next) => {
  try {
    const id = String(req.params.id);

    const { data, error } = await supabaseAnon
      .from("listings")
      .select(LISTING_SELECT)
      .eq("id", id)
      .eq("status", "active")
      .eq("is_deleted", false)
      .single();

    if (error) {
      toNotFound("Listing not found", error);
    }

    res.status(200).json({ data });
  } catch (error) {
    next(error);
  }
};

export const createListing: RequestHandler = async (req, res, next) => {
  try {
    // TEMPORARY: Use supabaseAdmin for testing (bypasses RLS)
    // RESTORE: const { userId, accessToken } = getAuthContext(req);
    // RESTORE: const rlsClient = createRlsClient(accessToken);
    const userId = "00000000-0000-0000-0000-000000000000"; // Temporary test user ID

    const payload = {
      owner_user_id: userId,
      title: req.body.title,
      description: req.body.description ?? null,
      price: req.body.price ?? null,
      category: req.body.category ?? null,
      item_condition: req.body.item_condition ?? null,
      location_city: req.body.location_city ?? null,
      status: req.body.status ?? "active",
    };

    // TEMPORARY: Use supabaseAdmin instead of rlsClient
    const { data, error } = await supabaseAdmin
      .from("listings")
      .insert(payload)
      .select(LISTING_SELECT)
      .single();

    if (error) {
      throw error;
    }

    res.status(201).json({ data });
  } catch (error) {
    next(error);
  }
};

export const updateListing: RequestHandler = async (req, res, next) => {
  try {
    const { accessToken } = getAuthContext(req);
    const rlsClient = createRlsClient(accessToken);
    const id = String(req.params.id);

    const allowedFields = [
      "title",
      "description",
      "price",
      "category",
      "item_condition",
      "location_city",
      "status",
    ] as const;

    const updates: Record<string, unknown> = {};

    for (const field of allowedFields) {
      if (Object.prototype.hasOwnProperty.call(req.body, field)) {
        updates[field] = req.body[field];
      }
    }

    const { data, error } = await rlsClient
      .from("listings")
      .update(updates)
      .eq("id", id)
      .eq("is_deleted", false)
      .select(LISTING_SELECT)
      .single();

    if (error) {
      toNotFound("Listing not found", error);
    }

    res.status(200).json({ data });
  } catch (error) {
    next(error);
  }
};

export const deleteListing: RequestHandler = async (req, res, next) => {
  try {
    const { accessToken } = getAuthContext(req);
    const rlsClient = createRlsClient(accessToken);
    const id = String(req.params.id);

    const { error } = await rlsClient
      .from("listings")
      .update({
        is_deleted: true,
        status: "deleted",
      })
      .eq("id", id)
      .eq("is_deleted", false)
      .select("id")
      .single();

    if (error) {
      toNotFound("Listing not found", error);
    }

    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

export const uploadListingImages: RequestHandler = async (req, res, next) => {
  try {
    const { userId, accessToken } = getAuthContext(req);
    const rlsClient = createRlsClient(accessToken);
    const listingId = String(req.params.id);
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];

    if (files.length === 0) {
      throw new AppError(400, "At least one image file is required");
    }

    const { data: listing, error: listingError } = await rlsClient
      .from("listings")
      .select("id, is_deleted")
      .eq("id", listingId)
      .single();

    if (listingError) {
      toNotFound("Listing not found", listingError);
    }

    if (listing?.is_deleted) {
      throw new AppError(400, "Cannot upload images to a deleted listing");
    }

    const { count, error: countError } = await rlsClient
      .from("listing_images")
      .select("id", { count: "exact", head: true })
      .eq("listing_id", listingId);

    if (countError) {
      throw countError;
    }

    const existingCount = count ?? 0;
    if (existingCount + files.length > MAX_IMAGES_PER_LISTING) {
      throw new AppError(
        400,
        `A listing can have at most ${MAX_IMAGES_PER_LISTING} images`
      );
    }

    const uploadedPaths: string[] = [];
    const rows: Array<{
      listing_id: string;
      owner_user_id: string;
      storage_path: string;
      image_url: string;
      sort_order: number;
    }> = [];

    try {
      for (const [index, file] of files.entries()) {
        const extension = path.extname(file.originalname) || toFileExtension(file.mimetype);
        const storagePath = `${userId}/${listingId}/${Date.now()}-${randomUUID()}${extension}`;

        const { error: uploadError } = await supabaseAdmin.storage
          .from(env.SUPABASE_STORAGE_BUCKET)
          .upload(storagePath, file.buffer, {
            contentType: file.mimetype,
            upsert: false,
          });

        if (uploadError) {
          throw new AppError(500, "Failed to upload one or more images", uploadError);
        }

        uploadedPaths.push(storagePath);

        const { data: publicUrlData } = supabaseAdmin.storage
          .from(env.SUPABASE_STORAGE_BUCKET)
          .getPublicUrl(storagePath);

        rows.push({
          listing_id: listingId,
          owner_user_id: userId,
          storage_path: storagePath,
          image_url: publicUrlData.publicUrl,
          sort_order: existingCount + index,
        });
      }

      const { data, error } = await rlsClient
        .from("listing_images")
        .insert(rows)
        .select(IMAGE_SELECT)
        .order("sort_order", { ascending: true });

      if (error) {
        throw error;
      }

      res.status(201).json({ data: data ?? [] });
    } catch (error) {
      if (uploadedPaths.length > 0) {
        await supabaseAdmin.storage.from(env.SUPABASE_STORAGE_BUCKET).remove(uploadedPaths);
      }

      throw error;
    }
  } catch (error) {
    next(error);
  }
};
