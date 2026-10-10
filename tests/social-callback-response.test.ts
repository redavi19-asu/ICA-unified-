import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { socialCallbackRedirect } from '../src/lib/social-callback-response';

test('Apple POST callback opens destination as GET without forwarding the code', async () => {
  const requests: {method: string; body: string; path: string}[] = [];
  const server = createServer(async (req,res) => {
    let body = '';
    for await (const part of req) body += part;
    requests.push({method:req.method || '',body,path:req.url || ''});
    if (req.url === '/callback') {
      const address = server.address() as {port:number};
      const response = socialCallbackRedirect(`http://127.0.0.1:${address.port}/register`);
      res.writeHead(response.status, Object.fromEntries(response.headers));
    } else res.writeHead(200);
    res.end();
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    const address = server.address() as {port:number};
    const response = await fetch(`http://127.0.0.1:${address.port}/callback`,{method:'POST',body:new URLSearchParams({code:'private-code',state:'state'})});
    assert.equal(response.status,200);
    assert.equal(requests[0].method,'POST');
    assert.deepEqual(requests[1],{method:'GET',body:'',path:'/register'});
    for(const path of ['/workspace','/platform','/login?social_error=expired']) {
      const redirect=socialCallbackRedirect('https://unified.icomputeranything.com'+path);
      assert.equal(redirect.status,303);
      assert.equal(redirect.headers.get('location'),'https://unified.icomputeranything.com'+path);
    }
  } finally { await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve())); }
});
