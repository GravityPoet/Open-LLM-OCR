import Foundation
import JavaScriptCore
let root = URL(fileURLWithPath: CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : ".").standardizedFileURL
var sources: [String:String] = [:]
for name in try FileManager.default.contentsOfDirectory(atPath: root.appendingPathComponent("lib").path) where name.hasSuffix(".js") {
    sources["lib/"+name] = try String(contentsOf: root.appendingPathComponent("lib/"+name), encoding: .utf8)
}
let context=JSContext()!
var failed=false
context.exceptionHandler={_,e in failed=true;print("JavaScriptCore 错误：\(e?.toString() ?? "unknown")")}
context.setObject(sources,forKeyedSubscript:"sources" as NSString)
context.evaluateScript(#"""
var $option={serviceMode:'providerCloud',cloudBaseUrl:'https://example.com/v1',cloudApiKey:'fixture-key',cloudModel:'fixture-model'};
var $info={identifier:'io.github.gravitypoet.jk.llm.ocr'},$env={appVersion:'1.21.2'};
var png={length:100,readUInt8:function(i){return [137,80,78,71][i]||0;},toBase64:function(){return 'iVBORw0KGgoAAAANSUhEUg==';}};
var $data={isData:function(d){return d===png;},fromBase64:function(){return png;}},$file={read:function(p){if(p!=='/ocr-sample.png')throw Error('virtual path');return png;}};
var timers={},count=0,$timer={schedule:function(o){timers[++count]=o;return count;},invalidate:function(i){delete timers[i];}};
var $signal={new:function(){return {send:function(){},subscribe:function(){return {dispose:function(){}};}};}},$http={};
var cache={};function load(name){if(cache[name])return cache[name].exports;var m={exports:{}};cache[name]=m;var parent=name.slice(0,name.lastIndexOf('/')+1);new Function('require','module','exports',sources[name])(function(n){return load(parent+n.replace(/^\.\//,''));},m,m.exports);return m.exports;}
var service=load('lib/service.js'),passed=0;
function check(v){if(!v)throw Error('assertion '+passed);passed++;}
['auto','responses','gemini','anthropic'].forEach(function(protocol){$option.cloudProtocol=protocol;$http.request=function(r){r.handler({response:{statusCode:200},data:{output_text:'OCR 123'}});};service.ocr({image:png,from:'en'},function(p){check(p.result.texts[0].text==='OCR 123');});});
service.validate(function(p){check(p.result===true);});
$option.serviceMode='azure';$http.request=function(r){if(r.method==='POST')r.handler({response:{statusCode:202,headers:{'Operation-Location':'https://example.com/v1/documentintelligence/documentModels/prebuilt-read/analyzeResults/fixture'}},data:{}});else r.handler({response:{statusCode:200},data:{status:'succeeded',analyzeResult:{pages:[{width:100,height:100,lines:[{content:'OCR 123',polygon:[0,0,50,0,50,20,0,20]}]}]}}});};
service.ocr({image:png,from:'en'},function(p){check(p.result.texts[0].boundingBox.points[1].x===.5);});
Object.keys(timers).forEach(function(k){if(timers[k]&&timers[k].interval===1)timers[k].handler();});
$option.serviceMode='mistral';$http.request=function(r){check(r.body.model==='mistral-ocr-latest');r.handler({response:{statusCode:200},data:{pages:[{index:0,markdown:'OCR 123'}]}});};service.ocr({image:png},function(p){check(p.result.texts[0].text==='OCR 123');});
$option.serviceMode='local';$http.request=function(r){r.handler({response:{statusCode:200},data:{ocrResults:[{rec_texts:['local OCR 123']}]}});};service.ocr({image:png},function(p){check(p.result.texts[0].text==='local OCR 123');});
$option={serviceMode:'roboflow',roboflowApiKey:'fixture-key',roboflowWorkflowId:'custom-ocr'};
$http.request=function(r){r.handler({response:{statusCode:403},data:{error_type:'ClientCausedStepExecutionError',blocks_errors:[{block_id:'model'}],message:'Forbidden fixture-key'}});};
service.ocr({image:png},function(p){check(p.error.type==='api'&&p.error.addition.statusCode===403&&p.error.message.includes('付费工作区')&&!p.error.message.includes('fixture-key'));});
if(passed!==10)throw Error('Expected 10 assertions; got '+passed);
"""#)
if failed {exit(1)}
print("JavaScriptCore 通过：4 种大模型接口、实际验证回调、Azure 轮询/坐标、Mistral、本地解析与 Roboflow 步骤错误，共 10 项。")
