import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

export const cataloguePath = new URL('../original/meme_references_v1/memes.json', import.meta.url);
export const catalogue = JSON.parse(readFileSync(cataloguePath, 'utf8'));
export const datasetHash = createHash('sha256').update(readFileSync(cataloguePath)).digest('hex');
export const sources = JSON.parse(readFileSync(new URL('../original/meme_references_v1/sources.json', import.meta.url), 'utf8'));
export const systemPrompt = readFileSync(new URL('../prompts/selector.md', import.meta.url), 'utf8');
export const baseSchema = JSON.parse(readFileSync(new URL('../schemas/selector-response.schema.json', import.meta.url), 'utf8'));
export const promptHash = createHash('sha256').update(systemPrompt).digest('hex');

export function poolFor(scope = 'reactions') {
  if (!['reactions', 'all'].includes(scope)) throw new Error('Unknown catalogue scope.');
  return scope === 'all' ? [...catalogue] : catalogue.filter(r => r.delivery.suggested_mode !== 'caption_template');
}

export function validateRequest(body) {
  if (!body || Array.isArray(body) || typeof body !== 'object') throw new Error('Expected a JSON object.');
  if (typeof body.context !== 'string' || !body.context.trim()) throw new Error('Enter a situation or conversation first.');
  if (body.context.length > 6000) throw new Error('Keep the conversation within 6,000 characters.');
  const scope = body.scope ?? 'reactions';
  const method = body.method ?? 'baseline';
  const representation = body.representation ?? 'enriched';
  const style = body.style ?? 'playful';
  poolFor(scope);
  if (!['baseline', 'model'].includes(method)) throw new Error('Unknown selection method.');
  if (!['minimal', 'enriched'].includes(representation)) throw new Error('Unknown representation.');
  if (!['playful', 'gentle', 'dry'].includes(style)) throw new Error('Unknown reply style.');
  const recentIds = body.recent_ids ?? [];
  if (!Array.isArray(recentIds) || recentIds.length > 10 || recentIds.some(id => !catalogue.some(r => r.id === id))) throw new Error('Invalid recent reference IDs.');
  return {context: body.context.trim(), scope, method, representation, style, recent_ids: [...new Set(recentIds)]};
}

export function candidateMetadata(record, representation) {
  const basic = {id: record.id, name: record.name, delivery: record.delivery.suggested_mode};
  if (representation === 'minimal') return basic;
  return {...basic, message: record.interpretation.message, relational_pattern: record.interpretation.relational_pattern,
    example: record.interpretation.example_context, avoid: record.interpretation.near_miss_context};
}

export function buildPrompt(request) {
  const rows = poolFor(request.scope).map(r => candidateMetadata(r, request.representation));
  const schema = structuredClone(baseSchema);
  schema.properties.candidates.items.properties.id.enum = rows.map(r => r.id);
  const data = {conversation: request.context, reply_style: request.style,
    recent_reference_ids: request.recent_ids, scope: request.scope, catalogue: rows};
  const user = `Select existing references for this input. Catalogue order is not a ranking.\n${JSON.stringify(data, null, 2)}`;
  return {messages: [{role: 'system', content: systemPrompt}, {role: 'user', content: user}], schema};
}

const stop = new Set('a an and are as at be been but by can could did do does doing for from had has have he her here him his how i if in into is it its just me my no not of on one or our out she so some than that the their them then there these they this to too us was we were what when which who why will with would you your'.split(' '));
const tokens = text => (text.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter(t => t.length > 1 && !stop.has(t));

/** Diagnostic lexical baseline only: no social reasoning or calibrated abstention. */
export function lexicalSelect(request) {
  const pool = poolFor(request.scope);
  const docs = pool.map(r => tokens(request.representation === 'minimal' ? r.name : `${r.name} ${r.retrieval_text} ${r.interpretation.tags.join(' ')}`));
  const query = [...new Set(tokens(request.context))];
  const avg = docs.reduce((n, d) => n + d.length, 0) / docs.length;
  const df = new Map();
  for (const doc of docs) for (const t of new Set(doc)) df.set(t, (df.get(t) ?? 0) + 1);
  const ranked = pool.map((r, index) => {
    const doc = docs[index]; let score = 0; const matched = [];
    for (const t of query) {
      const freq = doc.filter(w => w === t).length;
      if (!freq) continue;
      matched.push(t);
      const idf = Math.log(1 + (docs.length - df.get(t) + 0.5) / (df.get(t) + 0.5));
      score += idf * (freq * 2.2) / (freq + 1.2 * (0.25 + 0.75 * doc.length / avg));
    }
    return {id: r.id, score, matched};
  }).filter(r => r.score > 0).sort((a,b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0,3);
  return {
    decision: ranked.length ? 'meme' : 'none',
    situation: 'Keyword overlap only; this baseline does not interpret the social situation.',
    intent: 'Diagnostic retrieval, not a judgment of what is appropriate to send.', target: 'Not inferred',
    candidates: ranked.map(r => ({id:r.id, reason:`Shared terms: ${r.matched.join(', ')}. Lexical score ${r.score.toFixed(2)}; not confidence.`})),
    none_reason: ranked.length ? '' : 'No nontrivial keyword overlap. This is not a judgment that humour would be inappropriate.'
  };
}

export function validateSelection(raw, allowedIds) {
  const obj = typeof raw === 'string' ? JSON.parse(raw.trim().replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/, '')) : raw;
  const keys = ['decision','situation','intent','target','candidates','none_reason'];
  if (!obj || Array.isArray(obj) || typeof obj !== 'object' || keys.some(k => !(k in obj)) || Object.keys(obj).some(k => !keys.includes(k))) throw new Error('Model response has an invalid object shape.');
  if (!['meme','none'].includes(obj.decision)) throw new Error('Invalid decision.');
  for (const [key, max] of Object.entries({situation:600,intent:400,target:300,none_reason:500})) {
    if (typeof obj[key] !== 'string' || obj[key].length > max) throw new Error(`Invalid ${key}.`);
  }
  if (!Array.isArray(obj.candidates) || obj.candidates.length > 3) throw new Error('Return at most three candidates.');
  const used = new Set();
  for (const c of obj.candidates) {
    if (!c || typeof c !== 'object' || Object.keys(c).length !== 2 || !allowedIds.has(c.id) || typeof c.reason !== 'string' || !c.reason.trim() || c.reason.length > 500 || used.has(c.id)) throw new Error('Unknown, duplicate, or malformed candidate.');
    used.add(c.id);
  }
  if (obj.decision === 'none' && (obj.candidates.length || !obj.none_reason.trim())) throw new Error('NONE needs no candidates and an explanation.');
  if (obj.decision === 'meme' && (!obj.candidates.length || obj.none_reason)) throw new Error('A meme decision requires candidates and no NONE explanation.');
  return obj;
}

export async function modelSelect(request, config, {seed}={}) {
  if (!config.model) throw new Error('Set MEME_MODEL in .env to enable model selection.');
  const {messages, schema} = buildPrompt(request);
  const isOllama = config.style === 'ollama';
  const endpoint = `${config.baseUrl.replace(/\/$/, '')}${isOllama ? '/api/chat' : '/chat/completions'}`;
  const headers = {'Content-Type':'application/json'};
  if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;
  const call=async(activeMessages,attemptSeed)=>{
    const payload = isOllama
      ? {model: config.model, messages:activeMessages, stream: false, format: schema,
         options: {temperature: config.temperature, num_ctx: config.contextTokens, num_predict: 1200, ...(attemptSeed===undefined?{}:{seed:attemptSeed})}}
      : {model: config.model, messages:activeMessages, stream: false, ...(config.jsonMode ? {response_format:{type:'json_object'}} : {}), ...(attemptSeed===undefined?{}:{seed:attemptSeed})};
    let response;
    try { response = await fetch(endpoint, {method:'POST', headers, body:JSON.stringify(payload), redirect:'error', signal:AbortSignal.timeout(config.timeoutMs)}); }
    catch (error) { throw new Error(error.name === 'TimeoutError' ? 'Model request timed out. No baseline was substituted.' : 'Could not reach the configured model endpoint. Check the server, URL and model name.'); }
    if (!response.ok) throw new Error(`Model endpoint returned HTTP ${response.status}. Check its server log; no baseline was substituted.`);
    const data=await response.json();
    const content=isOllama?data.message?.content:data.choices?.[0]?.message?.content;
    if(typeof content!=='string'||content.length>100_000) throw new Error('Model response has no valid text content.');
    return {data,content,payload};
  };
  const allowedIds=new Set(poolFor(request.scope).map(record=>record.id));
  const first=await call(messages,seed);
  let selection,final=first,repairAttempted=false;
  try { selection=validateSelection(first.content,allowedIds); }
  catch(error) {
    repairAttempted=true;
    const repairMessages=[...messages,{role:'assistant',content:first.content},{role:'user',content:`Your JSON was rejected: ${error.message} Correct the object without adding fields. If decision is none, candidates must be [] and none_reason must be nonempty. If decision is meme, return 1-3 allowed candidates and an empty none_reason. Return JSON only.`}];
    final=await call(repairMessages,seed===undefined?undefined:(seed+1)%(2**31));
    selection=validateSelection(final.content,allowedIds);
  }
  const usage=isOllama?{input_tokens:final.data.prompt_eval_count??null,output_tokens:final.data.eval_count??null}:(final.data.usage??null);
  return {selection,usage,modelReported:typeof final.data.model==='string'?final.data.model:config.model,repair_attempted:repairAttempted};
}
