# Claude Model 1 — Anthropic Claude Vision (process image inputs) + Structured Output

Purpose: test one Claude-family image model using the "process image inputs" method and the Structured Output JSON Schema format.

Replace `MODEL_NAME` with the exact model you want to test (for example `claude-opus-4-6` or another Claude vision model).

1) JSON Schema (Structured Output)

```json
{
	"name": "image_analysis",
	"input_schema": {
		"type": "object",
		"properties": {
			"description": {"type": "string", "description": "Short caption/summary."},
			"objects": {
				"type": "array",
				"items": {
					"type": "object",
					"properties": {
						"label": {"type": "string"},
						"confidence": {"type": "number"},
						"bbox": {
							"type": "object",
							"properties": {
								"x": {"type": "number"},
								"y": {"type": "number"},
								"width": {"type": "number"},
								"height": {"type": "number"}
							}
						}
					},
					"required": ["label", "confidence"]
				}
			},
			"dominant_colors": {"type": "array", "items": {"type": "string"}},
			"detected_text": {"type": "string"},
			"adult_content": {"type": "boolean"}
		}
	}
}
```

2) Example request (cURL) — process image inputs + ask for the structured JSON schema above

```bash
curl https://api.anthropic.com/v1/messages \
	-H "x-api-key: $ANTHROPIC_API_KEY" \
	-H "anthropic-version: 2023-06-01" \
	-H "Content-Type: application/json" \
	-d '{
		"model": "MODEL_NAME",
		"max_tokens": 1024,
		"tools": [
			{
				"name": "image_analysis",
				"description": "Analyze the image and return structured data.",
				"input_schema": {
					"type": "object",
					"properties": {
						"description": {"type": "string"},
						"objects": {
							"type": "array",
							"items": {
								"type": "object",
								"properties": {
									"label": {"type": "string"},
									"confidence": {"type": "number"}
								},
								"required": ["label", "confidence"]
							}
						},
						"dominant_colors": {"type": "array", "items": {"type": "string"}},
						"detected_text": {"type": "string"},
						"adult_content": {"type": "boolean"}
					}
				}
			}
		],
		"tool_choice": {"type": "tool", "name": "image_analysis"},
		"messages": [
			{
				"role": "user",
				"content": [
					{
						"type": "image",
						"source": {
							"type": "url",
							"url": "https://example.com/image.jpg"
						}
					},
					{
						"type": "text",
						"text": "Analyze the image and return only the JSON that matches the image_analysis schema."
					}
				]
			}
		]
	}'
```

3) Example (Node.js / pseudocode)

```js
const Anthropic = require("@anthropic-ai/sdk");
const client = new Anthropic();

const resp = await client.messages.create({
	model: "MODEL_NAME",
	max_tokens: 1024,
	tools: [
		{
			name: "image_analysis",
			description: "Analyze the image and return structured data.",
			input_schema: {
				type: "object",
				properties: {
					description: { type: "string" },
					objects: {
						type: "array",
						items: {
							type: "object",
							properties: {
								label: { type: "string" },
								confidence: { type: "number" }
							},
							required: ["label", "confidence"]
						}
					},
					dominant_colors: { type: "array", items: { type: "string" } },
					detected_text: { type: "string" },
					adult_content: { type: "boolean" }
				}
			}
		}
	],
	tool_choice: { type: "tool", name: "image_analysis" },
	messages: [
		{
			role: "user",
			content: [
				{
					type: "image",
					source: { type: "url", url: "https://example.com/image.jpg" }
				},
				{
					type: "text",
					text: "Analyze the image and return structured JSON using the image_analysis tool."
				}
			]
		}
	]
});

const result = resp.content.find(b => b.type === "tool_use");
// result.input contains the validated JSON object following the schema.
```

Notes:
- Store example input image URLs and expected results in the test-run log for later comparison.
- Claude uses tool use (function calling) to enforce structured output — `tool_choice` forces the model to call the named tool.
- Keep the schema strict if you need deterministic fields (add `required` where necessary).
