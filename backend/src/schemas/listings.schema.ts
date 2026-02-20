import { z } from "zod";

const listingStatusSchema = z.enum(["active", "inactive", "sold"]);

const listingWriteFieldsSchema = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().min(1).max(5000).optional(),
  price: z.coerce.number().min(0).optional(),
  category: z.string().trim().min(1).max(120).optional(),
  item_condition: z.string().trim().min(1).max(120).optional(),
  location_city: z.string().trim().min(1).max(120).optional(),
  status: listingStatusSchema.optional(),
});

export const listingIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export const createListingBodySchema = listingWriteFieldsSchema;

export const updateListingBodySchema = listingWriteFieldsSchema
  .partial()
  .refine((body) => Object.keys(body).length > 0, {
    message: "At least one field must be provided for update",
  });

export const listListingsQuerySchema = z
  .object({
    category: z.string().trim().min(1).max(120).optional(),
    item_condition: z.string().trim().min(1).max(120).optional(),
    location_city: z.string().trim().min(1).max(120).optional(),
    min_price: z.coerce.number().min(0).optional(),
    max_price: z.coerce.number().min(0).optional(),
    q: z.string().trim().min(1).max(120).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    offset: z.coerce.number().int().min(0).default(0),
    sort_by: z.enum(["created_at", "price", "title"]).default("created_at"),
    sort_order: z.enum(["asc", "desc"]).default("desc"),
  })
  .refine(
    (query) => {
      if (query.min_price === undefined || query.max_price === undefined) {
        return true;
      }

      return query.min_price <= query.max_price;
    },
    {
      message: "min_price must be less than or equal to max_price",
      path: ["min_price"],
    }
  );
