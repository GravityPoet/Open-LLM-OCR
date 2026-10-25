import base64
import importlib.util
import io
import json
from pathlib import Path
import sys
import unittest
from unittest.mock import patch, Mock

ROOT=Path(__file__).resolve().parents[1]
def load(name,file):
    spec=importlib.util.spec_from_file_location(name,ROOT/file)
    module=importlib.util.module_from_spec(spec);sys.modules[name]=module;spec.loader.exec_module(module);return module
server=load('ocr_server','server/scripts/ppocrv5_http_server.py')
relay=load('ocr_relay','server/scripts/async_jsonl_relay.py')
class ServerTests(unittest.TestCase):
    def test_nonfinite_and_boolean_thresholds_rejected(self):
        for value in [float('nan'),float('inf'),True,-.1,1.1,'0.5']:
            with self.subTest(value=value),self.assertRaises(ValueError):server.parse_optional_float_range(value,'threshold',0,1)
    def test_request_validation(self):
        for data in [None,{}, {'file':'!!!'},{'file':'AA==','fileType':0},{'file':'AA==','useDocUnwarping':'true'}]:
            with self.assertRaises(ValueError):server.parse_ocr_request(data)
        self.assertEqual(server.parse_ocr_request({'file':'AA==','textRecScoreThresh':0}).image_bytes,b'\x00')
    def test_port_defaults_align(self):
        with patch.object(sys,'argv',['server','--det-model-dir','a','--rec-model-dir','b']):self.assertEqual(server.parse_args().port,50000)
        self.assertIn('${PORT:-50000}',(ROOT/'server/scripts/start_ppocrv5_server.sh').read_text())
    def test_local_adapter_serializes_numpy_style_arrays(self):
        value=Mock();value.tolist.return_value=[[1,2],[3,4]]
        self.assertEqual(server.to_json_compatible({'x':value}),{'x':[[1,2],[3,4]]})
class RelayTests(unittest.TestCase):
    def test_rejects_non_provider_and_insecure_targets(self):
        for value in ['http://example.bcebos.com/x','https://example.com','https://bcebos.com.attacker.com','https://user' + '@' + 'example.bcebos.com','https://example.bcebos.com:444','https://example.bcebos.com/#fragment']:
            with self.assertRaises(ValueError):relay.validate_target(value)
    def test_rejects_private_dns(self):
        with patch.object(relay.socket,'getaddrinfo',return_value=[(None,None,None,None,('127.0.0.1',443))]):
            with self.assertRaises(ValueError):relay.validate_target('https://example.bcebos.com/x')
    def test_preserves_signed_url_exactly(self):
        value='https://example.bcebos.com/x?authorization=bce-auth-v1%2Fexample'
        with patch.object(relay.socket,'getaddrinfo',return_value=[(None,None,None,None,('8.8.8.8',443))]):self.assertEqual(relay.validate_target(value),value)
    def test_redirect_revalidates_destination(self):
        with self.assertRaises(ValueError):relay.SafeRedirect().redirect_request(None,None,302,'',{},'https://attacker.com')
    def test_read_bound(self):
        response=Mock();response.__enter__=Mock(return_value=response);response.__exit__=Mock(return_value=False);response.read.return_value=b'x'*(relay.MAX_BYTES+1)
        opener=Mock();opener.open.return_value=response
        with patch.object(relay,'validate_target'),patch.object(relay,'build_opener',return_value=opener):
            with self.assertRaises(ValueError):relay.fetch_result('https://example.bcebos.com',5)
        response.read.assert_called_once_with(relay.MAX_BYTES+1)
    def test_log_never_contains_signed_query(self):
        handler=object.__new__(relay.RelayHandler);handler.path='/fetch-jsonl?url=private-signed-url'
        with patch('http.server.BaseHTTPRequestHandler.log_message') as log:
            handler.log_message('%s',handler.path)
            self.assertNotIn('private-signed-url',str(log.call_args))
if __name__=='__main__':unittest.main()
