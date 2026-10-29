const {test}=require('node:test');
const assert=require('node:assert/strict');
const {load,query,ok}=require('./helpers.cjs');
const unrelated={cloudPrompt:'x'.repeat(9001),cloudImageDetail:'invalid-vision-detail',cloudProtocol:'invalid-vision-protocol'};

for(const mode of ['azure','mistral']){
  test(mode+' native OCR ignores irrelevant vision prompt, detail and protocol settings',()=>{
    const options={serviceMode:mode,cloudApiKey:'fixture-key',cloudBaseUrl:mode==='azure'?'https://example.cognitiveservices.azure.com':'https://api.mistral.ai/v1',...unrelated};
    const p=load(options,{request(r){
      if(mode==='azure'){
        if(r.method==='POST'){
          assert.deepEqual(Object.keys(r.body),['base64Source']);
          r.handler(ok({},202,{'Operation-Location':'https://example.cognitiveservices.azure.com/documentintelligence/documentModels/prebuilt-read/analyzeResults/fixture'}));
        }else r.handler(ok({status:'succeeded',analyzeResult:{pages:[{width:100,height:100,lines:[{content:'OCR 123'}]}]}}));
      }else{
        assert.equal(r.body.prompt,undefined);
        assert.equal(r.body.messages,undefined);
        r.handler(ok({pages:[{index:0,markdown:'OCR 123'}]}));
      }
    }});
    const q=query();p.ocr(q.value,q.done);if(mode==='azure')p.advance(1000);
    assert.equal(q.completions[0].result.texts[0].text,'OCR 123');
    const c=p.module('config').read(options,'io.github.gravitypoet.jk.llm.ocr');
    assert.equal(c.prompt,undefined);
    assert.equal(c.detail,undefined);
    assert.equal(c.protocol,undefined);
  });
}
test('general vision models retain prompt and image-detail validation',()=>{
  for(const options of [{cloudPrompt:'x'.repeat(9001)},{cloudImageDetail:'invalid'}]){
    const p=load({serviceMode:'providerCloud',cloudBaseUrl:'https://example.invalid/v1',cloudApiKey:'fixture-key',cloudModel:'vision-model',...options});
    const q=query();p.ocr(q.value,q.done);
    assert.equal(p.requests.length,0);
    assert.equal(q.completions[0].error.type,'param');
  }
});
