import { Router } from "express";
import { analyzeImage } from "../controllers/ai.controller";
import { requireAuth } from "../middleware/auth.middleware";
import multer from "multer";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Only image files are allowed"));
  },
});

export const aiRouter = Router();

// POST /ai/analyze-image — requires auth, accepts one image upload
aiRouter.post("/analyze-image", requireAuth, upload.single("image"), analyzeImage);
