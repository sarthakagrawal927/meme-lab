import { resolve } from 'node:path';
import { createApp, ROOT } from '../server.mjs';
import { loadEnv, configFromEnv } from '../src/config.mjs';

loadEnv(resolve(ROOT,'.env'));
const config=configFromEnv();
const port=Number(process.env.HOLDOUT_PORT??4318);
if(!Number.isSafeInteger(port)||port<1024||port>65535) throw new Error('HOLDOUT_PORT must be an integer from 1024 to 65535.');

const app=createApp(config,{storeDir:resolve(ROOT,'results/holdout-v1/runs')});
app.listen(port,'127.0.0.1',()=>{
  console.log(`Meme Lab holdout review → http://127.0.0.1:${port}`);
  console.log('Condition identity, rationales, and pre-labels remain hidden until both arms are reviewed.');
});
app.on('error',error=>{console.error(error.code==='EADDRINUSE'?'Holdout review port is in use. Set HOLDOUT_PORT to another local port.':error.message);process.exitCode=1;});
