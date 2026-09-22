import {catalogue} from './catalogue.stage3000.generated.mjs';
import {hasMultiplePerspectives,humourBelongs,needsSeriousHandling,rankCandidates,rankCandidatesByPerspective,requiresFactualAnswer} from './classification.mjs';
import {MAX_RECOMMENDATIONS,presentSelection,selectionFromRanking} from './recommendation.mjs';
import {retrieveCandidates} from './retrieval.mjs';

const allowedIds=new Set(catalogue.map(record=>record.id));
const catalogueById=new Map(catalogue.map(record=>[record.id,record]));
const CLASSIFIER_MODEL='classifier.dev/jev-fast';
const TYPESAFE_MODEL='typesafe/jev-latest';
const RETRIEVAL_FALLBACK_MODEL='vector-retrieval-fallback';
const SITE_ORIGIN='https://memes.significanthobbies.com';
const PUBLIC_ROUTES=['/','/collection','/how-it-works'];

function json(data,status=200,extraHeaders={}) {
  return Response.json(data,{status,headers:{
    'Cache-Control':'no-store',
    'X-Content-Type-Options':'nosniff',
    'Referrer-Policy':'no-referrer',
    'X-Robots-Tag':'noindex, nofollow',
    ...extraHeaders
  }});
}

function escapeHtml(value) {
  return String(value??'')
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'",'&#39;');
}

function secureHeaders(headers=new Headers()) {
  headers.set('X-Content-Type-Options','nosniff');
  headers.set('Referrer-Policy','no-referrer');
  headers.set('X-Frame-Options','DENY');
  headers.set('Permissions-Policy','camera=(), microphone=(), geolocation=()');
  headers.set('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' https://i.imgflip.com https://api.memegen.link https://media.giphy.com; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
  return headers;
}

function pageResponse(body,{status=200,indexable=true,cacheControl='public, max-age=3600'}={}) {
  const headers=secureHeaders(new Headers({'Cache-Control':cacheControl,'Content-Type':'text/html; charset=utf-8'}));
  if(!indexable) headers.set('X-Robots-Tag','noindex, nofollow');
  return new Response(body,{status,headers});
}

function textResponse(body,{contentType='text/plain; charset=utf-8',cacheControl='public, max-age=21600'}={}) {
  return new Response(body,{headers:secureHeaders(new Headers({'Cache-Control':cacheControl,'Content-Type':contentType}))});
}

function publicMemePath(record) {
  return `/memes/${encodeURIComponent(record.id)}`;
}

function structuredData(value) {
  return JSON.stringify(value).replaceAll('<','\\u003c');
}

function memePage(record) {
  const path=publicMemePath(record);
  const canonical=`${SITE_ORIGIN}${path}`;
  const name=escapeHtml(record.name);
  const description=escapeHtml(`${record.name} works when ${record.message.charAt(0).toLocaleLowerCase()}${record.message.slice(1)}`);
  const mediaUrl=escapeHtml(record.media_url||record.image_url||'');
  const previewUrl=escapeHtml(record.preview_url||record.media_url||record.image_url||'');
  const tags=record.tags.map(tag=>`<li>${escapeHtml(tag)}</li>`).join('');
  const sourceNote=record.media_status==='approved'?'Approved media source':'Source preview; redistribution rights are not established';
  const schema={
    '@context':'https://schema.org',
    '@type':'CreativeWork',
    name:`${record.name} meme`,
    description:`${record.message} ${record.relational_pattern}`,
    url:canonical,
    image:record.preview_url||record.media_url||record.image_url,
    keywords:record.tags.join(', '),
    isPartOf:{'@type':'WebSite',name:'Meme Lab',url:SITE_ORIGIN}
  };
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${name} Meme Meaning, Examples &amp; When to Use It | Meme Lab</title>
  <meta name="description" content="${description}">
  <meta name="robots" content="index, follow, max-image-preview:large">
  <link rel="canonical" href="${canonical}">
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="Meme Lab">
  <meta property="og:title" content="${name} Meme Meaning &amp; Examples">
  <meta property="og:description" content="${description}">
  <meta property="og:url" content="${canonical}">
  ${previewUrl?`<meta property="og:image" content="${previewUrl}">`:''}
  <meta name="twitter:card" content="summary_large_image">
  <script type="application/ld+json">${structuredData(schema)}</script>
  <link rel="stylesheet" href="/app.css">
</head>
<body class="page-meme">
  <header class="topbar">
    <a class="brand" href="/" aria-label="Meme Lab home"><span>meme</span>lab</a>
    <nav class="site-nav" aria-label="Main navigation">
      <a href="/">Try it</a>
      <a href="/collection">Collection</a>
      <a href="/how-it-works">How it works</a>
    </nav>
    <span class="beta">3,000 LIVE</span>
  </header>
  <main class="meme-detail-main">
    <a class="back-link" href="/collection">&larr; Back to the collection</a>
    <article class="meme-detail">
      <div class="meme-detail-media">
        ${mediaUrl?`<img src="${mediaUrl}" alt="${name} meme reference" referrerpolicy="no-referrer">`:'<span class="media-fallback">Preview unavailable</span>'}
        ${record.media_type==='gif'?'<span class="media-kind">GIF</span>':''}
      </div>
      <div class="meme-detail-copy">
        <p class="eyebrow">MEME REFERENCE</p>
        <h1>${name}</h1>
        <p class="meme-definition">${escapeHtml(record.message)}</p>
        <dl class="meme-guide">
          <div><dt>What it expresses</dt><dd>${escapeHtml(record.relational_pattern)}</dd></div>
          <div><dt>Example</dt><dd>${escapeHtml(record.example_context)}</dd></div>
          <div><dt>When not to use it</dt><dd>${escapeHtml(record.near_miss_context)}</dd></div>
        </dl>
        <ul class="tag-list meme-detail-tags" aria-label="Related moods">${tags}</ul>
        <div class="meme-detail-actions">
          <a class="primary" href="/">Find a meme for your situation <span aria-hidden="true">&rarr;</span></a>
          ${record.image_url?`<a class="source-link" href="${escapeHtml(record.image_url)}" target="_blank" rel="noopener noreferrer">${sourceNote}</a>`:''}
        </div>
      </div>
    </article>
  </main>
  <footer>
    <a href="/collection">Browse all 3,000 meme references</a>
    <span>Match the situation, then pick the perspective.</span>
  </footer>
</body>
</html>`;
}

function notFoundPage() {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex, nofollow"><title>Meme not found | Meme Lab</title><link rel="stylesheet" href="/app.css"></head><body><main class="not-found"><p class="eyebrow">404</p><h1>That meme is not in the collection.</h1><p class="intro">Browse the live catalogue or try another situation.</p><a class="primary" href="/collection">Browse the collection <span aria-hidden="true">&rarr;</span></a></main></body></html>`;
}

function sitemap() {
  const urls=[...PUBLIC_ROUTES,...catalogue.map(publicMemePath)];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(path=>`  <url><loc>${SITE_ORIGIN}${path}</loc></url>`).join('\n')}\n</urlset>\n`;
}

function safeError(error) {
  return error instanceof Error?error.message:String(error);
}

function isClassifierThrottled(error) {
  return /\bHTTP 429\b/.test(safeError(error));
}

function retrievalFallback(shortlist,limit=MAX_RECOMMENDATIONS) {
  return shortlist.slice(0,limit).map((record,index)=>({
    ...record,
    classifier_score:Math.max(.25,.49-index*.04),
    fit_label:'weak',
    retrieval_rank:index+1
  }));
}

function validateComment(value) {
  if(typeof value!=='string') throw new Error('Paste a comment first.');
  const comment=value.trim();
  if(!comment) throw new Error('Paste a comment first.');
  if(comment.length>1000) throw new Error('Keep the comment within 1,000 characters.');
  return comment;
}

async function persistRecommendation(env,recommendation,comment,model=CLASSIFIER_MODEL) {
  const createdAt=new Date();
  const expiresAt=new Date(createdAt.getTime()+30*24*60*60*1000);
  await env.DB.prepare(`INSERT INTO recommendations
    (id, comment_text, decision, candidates_json, model, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .bind(recommendation.request_id,comment,recommendation.decision,JSON.stringify(recommendation.candidates.map(({id,rank,score,fit_label,perspective})=>({id,rank,score,fit_label,perspective}))),model,createdAt.toISOString(),expiresAt.toISOString())
    .run();
}

async function saveFeedback(request,env) {
  if(request.headers.get('content-type')?.split(';')[0]!=='application/json') return json({error:'Expected JSON.'},415);
  const contentLength=Number(request.headers.get('content-length')??0);
  if(contentLength>2000) return json({error:'Request too large.'},413);
  let body;
  try { body=await request.json(); }
  catch { return json({error:'Invalid JSON.'},400); }
  if(typeof body?.request_id!=='string'||!/^[a-f0-9-]{36}$/.test(body.request_id)) return json({error:'Unknown recommendation.'},400);
  if(!['landed','missed'].includes(body.verdict)) return json({error:'Unknown verdict.'},400);
  if(body.candidate_id!==null&&!allowedIds.has(body.candidate_id)) return json({error:'Unknown candidate.'},400);
  const recommendation=await env.DB.prepare('SELECT id FROM recommendations WHERE id = ? AND expires_at > ?').bind(body.request_id,new Date().toISOString()).first();
  if(!recommendation) return json({error:'This recommendation is no longer available.'},404);
  await env.DB.prepare(`INSERT INTO feedback (id, recommendation_id, verdict, candidate_id, created_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(recommendation_id) DO UPDATE SET verdict = excluded.verdict, candidate_id = excluded.candidate_id, created_at = excluded.created_at`)
    .bind(crypto.randomUUID(),body.request_id,body.verdict,body.candidate_id,new Date().toISOString())
    .run();
  console.log(JSON.stringify({event:'feedback',verdict:body.verdict}));
  return json({saved:true,verdict:body.verdict});
}

async function recommend(request,env) {
  if(request.headers.get('content-type')?.split(';')[0]!=='application/json') return json({error:'Expected JSON.'},415);
  const contentLength=Number(request.headers.get('content-length')??0);
  if(contentLength>5000) return json({error:'Request too large.'},413);
  let body;
  try { body=await request.json(); }
  catch { return json({error:'Invalid JSON.'},400); }
  let comment;
  try { comment=validateComment(body?.comment); }
  catch(error) { return json({error:safeError(error)},400); }
  const started=Date.now();
  try {
    const shortlist=await retrieveCandidates(env,comment,30);
    const classifierFetch=typeof env.CLASSIFIER_FETCH==='function'?env.CLASSIFIER_FETCH:fetch;
    const typesafeApiKey=typeof env.TYPESAFE_API_KEY==='string'&&env.TYPESAFE_API_KEY?env.TYPESAFE_API_KEY:undefined;
    const classifierOptions={fetchImpl:classifierFetch,apiKey:typesafeApiKey};
    let classifier_gate='not_needed';
    const factualRequest=requiresFactualAnswer(comment);
    const seriousRequest=needsSeriousHandling(comment);
    if(factualRequest||seriousRequest) {
      try {
        if(factualRequest||!await humourBelongs(comment,classifierOptions)) {
          classifier_gate='serious';
          const selection={decision:'none',confidence:'low',none_reason:'This calls for a serious response, not a meme.',candidates:[]};
          const recommendation=presentSelection(selection);
          let feedback_enabled=true;
          try { await persistRecommendation(env,recommendation,comment,'safety-gate'); }
          catch(error) {
            feedback_enabled=false;
            console.error(JSON.stringify({event:'recommendation_store',status:'error',error:safeError(error)}));
          }
          console.log(JSON.stringify({event:'recommendation',status:'ok',duration_ms:Date.now()-started,decision:'none',confidence:'low',candidate_count:0,classifier_gate}));
          return json({...recommendation,feedback_enabled});
        }
        classifier_gate='humour';
      } catch(error) {
        if(isClassifierThrottled(error)) {
          classifier_gate='throttled_abstain';
          const selection={decision:'none',confidence:'low',none_reason:'This may call for a serious response, and the safety check is temporarily unavailable.',candidates:[]};
          const recommendation=presentSelection(selection);
          let feedback_enabled=true;
          try { await persistRecommendation(env,recommendation,comment,'safety-gate-throttled'); }
          catch(storeError) {
            feedback_enabled=false;
            console.error(JSON.stringify({event:'recommendation_store',status:'error',error:safeError(storeError)}));
          }
          console.error(JSON.stringify({event:'classifier_gate',status:'throttled_abstain',error:safeError(error)}));
          return json({...recommendation,feedback_enabled});
        }
        classifier_gate='fallback';
        console.error(JSON.stringify({event:'classifier_gate',status:'fallback',error:safeError(error)}));
      }
    }
    let ranked;
    let ranking_mode='general';
    let ranking_model=typesafeApiKey?TYPESAFE_MODEL:CLASSIFIER_MODEL;
    const perspectiveEligible=hasMultiplePerspectives(comment);
    try {
      ranked=perspectiveEligible
        ? await rankCandidatesByPerspective(comment,shortlist,{...classifierOptions,limit:Math.min(MAX_RECOMMENDATIONS,shortlist.length)})
        : await rankCandidates(comment,shortlist,{...classifierOptions,limit:Math.min(MAX_RECOMMENDATIONS,shortlist.length)});
      if(perspectiveEligible) ranking_mode='perspective';
    }
    catch(error) {
      console.error(JSON.stringify({event:'classifier_rank',status:'fallback',mode:perspectiveEligible?'perspective':'general',error:safeError(error)}));
      if(isClassifierThrottled(error)) {
        ranked=retrievalFallback(shortlist);
        ranking_mode='retrieval_fallback';
        ranking_model=RETRIEVAL_FALLBACK_MODEL;
      } else if(perspectiveEligible) {
        try {
          ranked=await rankCandidates(comment,shortlist,{...classifierOptions,limit:Math.min(MAX_RECOMMENDATIONS,shortlist.length)});
          ranking_mode='general_fallback';
        }
        catch(fallbackError) {
          console.error(JSON.stringify({event:'classifier_rank',status:'fallback',mode:'general',error:safeError(fallbackError)}));
          if(isClassifierThrottled(fallbackError)) {
            ranked=retrievalFallback(shortlist);
            ranking_mode='retrieval_fallback';
            ranking_model=RETRIEVAL_FALLBACK_MODEL;
          } else return json({error:'Meme ranking is temporarily unavailable. Try again shortly.'},503,{'Retry-After':'60'});
        }
      } else {
        return json({error:'Meme ranking is temporarily unavailable. Try again shortly.'},503,{'Retry-After':'60'});
      }
    }
    const selection=selectionFromRanking(ranked);
    console.log(JSON.stringify({event:'recommendation',status:'ok',duration_ms:Date.now()-started,decision:selection.decision,confidence:selection.confidence,candidate_count:selection.candidates.length,classifier_gate,classifier_ranked:true,ranking_mode}));
    const perspectives=new Map((ranked??[]).filter(record=>record.perspective).map(record=>[record.id,{perspective:record.perspective,perspective_label:record.perspective_label}]));
    const recommendation=presentSelection(selection,{perspectives});
    let feedback_enabled=true;
    try { await persistRecommendation(env,recommendation,comment,ranking_model); }
    catch(error) {
      feedback_enabled=false;
      console.error(JSON.stringify({event:'recommendation_store',status:'error',error:safeError(error)}));
    }
    return json({...recommendation,feedback_enabled});
  } catch(error) {
    console.error(JSON.stringify({event:'recommendation',status:'error',duration_ms:Date.now()-started,error:safeError(error)}));
    return json({error:'The meme picker had a wobble. Try again.'},502);
  }
}

function secureAsset(response) {
  const headers=secureHeaders(new Headers(response.headers));
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}

export default {
  async fetch(request,env) {
    const url=new URL(request.url);
    if(request.method==='GET'&&url.pathname==='/robots.txt') return textResponse(`User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${SITE_ORIGIN}/sitemap.xml\n`);
    if(request.method==='GET'&&url.pathname==='/sitemap.xml') return textResponse(sitemap(),{contentType:'application/xml; charset=utf-8'});
    if(request.method==='GET'&&url.pathname.startsWith('/memes/')) {
      let id;
      try { id=decodeURIComponent(url.pathname.slice('/memes/'.length).replace(/\/$/,'')); }
      catch { return pageResponse(notFoundPage(),{status:404,indexable:false,cacheControl:'no-store'}); }
      const record=catalogueById.get(id);
      if(!record) return pageResponse(notFoundPage(),{status:404,indexable:false,cacheControl:'no-store'});
      const canonicalPath=publicMemePath(record);
      if(url.pathname!==canonicalPath) return Response.redirect(`${SITE_ORIGIN}${canonicalPath}`,301);
      return pageResponse(memePage(record));
    }
    if(url.pathname==='/api/health'&&request.method==='GET') return json({status:'ok',catalogue:catalogue.length});
    if(url.pathname==='/api/recommend'&&request.method==='POST') {
      const origin=request.headers.get('origin');
      if(origin&&origin!==url.origin) return json({error:'Cross-origin requests are blocked.'},403);
      return recommend(request,env);
    }
    if(url.pathname==='/api/feedback'&&request.method==='POST') {
      const origin=request.headers.get('origin');
      if(origin&&origin!==url.origin) return json({error:'Cross-origin requests are blocked.'},403);
      return saveFeedback(request,env);
    }
    if(url.pathname.startsWith('/api/')) return json({error:'Not found.'},404);
    return secureAsset(await env.ASSETS.fetch(request));
  },
  async scheduled(controller,env,ctx) {
    ctx.waitUntil(env.DB.prepare('DELETE FROM recommendations WHERE expires_at <= ?').bind(new Date(controller.scheduledTime).toISOString()).run());
  }
};
