from pathlib import Path
from tempfile import TemporaryDirectory
from urllib.parse import urlparse
import subprocess, json, time, re, os, shutil
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]
report={'tool':'Playwright Chromium','live_model_used':False,'render_method':'Actual HTML/CSS/JS embedded in a browser context; Python transports API requests to the actual local server because direct loopback browser navigation is blocked by this environment. Separate Node tests exercise direct HTTP routes.','checks':{},'errors':[]}
class ModelFixture(BaseHTTPRequestHandler):
 def log_message(self,*_args):pass
 def do_POST(self):
  size=int(self.headers.get('Content-Length','0'));payload=json.loads(self.rfile.read(size))
  enriched='relational_pattern' in payload['messages'][1]['content']
  selection={'decision':'meme','situation':'A promised short wait has become absurdly long.','intent':'Dryly underline the delay.','target':'The delay','candidates':[{'id':'waiting-skeleton','reason':'The reference exaggerates a wait that outlived the promise.'}],'none_reason':''} if enriched else {'decision':'none','situation':'A wait is taking longer than promised.','intent':'Avoid forcing a weak name-only match.','target':'The delay','candidates':[],'none_reason':'Names alone do not provide a strong enough match.'}
  body=json.dumps({'model':'browser-fixture','message':{'content':json.dumps(selection)},'prompt_eval_count':100,'eval_count':20}).encode()
  self.send_response(200);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
model_server=ThreadingHTTPServer(('127.0.0.1',0),ModelFixture)
model_thread=Thread(target=model_server.serve_forever,daemon=True);model_thread.start()
with TemporaryDirectory(prefix='meme-lab-browser-') as store:
 code=f"import {{createApp}} from '{root}/server.mjs'; import {{configFromEnv}} from '{root}/src/config.mjs'; const app=createApp(configFromEnv({{MEME_MODEL:'browser-fixture',MEME_API_BASE_URL:'http://127.0.0.1:{model_server.server_port}'}}),{{storeDir:{json.dumps(store)}}}); app.listen(0,'127.0.0.1',()=>console.log(app.address().port));"
 proc=subprocess.Popen(['node','--input-type=module','-e',code],stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
 try:
  port=proc.stdout.readline().strip(); assert port.isdigit(), proc.stderr.read()
  base=f'http://127.0.0.1:{port}'
  with sync_playwright() as p:
   browser_path=os.environ.get('CHROMIUM_PATH') or shutil.which('chromium')
   browser=p.chromium.launch(**({'executable_path':browser_path} if browser_path else {}))
   page=browser.new_page(viewport={'width':1440,'height':1100},device_scale_factor=1)
   external=[]; page.on('pageerror',lambda e:report['errors'].append(str(e)))
   page.on('request',lambda req: external.append(req.url) if not req.url.startswith(base) else None)
   def bootstrap(page):
    def bridge(_source,path,options=None):
     assert path.startswith('/api/')
     options=options or {}
     req=Request(base+path,data=(options.get('body') or '').encode() if options.get('method')=='POST' else None,headers=options.get('headers',{}),method=options.get('method','GET'))
     try:
      with urlopen(req) as r:return {'status':r.status,'text':r.read().decode()}
     except HTTPError as e:return {'status':e.code,'text':e.read().decode()}
    page.expose_binding('testApi',bridge)
    html=(root/'public/index.html').read_text()
    html=re.sub(r'<link rel="stylesheet"[^>]*>','',html)
    html=re.sub(r'<script type="module"[^>]*></script>','',html)
    page.set_content(html)
    page.add_style_tag(content=(root/'public/styles.css').read_text())
    page.add_style_tag(content=(root/'public/experiment.css').read_text())
    page.evaluate('''() => { window.fetch = async (path, options) => { const out = await window.testApi(path,options); return new Response(out.text, {status:out.status,headers:{'Content-Type':'application/json'}}); }; }''')
    page.add_script_tag(type='module',content=(root/'public/app.js').read_text())
    page.wait_for_function('document.querySelectorAll(".catalogue-card").length === 30')
   bootstrap(page)
   assert page.locator('#select-model').is_enabled()
   assert page.locator('#run-paired').is_enabled()
   assert page.locator('#catalogue-grid .catalogue-card').count()==30
   assert len(external)==0
   report['checks']['initial_remote_requests']=len(external)
   report['checks']['model_fixture_enabled']='local HTTP fixture only; no live model-quality claim'
   page.screenshot(path=str(root/'docs/local_lab_preview.png'),full_page=True)
   page.locator('#context').fill('They promised a five-minute wait. The office has changed owners twice and I am still in the same chair.')
   page.locator('#run-paired').click()
   page.get_by_text('Judge the reference before the explanation',exact=True).wait_for()
   assert page.locator('.blind-arm').count()==2
   assert 'Condition hidden' in page.locator('#results').inner_text()
   assert 'Meaning + relationships' not in page.locator('#results').inner_text()
   evidence=root/'artifacts/design';evidence.mkdir(parents=True,exist_ok=True)
   page.screenshot(path=str(evidence/'after-1440.png'),full_page=True)
   page.set_viewport_size({'width':768,'height':1000});page.screenshot(path=str(evidence/'after-768.png'),full_page=True)
   page.set_viewport_size({'width':390,'height':844});page.screenshot(path=str(evidence/'after-390.png'),full_page=True)
   page.set_viewport_size({'width':1440,'height':1100})
   for index in range(2):
    arm=page.locator('.blind-arm').nth(index)
    if arm.get_by_text('Waiting Skeleton',exact=True).count():arm.get_by_role('button',name="I'd send this").click()
    else:arm.get_by_role('button',name='No meme belongs here').click()
   assert page.locator('#reveal-experiment').is_enabled()
   page.locator('#reveal-experiment').click()
   page.get_by_text('Conditions revealed.',exact=False).wait_for()
   revealed=page.locator('#results').inner_text()
   assert 'Names only' in revealed and 'Meaning + relationships' in revealed
   page.screenshot(path=str(root/'docs/local_lab_paired_reveal.png'),full_page=True)
   report['checks']['paired_blind_review_reveal']='passed with local deterministic model fixture'
   page.locator('[data-tab=catalogue]').click()
   page.locator('#filter-kind').select_option('all')
   assert page.locator('#catalogue-grid .catalogue-card').count()==60
   page.locator('#filter-kind').select_option('inspected')
   assert page.locator('#catalogue-grid .catalogue-card').count()==5
   page.locator('#filter-kind').select_option('all')
   page.locator('#search').fill('this is fine')
   assert page.locator('#catalogue-grid .catalogue-card').count()==1
   report['checks']['catalogue_filters_search']='passed: 30 default, 60 all, 5 inspected, exact search'
   page.route('https://i.imgflip.com/**',lambda route:route.abort())
   page.locator('#catalogue-grid .load-media').click()
   page.get_by_text('Could not load this image here.',exact=False).wait_for()
   report['checks']['explicit_image_failure_placeholder']='passed (intentionally aborted request, not an upstream availability check)'
   page.locator('[data-tab=research]').click()
   assert page.locator('.source-card').count()==12
   report['checks']['source_cards']=12
   page.locator('[data-tab=play]').click()
   page.locator('#examples').select_option('smoke-06')
   assert 'three weeks' in page.locator('#context').input_value()
   page.locator('#select-baseline').click()
   page.locator('.result-card').first.wait_for()
   assert page.locator('.result-card').count()<=3
   assert 'NOT AI TASTE' in page.locator('#results').inner_text()
   page.locator('#feedback-note').fill('Synthetic browser test, not a real preference label.')
   page.locator('.ratings button').first.click()
   page.get_by_text('Saved locally.',exact=False).wait_for()
   report['checks']['baseline_top3_and_feedback']='passed'
   page.screenshot(path=str(root/'docs/local_lab_baseline_preview.png'),full_page=True)
   page.locator('[data-tab=history]').click()
   page.locator('.history-card').first.wait_for()
   assert 'Latest verdict: send' in page.locator('#history-grid').inner_text()
   report['checks']['history']='passed'
   page.locator('[data-tab=play]').click()
   page.locator('#context').fill('<script>window.UNSAFE_EXECUTED=true</script> waiting')
   page.locator('#select-baseline').click()
   page.locator('.result-card').first.wait_for()
   assert page.evaluate('window.UNSAFE_EXECUTED === undefined')
   page.locator('[data-tab=history]').click();page.locator('.history-card').first.wait_for()
   assert '<script>' in page.locator('.history-card').first.inner_text()
   assert page.evaluate('window.UNSAFE_EXECUTED === undefined')
   report['checks']['user_context_rendered_as_text']='passed'
   mobile=browser.new_page(viewport={'width':390,'height':844},device_scale_factor=1)
   mobile.on('pageerror',lambda e:report['errors'].append(str(e)))
   bootstrap(mobile)
   overflow=mobile.evaluate('document.documentElement.scrollWidth > innerWidth')
   assert not overflow
   mobile.locator('[data-tab=catalogue]').click()
   assert not mobile.evaluate('document.documentElement.scrollWidth > innerWidth')
   report['checks']['mobile_horizontal_overflow']=False
   mobile.screenshot(path=str(root/'docs/local_lab_mobile.png'),full_page=True)
   # Test the successful image-load plumbing with an artificial one-pixel PNG.
   # No screenshot of this fixture is used as a real media preview.
   page.locator('[data-tab=catalogue]').click()
   page.locator('#search').fill('facepalm')
   import base64
   png=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6aG0AAAAASUVORK5CYII=')
   page.route('https://api.memegen.link/**',lambda route:route.fulfill(status=200,content_type='image/png',body=png))
   page.locator('#catalogue-grid .load-media').first.click()
   page.get_by_text('External asset · permissions not established').first.wait_for()
   report['checks']['image_load_success_plumbing']='passed with artificial fixture; real upstream NOT checked'
   browser.close()
 finally:
  proc.terminate();proc.wait(timeout=5)
model_server.shutdown();model_server.server_close()
report['checks']['javascript_page_errors']=len(report['errors'])
assert not report['errors'],report
(root/'docs/browser_test_report.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
