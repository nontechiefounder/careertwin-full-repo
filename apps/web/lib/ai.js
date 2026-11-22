/**
 * AI Service for workBYLiNE
 * Handles Groq, Gemini, Claude, and OpenAI providers.
 *
 * Provider selection:
 * - WORKBYLINE_AI_PROVIDER acts as a provider PREFERENCE by default (orders the
 *   preferred provider first while retaining fallback to other configured providers).
 * - Set WORKBYLINE_AI_STRICT_PROVIDER=true alongside WORKBYLINE_AI_PROVIDER to
 *   enforce an explicit single-provider restriction with no fallback.
 */

const GROQ_API_URL    = 'https://api.groq.com/openai/v1/chat/completions';
const GEMINI_API_URL  = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-pro-preview:generateContent';
const CLAUDE_API_URL  = 'https://api.anthropic.com/v1/messages';
const OPENAI_API_URL  = 'https://api.openai.com/v1/chat/completions';

export async function generateChat(systemPrompt, userPrompt, jsonMode = true, tools = null) {
  const explicitProvider = (process.env.WORKBYLINE_AI_PROVIDER || '').trim().toLowerCase();
  const strictProvider = (process.env.WORKBYLINE_AI_STRICT_PROVIDER || '').trim().toLowerCase() === 'true';

  let providers = [
    { name: 'Groq',   active: true, key: process.env.GROQ_API_KEY || process.env.GROK_API_KEY, call: callGroq },
    { name: 'Gemini', active: true, key: process.env.GEMINI_API_KEY, call: callGemini },
    { name: 'Claude', active: true, key: process.env.ANTHROPIC_API_KEY, call: callClaude },
    { name: 'OpenAI', active: true, key: process.env.OPENAI_API_KEY, call: callOpenAI }
  ];

  if (explicitProvider) {
    const match = providers.find(p => p.name.toLowerCase() === explicitProvider);
    if (strictProvider) {
      if (!match) {
        throw new Error(`AI: Unknown strict provider '${explicitProvider}'.`);
      }
      providers = [match];
    } else if (match) {
      // Preference ordering: try preferred provider first, then fall back cleanly
      providers = [match, ...providers.filter(p => p.name.toLowerCase() !== explicitProvider)];
    }
  }

  let lastError = null;

  for (const provider of providers) {
    if (!provider.active || !provider.key || provider.key.includes('_here') || provider.key === '') continue;

    try {
      console.log(`AI: Attempting generation with ${provider.name}...${tools ? ' [TOOL MODE]' : ''}`);
      const response = await provider.call(provider.key, systemPrompt, userPrompt, jsonMode, tools);
      return response;
    } catch (err) {
      console.error(`AI: ${provider.name} failed:`, err.message);
      lastError = err;
      continue;
    }
  }

  throw new Error(`AI: All providers failed. Last error: ${lastError?.message}`);
}

async function callGroq(key, system, user, jsonMode, tools) {
  const models = ['llama-3.1-70b-versatile', 'llama-3.3-70b-versatile', 'llama-3.1-8b-instant'];
  let err;

  for (const model of models) {
    try {
      const payload = {
        model: model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user }
        ],
        response_format: jsonMode && !tools ? { type: 'json_object' } : undefined
      };

      if (tools) {
        payload.tools = tools.map(t => ({ type: 'function', function: t }));
        payload.tool_choice = 'auto';
      }

      const res = await fetch(GROQ_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const data = await res.json();
        const msg = data.choices[0].message;
        
        // Handle direct tool calls
        if (msg.tool_calls) {
          return { tool_calls: msg.tool_calls };
        }
        
        return parseAIJSON(msg.content);
      }
      err = await res.json();
    } catch (e) { err = e; }
  }
  throw new Error(JSON.stringify(err));
}

async function callGemini(key, system, user, jsonMode, tools) {
  const url = `${GEMINI_API_URL}?key=${key}`;
  
  const payload = {
    contents: [{
      parts: [{ text: `${system}\n\nUser Task: ${user}${jsonMode ? "\n\nRespond with valid JSON only." : ""}` }]
    }],
    generationConfig: {
      responseMimeType: (jsonMode && !tools) ? "application/json" : "text/plain"
    }
  };

  if (tools) {
    payload.tools = [{ function_declarations: tools }];
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  const cand = data.candidates[0].content.parts[0];
  
  if (cand.functionCall) {
    return { 
        tool_calls: [{ 
            function: { 
                name: cand.functionCall.name, 
                arguments: JSON.stringify(cand.functionCall.args) 
            } 
        }] 
    };
  }

  return parseAIJSON(cand.text);
}

// Real Anthropic Messages API implementation supporting structured JSON and tool calling
async function callClaude(key, system, user, jsonMode, tools) {
  const payload = {
    model: 'claude-3-5-sonnet-20241022',
    max_tokens: 4096,
    system: system + (jsonMode && !tools ? '\n\nOutput only valid JSON.' : ''),
    messages: [
      { role: 'user', content: user }
    ]
  };

  if (tools) {
    payload.tools = tools.map(t => ({
      name: t.name,
      description: t.description || '',
      input_schema: t.parameters || { type: 'object', properties: {} }
    }));
  }

  const res = await fetch(CLAUDE_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();

  const toolUse = data.content?.find(c => c.type === 'tool_use');
  if (toolUse) {
    return {
      tool_calls: [{
        function: {
          name: toolUse.name,
          arguments: JSON.stringify(toolUse.input)
        }
      }]
    };
  }

  const textBlock = data.content?.find(c => c.type === 'text');
  return parseAIJSON(textBlock?.text);
}

export function getProviderInventory() {
  const explicitProvider = (process.env.WORKBYLINE_AI_PROVIDER || '').trim().toLowerCase();
  const strictMode = (process.env.WORKBYLINE_AI_STRICT_PROVIDER || '').trim().toLowerCase() === 'true';
  return [
    { name: 'Groq', configured: Boolean(process.env.GROQ_API_KEY || process.env.GROK_API_KEY), active: true, toolsSupported: true },
    { name: 'Gemini', configured: Boolean(process.env.GEMINI_API_KEY), active: true, toolsSupported: true },
    { name: 'Claude', configured: Boolean(process.env.ANTHROPIC_API_KEY), active: true, toolsSupported: true },
    { name: 'OpenAI', configured: Boolean(process.env.OPENAI_API_KEY), active: true, toolsSupported: true }
  ].map(p => ({
    ...p,
    selectionMode: strictMode ? 'strict' : 'preference',
    strictRestriction: strictMode,
    isPreferred: explicitProvider ? p.name.toLowerCase() === explicitProvider : p.name === 'Groq'
  }));
}

async function callOpenAI(key, system, user, jsonMode, tools) {
  const payload = {
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user }
    ],
    response_format: jsonMode && !tools ? { type: 'json_object' } : undefined
  };

  if (tools) {
    payload.tools = tools.map(t => ({ type: 'function', function: t }));
    payload.tool_choice = 'auto';
  }

  const res = await fetch(OPENAI_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
    body: JSON.stringify(payload)
  });

  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  const msg = data.choices[0].message;

  if (msg.tool_calls) {
    return { tool_calls: msg.tool_calls };
  }

  return parseAIJSON(msg.content);
}

function parseAIJSON(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/```json\n([\s\S]*?)\n```/) || text.match(/```\n([\s\S]*?)\n```/);
    if (match) return JSON.parse(match[1]);
    const first = text.indexOf('{');
    const last  = text.lastIndexOf('}');
    if (first !== -1 && last !== -1) {
      return JSON.parse(text.substring(first, last + 1));
    }
    throw new Error("Could not parse JSON from AI response");
  }
}
