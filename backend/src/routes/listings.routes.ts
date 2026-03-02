import { Router } from "express";
import {
  createListing,
  deleteListing,
  getListingById,
  getListings,
  getMyListings,
  updateListing,
  uploadListingImages,
} from "../controllers/listings.controller";
import { requireAuth } from "../middleware/auth.middleware";
import { validate } from "../middleware/validate.middleware";
import { listingImagesUpload } from "../middleware/upload.middleware";
import {
  createListingBodySchema,
  listingIdParamsSchema,
  listListingsQuerySchema,
  updateListingBodySchema,
} from "../schemas/listings.schema";

export const listingsRouter = Router();

// Public routes (no auth required)
listingsRouter.get("/", validate({ query: listListingsQuerySchema }), getListings);

// Protected: current user's own listings
listingsRouter.get("/mine", requireAuth, getMyListings);

listingsRouter.get("/:id", validate({ params: listingIdParamsSchema }), getListingById);

// Protected routes (auth required)
listingsRouter.post("/", requireAuth, validate({ body: createListingBodySchema }), createListing);
listingsRouter.patch(
  "/:id",
  requireAuth,
  validate({ params: listingIdParamsSchema, body: updateListingBodySchema }),
  updateListing
);
listingsRouter.delete("/:id", requireAuth, validate({ params: listingIdParamsSchema }), deleteListing);
listingsRouter.post(
  "/:id/images",
  requireAuth,
  validate({ params: listingIdParamsSchema }),
  listingImagesUpload.array("images", 5),
  uploadListingImages
);
