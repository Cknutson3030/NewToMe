import { Router } from "express";
import {
  createListing,
  deleteListing,
  getListingById,
  getListings,
  updateListing,
  uploadListingImages,
} from "../controllers/listings.controller";
import { validate } from "../middleware/validate.middleware";
import { listingImagesUpload } from "../middleware/upload.middleware";
import {
  createListingBodySchema,
  listingIdParamsSchema,
  listListingsQuerySchema,
  updateListingBodySchema,
} from "../schemas/listings.schema";

export const listingsRouter = Router();

listingsRouter.get("/", validate({ query: listListingsQuerySchema }), getListings);
listingsRouter.get("/:id", validate({ params: listingIdParamsSchema }), getListingById);
listingsRouter.post("/", validate({ body: createListingBodySchema }), createListing);
listingsRouter.patch(
  "/:id",
  //requireAuth,
  validate({ params: listingIdParamsSchema, body: updateListingBodySchema }),
  updateListing
);
//remove requireAuth temp for testing, will add back after auth is done
listingsRouter.delete("/:id", validate({ params: listingIdParamsSchema }), deleteListing);
listingsRouter.post(
  "/:id/images",
  //requireAuth,
  validate({ params: listingIdParamsSchema }),
  listingImagesUpload.array("images", 5),
  uploadListingImages
);
