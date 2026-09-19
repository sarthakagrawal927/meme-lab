import { existsSync, readFileSync } from 'node:fs';
export function loadEnv(path) {
  if (!existsSync(path)) return;
  for (const raw of readFileSync(path,'utf8').split(/\r?\n/)) {
    const line=raw.trim(); if (!line || line.startsWith('#')) continue;
    const match=line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (!match) throw new Error(`Invalid .env line: ${line.split('=')[0]}`);
    let value=match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value=value.slice(1,-1);
    if (process.env[match[1]] === undefined) process.env[match[1]]=value;
  }
}
export function configFromEnv(env=process.env) {
  const num=(key, fallback, low, high) => {
    const v=Number(env[key] ?? fallback);
    if (!Number.isFinite(v) || v<low || v>high) throw new Error(`Invalid ${key}.`);
    return v;
  };
  const baseUrl=env.MEME_API_BASE_URL || 'http://127.0.0.1:11434';
  const url=new URL(baseUrl);
  const remote=!['localhost','127.0.0.1','[::1]'].includes(url.hostname);
  if (!['http:','https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('Use an HTTP(S) model URL without credentials, query or fragment.');
  if (remote && env.MEME_ALLOW_REMOTE !== 'true') throw new Error('Remote inference is blocked. Set MEME_ALLOW_REMOTE=true deliberately to enable it.');
  if (remote && url.protocol !== 'https:') throw new Error('A remote model endpoint must use HTTPS.');
  const style=env.MEME_API_STYLE || 'ollama';
  if (!['ollama','chat_completions'].includes(style)) throw new Error('MEME_API_STYLE must be ollama or chat_completions.');
  return {port:num('PORT',4317,0,65535), style, baseUrl,
    model:env.MEME_MODEL || '', apiKey:env.MEME_API_KEY || '', remote,
    timeoutMs:num('MEME_TIMEOUT_MS',120000,100,300000),
    contextTokens:num('MEME_CONTEXT_TOKENS',16384,2048,131072),
    temperature:num('MEME_TEMPERATURE',0.2,0,2), jsonMode:env.MEME_JSON_MODE !== 'false'};
}
