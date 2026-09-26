import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
const validId = value => typeof value==='string' && /^[a-f0-9-]{36}$/.test(value);

/** One immutable file per event; no shared append writes to corrupt on concurrency. */
export class Store {
  constructor(directory) { this.directory=directory; }
  async save(type, value) {
    if (!['run','feedback','experiment','experiment_review','candidate_review','dialogue_review'].includes(type)) throw new Error('Invalid event type.');
    await mkdir(this.directory,{recursive:true,mode:0o700});
    const event={...value, event_type:type, id:randomUUID(), timestamp:new Date().toISOString()};
    await writeFile(join(this.directory,`${type}-${event.id}.json`),JSON.stringify(event,null,2)+'\n',{flag:'wx',mode:0o600});
    return event;
  }
  async run(id) {
    if (!validId(id)) throw new Error('Invalid run ID.');
    try { return JSON.parse(await readFile(join(this.directory,`run-${id}.json`),'utf8')); }
    catch { throw new Error('Run not found.'); }
  }
  async experiment(id) {
    if (!validId(id)) throw new Error('Invalid experiment ID.');
    const event=(await this.all()).find(row=>row.event_type==='experiment'&&row.experiment_id===id);
    if (!event) throw new Error('Experiment not found.');
    return event;
  }
  async all() {
    await mkdir(this.directory,{recursive:true,mode:0o700});
    const names=(await readdir(this.directory)).filter(n=>/^(run|feedback|experiment|experiment_review|candidate_review|dialogue_review)-[a-f0-9-]{36}\.json$/.test(n));
    const rows=await Promise.all(names.map(async n=>JSON.parse(await readFile(join(this.directory,n),'utf8'))));
    return rows.sort((a,b)=>a.timestamp.localeCompare(b.timestamp)||a.id.localeCompare(b.id));
  }
}
