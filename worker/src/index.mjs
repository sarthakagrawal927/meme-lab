import {catalogue} from './catalogue.stage3000.generated.mjs';
import {hasMultiplePerspectives,humourBelongs,needsSeriousHandling,rankCandidates,rankCandidatesByPerspective,requiresFactualAnswer} from './classification.mjs';
import {MAX_RECOMMENDATIONS,presentSelection,selectionFromRanking} from './recommendation.mjs';
import {retrieveCandidates} from './retrieval.mjs';

const allowedIds=new Set(catalogue.map(record=>record.id));
const CLASSIFIER_MODEL='classifier.dev/jev-fast';
const RETRIEVAL_FALLBACK_MODEL='vector-retrieval-fallback';

function json(data,status=200,extraHeaders={}) {
  return Response.json(data,{status,headers:{
    'Cache-Control':'no-store',
    'X-Content-Type-Options':'nosniff',
    'Referrer-Policy':'no-referrer',
    ...extraHeaders
  }});
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

function classifierFetchFor(env) {
  const fetchImpl=typeof env.CLASSIFIER_FETCH==='function'?env.CLASSIFIER_FETCH:fetch;
  if(typeof env.CLASSIFIER_API_KEY!=='string'||!env.CLASSIFIER_API_KEY) return fetchImpl;
  return (url,options={})=>{
    const headers=new Headers(options.headers);
    headers.set('Authorization',`Bearer ${env.CLASSIFIER_API_KEY}`);
    return fetchImpl(url,{...options,headers});
  };
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
    const classifierFetch=classifierFetchFor(env);
    let classifier_gate='not_needed';
    const factualRequest=requiresFactualAnswer(comment);
    const seriousRequest=needsSeriousHandling(comment);
    if(factualRequest||seriousRequest) {
      try {
        if(factualRequest||!await humourBelongs(comment,{fetchImpl:classifierFetch})) {
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
    let ranking_model=CLASSIFIER_MODEL;
    const perspectiveEligible=hasMultiplePerspectives(comment);
    try {
      ranked=perspectiveEligible
        ? await rankCandidatesByPerspective(comment,shortlist,{fetchImpl:classifierFetch,limit:Math.min(MAX_RECOMMENDATIONS,shortlist.length)})
        : await rankCandidates(comment,shortlist,{fetchImpl:classifierFetch,limit:Math.min(MAX_RECOMMENDATIONS,shortlist.length)});
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
          ranked=await rankCandidates(comment,shortlist,{fetchImpl:classifierFetch,limit:Math.min(MAX_RECOMMENDATIONS,shortlist.length)});
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
  const headers=new Headers(response.headers);
  headers.set('X-Content-Type-Options','nosniff');
  headers.set('Referrer-Policy','no-referrer');
  headers.set('X-Frame-Options','DENY');
  headers.set('Permissions-Policy','camera=(), microphone=(), geolocation=()');
  headers.set('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' https://i.imgflip.com https://api.memegen.link https://media.giphy.com; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
  headers.set('X-Robots-Tag','noindex, nofollow');
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}

export default {
  async fetch(request,env) {
    const url=new URL(request.url);
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
