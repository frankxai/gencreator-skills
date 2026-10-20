import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('commission', Path(__file__).resolve().parents[1] / 'scripts/commission.py')
c = importlib.util.module_from_spec(spec); spec.loader.exec_module(c)


def fixture():
    return {'schema_version': 1, 'commission_id': 'GC-FIXTURE-01', 'revision': 1, 'owner': 'fixture creator', 'objective': 'Test one useful editorial output', 'beneficiary': 'research editor', 'why_now': 'Bounded portability test', 'original_treatment': 'Source-linked claim packet', 'implementation_path': 'Existing edition helper', 'next_action': 'Inspect source', 'kind': 'nonvisual', 'state': 'captured', 'sources': [{'url': 'https://example.org/reference?utm_source=fixture', 'revision': 'fixture-v1', 'captured_at': '2026-10-20T00:00:00Z', 'access': 'verified', 'rights': 'reference-only', 'mechanism': 'Explicit lineage', 'reuse': 'principle'}], 'guidance': [], 'artifacts': [], 'rights_state': 'reference-only', 'validation_state': 'unverified', 'release_state': 'private', 'release_evidence': [], 'selected_treatment': None, 'founder_selection': 'not-required', 'reviews': [], 'learning': [], 'events': [], 'checks': []}


class CommissionTests(unittest.TestCase):
    def test_valid_reference(self):
        self.assertEqual(c.validate(fixture())['state'], 'captured')
    def test_canonical_dedup(self):
        a=fixture(); b=fixture(); b['sources'][0]['url']='https://EXAMPLE.org/reference#fragment'
        self.assertEqual(c.duplicate_key(a), c.duplicate_key(b))
    def test_inaccessible_source_can_be_recorded(self):
        a=fixture(); a['sources'][0]['access']='inaccessible'; self.assertEqual(c.validate(a), a)
    def test_restricted_copy_blocked(self):
        a=fixture(); a['sources'][0].update(rights='restricted', reuse='copied')
        with self.assertRaises(ValueError): c.validate(a)
    def test_restricted_principle_allowed(self):
        a=fixture(); a['sources'][0]['rights']='restricted'; c.validate(a)
    def test_duplicate_source_rejected(self):
        a=fixture(); a['sources'].append(dict(a['sources'][0]))
        with self.assertRaises(ValueError): c.validate(a)
    def test_stale_revision(self):
        with self.assertRaisesRegex(ValueError, 'Stale'): c.transition(fixture(), 'researched', 0, 'test', 'fixture')
    def test_wrong_transition(self):
        with self.assertRaisesRegex(ValueError, 'Illegal'): c.transition(fixture(), 'accepted', 1, 'test', 'fixture')
    def test_transition(self):
        a=c.transition(fixture(), 'researched', 1, 'test', 'fixture')
        self.assertEqual(a['revision'],2); self.assertEqual(a['rights_state'],'reference-only'); self.assertEqual(a['release_state'],'private')
    def test_replay_cannot_be_live(self):
        a=fixture(); a['artifacts']=[{'id':'test','role':'build','locator':'fixture.html','sha256':'0'*64,'revision':1,'mode':'replay','rights':'cleared','claim':'live','evidence':['fixture']}]
        with self.assertRaisesRegex(ValueError, 'cannot claim'): c.validate(a)
    def test_published_restricted_artifact_blocked(self):
        a=fixture(); a['artifacts']=[{'id':'test','role':'build','locator':'fixture.html','sha256':'0'*64,'revision':1,'mode':'actual','rights':'restricted','claim':'published','evidence':['fixture']}]
        with self.assertRaisesRegex(ValueError,'cleared rights'): c.validate(a)
    def test_live_needs_evidence(self):
        a=fixture(); a['artifacts']=[{'id':'test','role':'build','locator':'fixture.html','sha256':'0'*64,'revision':1,'mode':'actual','rights':'cleared','claim':'live','evidence':[]}]
        with self.assertRaisesRegex(ValueError, 'needs evidence'): c.validate(a)
    def test_failed_generation_does_not_pass(self):
        a=fixture(); a['validation_state']='checked'; a['checks']=[{'name':'generation','result':'fail','kind':'tool','evidence':'fixture failure'}]
        with self.assertRaises(ValueError): c.validate(a)
    def test_pending_not_executed_pass(self):
        a=fixture(); a['validation_state']='checked'; a['checks']=[{'name':'capture','result':'pending','kind':'tool','evidence':'unsupported tool'}]
        with self.assertRaises(ValueError): c.validate(a)
    def test_public_export_excludes_private_context(self):
        a=fixture(); a['private_context']='private note'; r=c.export(a,'public')
        self.assertNotIn('private_context',r); self.assertNotIn('sources',r); self.assertIn('record_digest',r)
    def test_atomic_save_and_cas(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'record.json'; a=fixture(); c.atomic_save(p,a)
            with self.assertRaises(ValueError): c.atomic_save(p,a)
            b=c.transition(a,'researched',1,'test','fixture'); c.atomic_save(p,b,1)
            with self.assertRaises(ValueError): c.atomic_save(p,b,1)
            self.assertEqual(c.load(p)['revision'],2)
    def test_failed_write_preserves_old_bytes(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'record.json'; a=fixture(); c.atomic_save(p,a); before=p.read_bytes()
            b=c.transition(a,'researched',1,'test','fixture')
            with patch.object(c.os,'replace',side_effect=OSError('fixture failure')):
                with self.assertRaises(OSError): c.atomic_save(p,b,1)
            self.assertEqual(p.read_bytes(),before); self.assertFalse(p.with_name(p.name+'.lock').exists())
    def test_json_duplicate_fields(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'bad.json'; p.write_text('{"revision":1,"revision":2}')
            with self.assertRaises(ValueError): c.load(p)
    def test_nonfinite_json(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'bad.json'; p.write_text('{"a":NaN}')
            with self.assertRaises(ValueError): c.load(p)
    def test_credentials_url_blocked(self):
        with self.assertRaises(ValueError): c.canonical_url('https://name:password@example.org/')
    def test_stale_guidance_acceptance(self):
        a=fixture(); a['state']='accepted'; a['revision']=2; a['accepted_from_revision']=1; a['artifacts']=[{'id':'test','role':'build','locator':'fixture.txt','sha256':'0'*64,'revision':1,'mode':'fixture','rights':'cleared','claim':'draft','evidence':[]}]; a['validation_state']='checked'; a['checks']=[{'name':'fixture','result':'pass','kind':'deterministic','evidence':'test'}]; a['reviews']=[{'independent':True,'verdict':'keep','revision':1,'evidence':'fixture'}]; a['guidance']=[{'locator':'fixture','revision':'1','captured_at':'2026-10-20','status':'stale'}]
        with self.assertRaisesRegex(ValueError,'Stale guidance'): c.validate(a)

    def test_acceptance_binds_reviewed_revision(self):
        a=fixture(); a['state']='reviewed'; a['validation_state']='checked'; a['checks']=[{'name':'fixture','result':'pass','kind':'deterministic','evidence':'test'}]; a['artifacts']=[{'id':'test','role':'build','locator':'fixture.txt','sha256':'0'*64,'revision':1,'mode':'fixture','rights':'cleared','claim':'draft','evidence':[]}]; a['reviews']=[{'independent':True,'verdict':'keep','revision':1,'evidence':'fixture review'}]
        a['reviews'][0]['binding']=c.review_binding(a)
        pending=dict(a); pending['checks']=a['checks']+[{'name':'required diagnostic','result':'pending','kind':'tool','evidence':'not executed'}]
        with self.assertRaisesRegex(ValueError,'pending'): c.transition(pending,'accepted',1,'test','acceptance receipt')
        result=c.transition(a,'accepted',1,'test','acceptance receipt')
        self.assertEqual(result['accepted_from_revision'],1)
        altered=dict(result); altered['original_treatment']='Changed treatment after review'
        with self.assertRaisesRegex(ValueError,'independent keep'): c.validate(altered)
        result['revision']=3
        with self.assertRaisesRegex(ValueError,'preceding'): c.validate(result)
    def test_pending_selection_blocks_acceptance(self):
        a=fixture(); a['state']='accepted'; a['revision']=2; a['accepted_from_revision']=1; a['founder_selection']='pending'; a['validation_state']='checked'; a['checks']=[{'name':'fixture','result':'pass','kind':'tool','evidence':'test'}]; a['artifacts']=[{'id':'test','role':'build','locator':'fixture.txt','sha256':'0'*64,'revision':1,'mode':'prototype','rights':'cleared','claim':'preview','evidence':[]}]
        with self.assertRaisesRegex(ValueError,'Founder selection'): c.validate(a)

if __name__=='__main__': unittest.main()
