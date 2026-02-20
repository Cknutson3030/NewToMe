import multer from "multer";
import { AppError } from "../errors/app-error";

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export const listingImagesUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: 5,
    fileSize: MAX_FILE_SIZE_BYTES,
  },
  fileFilter: (_req, file, callback) => {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      callback(new AppError(400, "Only JPEG, PNG, and WEBP images are allowed"));
      return;
    }

    callback(null, true);
  },
});
