import {createHash} from 'node:crypto';

const hash=value=>createHash('sha256').update(value).digest('hex');

export function selectMemorabilityCases(pairs,limit=200) {
  const byMovie=new Map();
  for(const pair of pairs) {
    const rows=byMovie.get(pair.work_title)??[];
    rows.push(pair);
    byMovie.set(pair.work_title,rows);
  }
  const onePerMovie=[...byMovie.entries()].map(([workTitle,rows])=>({
    workTitle,
    pair:[...rows].sort((left,right)=>hash(left.id).localeCompare(hash(right.id)))[0]
  })).sort((left,right)=>hash(left.workTitle).localeCompare(hash(right.workTitle)));
  if(onePerMovie.length<limit) throw new Error(`Need ${limit} distinct movies; found ${onePerMovie.length}.`);
  return onePerMovie.slice(0,limit).map(({pair},index)=>orientMemorabilityCase(pair,index));
}

export function orientMemorabilityCase(pair,index) {
  const memorableOnLeft=index%2===0;
  return {
    case_id:pair.id,
    left:memorableOnLeft?pair.memorable.annotation_quote:pair.non_memorable.quote,
    right:memorableOnLeft?pair.non_memorable.quote:pair.memorable.annotation_quote,
    expected_choice:memorableOnLeft?'A':'B'
  };
}

export function summarizeMemorabilityRun(cases,results) {
  const byId=new Map(results.map(result=>[result.case_id,result]));
  const completed=cases.filter(row=>byId.has(row.case_id)).map(row=>({...row,...byId.get(row.case_id)}));
  const ratio=(count,total)=>total?Number((count/total).toFixed(4)):null;
  const latencies=completed.map(row=>row.duration_ms).filter(Number.isFinite).sort((left,right)=>left-right);
  const percentile=fraction=>latencies.length?latencies[Math.min(latencies.length-1,Math.floor((latencies.length-1)*fraction))]:null;
  const expectedA=completed.filter(row=>row.expected_choice==='A');
  const expectedB=completed.filter(row=>row.expected_choice==='B');
  return {
    cases:cases.length,
    completed:completed.length,
    correct:completed.filter(row=>row.choice===row.expected_choice).length,
    accuracy:ratio(completed.filter(row=>row.choice===row.expected_choice).length,completed.length),
    expected_position_balance:{A:expectedA.length,B:expectedB.length},
    prediction_distribution:{A:completed.filter(row=>row.choice==='A').length,B:completed.filter(row=>row.choice==='B').length},
    accuracy_by_expected_position:{
      A:ratio(expectedA.filter(row=>row.choice==='A').length,expectedA.length),
      B:ratio(expectedB.filter(row=>row.choice==='B').length,expectedB.length)
    },
    latency_ms:{p50:percentile(.5),p95:percentile(.95)}
  };
}
