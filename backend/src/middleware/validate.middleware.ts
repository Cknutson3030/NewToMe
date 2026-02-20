import { RequestHandler } from "express";
import { ZodTypeAny } from "zod";

type ValidationSchemas = {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
};

export const validate = (schemas: ValidationSchemas): RequestHandler => {
  return (req, _res, next) => {
    try {
      if (schemas.body) {
        req.body = schemas.body.parse(req.body);
      }

      if (schemas.query) {
        req.query = schemas.query.parse(req.query) as unknown as typeof req.query;
      }

      if (schemas.params) {
        req.params = schemas.params.parse(req.params) as unknown as typeof req.params;
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};
