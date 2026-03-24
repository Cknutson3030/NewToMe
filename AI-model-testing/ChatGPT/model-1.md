# ChatGPT Model 1 — OpenAI Images Vision (process image inputs) + Structured Output

Purpose: test one ChatGPT-family image model using the "process image inputs" method and the Structured Outputs JSON Schema format.

Replace `MODEL_NAME` with the exact model you want to test (for example `gpt-image-1` or another ChatGPT image model).

1) JSON Schema (Structured Output)

```json
{
	"name": "image_analysis",
	"schema": {
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
curl https://api.openai.com/v1/responses \
	-H "Authorization: Bearer $OPENAI_API_KEY" \
	-H "Content-Type: application/json" \
	-d '{
		"model": "MODEL_NAME",
		"input": [
			{"type":"image","image_url":"https://example.com/image.jpg"},
			{"role":"user","content":"Analyze the image and return only the JSON that matches the provided schema name=\"image_analysis\"."}
		],
		"response_format": {
			"type": "json_schema",
			"json_schema": {
				"name": "image_analysis",
				"schema": /* paste schema from above */ {}
			}
		}
	}'
```

3) Example (Node.js / pseudocode)

```js
const resp = await client.responses.create({
	model: "MODEL_NAME",
	input: [
		{ type: "image", image_url: "https://example.com/image.jpg" },
		{ role: "user", content: "Analyze the image and return structured JSON using schema 'image_analysis'." }
	],
	response_format: {
		type: "json_schema",
		json_schema: {
			name: "image_analysis",
			schema: /* paste schema from above */ {}
		}
	}
});

// The response should contain a validated JSON object following the schema.
```

Notes:
- Store example input image URLs and expected results in the test-run log for later comparison.
- Keep the schema strict if you need deterministic fields (add `required` where necessary).
