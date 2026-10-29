const {test}=require('node:test');
const assert=require('node:assert/strict');
const fixture=require('./fixtures/pp-ocr-code-layout.json');
const {load,query,ok}=require('./helpers.cjs');

function recognize(data){
  const p=load({serviceMode:'roboflow',roboflowModel:'pp-ocr-medium',roboflowApiKey:'fixture-key'},
    {request(r){r.handler(ok(data));}});
  const q=query();p.ocr(q.value,q.done);
  assert.equal(p.requests.length,1);
  return q.completions[0];
}
test('PP-OCR restores observed code indentation from real response boxes without changing characters',()=>{
  const before=JSON.stringify(fixture);
  const r=recognize(fixture);
  const text=r.result.texts.map(line=>line.text).join('\n');
  assert.match(text,/\n {4}# keep indentation\n {4}return a - b/);
  assert.equal(text.replace(/\s/g,''),fixture.result.replace(/\s/g,''));
  assert.match(text,/\n名称 数量 金额\nAlpha-1 2 42\.50/);
  assert.equal(JSON.stringify(fixture),before);
});
test('missing, invalid, or incomplete geometry preserves the original PP-OCR text',()=>{
  for(const data of [
    {result:fixture.result},
    {...fixture,image:{width:0,height:0}},
    {...fixture,predictions:[{class:'return 0',x:NaN,y:1,width:1,height:1}]},
    {...fixture,predictions:[{class:'unmatched text',x:200,y:20,width:80,height:20}]},
  ]){
    const r=recognize(data);
    assert.equal(r.result.texts.map(line=>line.text).join('\n'),fixture.result);
  }
});
test('PP-OCR keeps existing indentation and repeated lines instead of doubling or dropping them',()=>{
  const changed=JSON.parse(JSON.stringify(fixture));
  changed.result=changed.result.replace('\n# keep indentation','\n\t# keep indentation').replace('\nreturn a - b','\n  return a - b');
  const text=recognize(changed).result.texts.map(line=>line.text).join('\n');
  assert.match(text,/\n\t# keep indentation\n {2}return a - b/);
  const repeated={result:'function first()\nreturn 0\nreturn 0',image:{width:600,height:200},predictions:[
    {class:'function first()',x:100,y:20,width:160,height:20},
    {class:'return 0',x:100,y:60,width:80,height:20},
    {class:'return 0',x:100,y:100,width:80,height:20},
  ]};
  assert.equal(recognize(repeated).result.texts.filter(line=>line.text.trim()==='return 0').length,2);
});
test('PP-OCR follows pixel offsets for two-space indentation and scaled images',()=>{
  for(const scale of [0.5,1,2]){
    const data={result:'function first()\nreturn 0\nreturn 1',image:{width:600*scale,height:200*scale},predictions:[
      {class:'function first()',x:100*scale,y:20*scale,width:160*scale,height:20*scale},
      {class:'return 0',x:80*scale,y:60*scale,width:80*scale,height:20*scale},
      {class:'return 1',x:80*scale,y:100*scale,width:80*scale,height:20*scale},
    ]};
    assert.equal(recognize(data).result.texts.map(line=>line.text).join('\n'),'function first()\n  return 0\n  return 1');
  }
});
