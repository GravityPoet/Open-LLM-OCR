const {test}=require('node:test');
const assert=require('node:assert/strict');
const {load,query}=require('./helpers.cjs');
const pairs=[
  ['https://openrouter.ai/api/v1','deepseek/deepseek-v4.1-flash-1017','reasoning'],
  ['https://api.fireworks.ai/inference/v1','accounts/fireworks/models/deepseek-v4p1-flash-1017','reasoning_effort'],
];
function request(base,model,prompt){
  const p=load({serviceMode:'providerCloud',cloudBaseUrl:base,cloudApiKey:'fixture-key',cloudModel:model,cloudPrompt:prompt});
  const q=query();p.ocr(q.value,q.done);return p.requests[0];
}
test('default OCR disables extra thinking only on the two verified DeepSeek routes',()=>{
  for(const [url,model,field] of pairs){
    const r=request(url,model);
    if(field==='reasoning')assert.equal(r.body.reasoning.enabled,false);
    else assert.equal(r.body.reasoning_effort,'none');
    assert.equal(r.body.messages[1].content[1].image_url.detail,'high');
    assert.equal(r.body.max_tokens,undefined);
    assert.equal(r.body.max_completion_tokens,undefined);
    assert.equal(r.body.temperature,undefined);
  }
});
test('custom OCR instructions retain provider reasoning defaults',()=>{
  for(const [url,model] of pairs){
    const r=request(url,model,'我的自定义识别要求');
    assert.equal(r.body.messages[0].content,'我的自定义识别要求');
    assert.equal(r.body.reasoning,undefined);
    assert.equal(r.body.reasoning_effort,undefined);
  }
});
test('unverified providers and models do not receive a guessed thinking parameter',()=>{
  for(const [url,model] of [
    ['https://api.chordvox.com/cliproxy/v1','gpt-6.1-terra'],
    ['https://api.chordvox.com/cliproxy/v1','gpt-6.1-sol'],
    ['https://api.chordvox.com/cliproxy/v1','gpt-6-luna'],
    ['https://other.example/v1','deepseek/deepseek-v4.1-flash-1017'],
    ['https://openrouter.ai/api/v1','some/other-model'],
  ]){
    const r=request(url,model);
    assert.equal(r.body.reasoning,undefined);
    assert.equal(r.body.reasoning_effort,undefined);
  }
});
