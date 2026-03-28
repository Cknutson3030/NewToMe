const providers = require('./providers');

const body = {
  time: "2026-03-28T07:37:38.342Z",
  product: "Claude",
  model: "claude-haiku-4-5",
  raw_material_extraction: null,
  manufacturing: null,
  transportation_distribution: null,
  use_phase: null,
  end_of_life: null,
  total: 0,
  processing_time_ms: 2456,
  ai_response: {
    model: "claude-haiku-4-5",
    id: "msg_01Kk41MVMT2HBU8zLDsHdf2S",
    type: "message",
    role: "assistant",
    content: [
      {
        type: "text",
        text: '{"functional_unit": "One unit of Jenga classic wooden block stacking game, suitable for recreational use", "life_cycle_emissions": {"raw_material_extraction": {"kg_co2e": 0.18}, "manufacturing": {"kg_co2e": 0.22}, "transportation_distribution": {"kg_co2e": 0.08}, "use_phase": {"kg_co2e": 0.0}, "end_of_life": {"kg_co2e": 0.04}}}'
      }
    ],
    stop_reason: "end_turn",
    usage: {
      input_tokens: 4531,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
      cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 0 },
      output_tokens: 122,
      service_tier: "standard",
      inference_geo: "not_available",
      total_tokens: null
    },
    usageMetadata: { promptTokenCount: 4531, candidatesTokenCount: 122 }
  }
};

(async () => {
  try {
    const res = await providers.parseResponse('anthropic', body.ai_response ? body : body);
    console.log('parseResponse result:');
    console.log(JSON.stringify(res, null, 2));
  } catch (e) {
    console.error('error:', e && e.stack ? e.stack : e);
  }
})();
