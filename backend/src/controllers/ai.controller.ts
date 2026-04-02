import { RequestHandler } from "express";
import { AppError } from "../errors/app-error";

const ANALYSIS_PROMPT = `You are a product analyst for a secondhand marketplace focused on sustainability.
Analyze this product image and respond with ONLY valid JSON in the exact structure below (no markdown, no extra text):

{
  "product_name": "concise product name",
  "description": "2-3 sentence description of the item including key features",
  "category": "one of: Electronics, Clothing, Furniture, Books, Toys, Sports, Kitchen, Tools, Other",
  "item_condition": "one of: New, Like New, Good, Fair, Poor",
  "ghg": {
    "manufacturing_kg": <number: kg CO2e emitted to manufacture this product type>,
    "materials_kg": <number: kg CO2e from raw material extraction for this product type>,
    "transport_kg": <number: kg CO2e for average shipping/transport of this product type>,
    "end_of_life_kg": <number: kg CO2e saved by reselling instead of sending to landfill or incineration>
  }
}

Base GHG estimates on typical lifecycle data for this product category. Use realistic average values.
All ghg values must be positive numbers.`;

// ── Provider implementations (raw fetch, no extra SDKs needed) ──────────────

async function callOpenAI(base64: string, mimeType: string): Promise<string> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY not set");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o",
      response_format: { type: "json_object" },
      messages: [{
        role: "user",
        content: [
          { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}` } },
          { type: "text", text: ANALYSIS_PROMPT },
        ],
      }],
      max_tokens: 1024,
    }),
  });
  const json: any = await res.json();
  if (!res.ok) throw new Error(json.error?.message || `OpenAI error ${res.status}`);
  return json.choices?.[0]?.message?.content ?? "";
}

async function callGemini(base64: string, mimeType: string): Promise<string> {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY not set");

  const model = "gemini-2.0-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{
        parts: [
          { inline_data: { mime_type: mimeType, data: base64 } },
          { text: ANALYSIS_PROMPT },
        ],
      }],
      generationConfig: { response_mime_type: "application/json" },
    }),
  });
  const json: any = await res.json();
  if (!res.ok) throw new Error(json.error?.message || `Gemini error ${res.status}`);
  return json.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}

async function callXAI(base64: string, mimeType: string): Promise<string> {
  const key = process.env.XAI_API_KEY;
  if (!key) throw new Error("XAI_API_KEY not set");

  const res = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "grok-2-vision-1212",
      response_format: { type: "json_object" },
      messages: [{
        role: "user",
        content: [
          { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}` } },
          { type: "text", text: ANALYSIS_PROMPT },
        ],
      }],
      max_tokens: 1024,
    }),
  });
  const json: any = await res.json();
  if (!res.ok) throw new Error(json.error?.message || `xAI error ${res.status}`);
  return json.choices?.[0]?.message?.content ?? "";
}

async function callAnthropic(base64: string, mimeType: string): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY not set");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-opus-4-6",
      max_tokens: 1024,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mimeType, data: base64 } },
          { type: "text", text: ANALYSIS_PROMPT },
        ],
      }],
    }),
  });
  const json: any = await res.json();
  if (!res.ok) throw new Error(json.error?.message || `Anthropic error ${res.status}`);
  return json.content?.[0]?.text ?? "";
}

// Pick the first provider whose key is set
function getProvider(): { name: string; call: (b64: string, mime: string) => Promise<string> } | null {
  if (process.env.OPENAI_API_KEY) return { name: "openai", call: callOpenAI };
  if (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) return { name: "gemini", call: callGemini };
  if (process.env.XAI_API_KEY) return { name: "xai", call: callXAI };
  if (process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY) return { name: "anthropic", call: callAnthropic };
  return null;
}

// ── Route handler ─────────────────────────────────────────────────────────────

/**
 * POST /ai/analyze-image
 * Requires auth + one image upload (field: "image").
 * Auto-selects provider from available env keys: OPENAI_API_KEY → GEMINI_API_KEY → XAI_API_KEY → ANTHROPIC_API_KEY
 */
export const analyzeImage: RequestHandler = async (req, res, next) => {
  try {
    const provider = getProvider();
    if (!provider) {
      throw new AppError(
        503,
        "AI analysis is not configured. Add one of: OPENAI_API_KEY, GEMINI_API_KEY, XAI_API_KEY, or ANTHROPIC_API_KEY to the server environment."
      );
    }

    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) throw new AppError(400, "An image file is required (field: image)");
    if (!file.mimetype.startsWith("image/")) throw new AppError(400, "Uploaded file must be an image");

    const base64 = file.buffer.toString("base64");
    const rawText = await provider.call(base64, file.mimetype);

    let analysis: any;
    try {
      // Strip markdown code fences if present
      const cleaned = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
      analysis = JSON.parse(cleaned);
    } catch {
      throw new AppError(500, "AI returned an unexpected response format");
    }

    if (!analysis.product_name || !analysis.ghg) {
      throw new AppError(500, "AI response is missing required fields");
    }

    res.status(200).json({
      data: {
        product_name: analysis.product_name,
        description: analysis.description ?? "",
        category: analysis.category ?? "",
        item_condition: analysis.item_condition ?? "",
        ghg: {
          manufacturing_kg: Number(analysis.ghg.manufacturing_kg) || 0,
          materials_kg: Number(analysis.ghg.materials_kg) || 0,
          transport_kg: Number(analysis.ghg.transport_kg) || 0,
          end_of_life_kg: Number(analysis.ghg.end_of_life_kg) || 0,
        },
        _provider: provider.name,
      },
    });
  } catch (error) {
    next(error);
  }
};
