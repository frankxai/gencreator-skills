#!/usr/bin/env python3
"""Commission adapter for existing GenCreator edition primitives. No network/inference."""
import argparse
from copy import deepcopy
from datetime import datetime, timezone
import importlib.util
import json
import os
from pathlib import Path
import re
import sys
import tempfile
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

BASE = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('gencreator_edition', BASE / 'skills/gencreator-produce/scripts/edition.py')
edition = importlib.util.module_from_spec(spec)
spec.loader.exec_module(edition)
digest, read_file, unique_object = edition.digest, edition.read_file, edition.unique_object
STATES = {'captured': {'researched'}, 'researched': {'commissioned'}, 'commissioned': {'prototyped'}, 'prototyped': {'reviewed', 'commissioned'}, 'reviewed': {'accepted', 'rejected', 'commissioned'}, 'accepted': set(), 'rejected': set()}
RIGHTS = {'unknown', 'reference-only', 'cleared', 'restricted'}
TRACKING = {'fbclid', 'gclid', 'igshid', 'mc_cid', 'mc_eid'}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def strings(value, label):
    require(isinstance(value, list) and all(isinstance(x, str) and x.strip() for x in value), label + ': expected list of text')


def text(value, label):
    return edition.text(value, label, 20000)


def canonical_url(value):
    text(value, 'url')
    p = urlsplit(value)
    require(p.scheme in {'https', 'http'} and p.hostname and not p.username and not p.password, 'Expected public http(s) source URL without credentials')
    require(not any(ord(x) < 33 for x in value), 'Control/whitespace in URL')
    netloc = p.hostname.lower()
    if p.port and not ((p.scheme == 'https' and p.port == 443) or (p.scheme == 'http' and p.port == 80)):
        netloc += ':' + str(p.port)
    if ':' in p.hostname:
        netloc = '[' + p.hostname.lower() + ']' + ((':' + str(p.port)) if p.port else '')
    query = sorted((k, v) for k, v in parse_qsl(p.query, keep_blank_values=True) if not k.lower().startswith('utm_') and k.lower() not in TRACKING)
    return urlunsplit((p.scheme.lower(), netloc, p.path or '/', urlencode(query), ''))


def load(path):
    return json.loads(read_file(path), object_pairs_hook=unique_object, parse_constant=lambda x: (_ for _ in ()).throw(ValueError('Nonfinite JSON')))


def validate(row):
    require(isinstance(row, dict), 'Expected commission object')
    required = {'schema_version', 'commission_id', 'revision', 'owner', 'objective', 'beneficiary', 'why_now', 'original_treatment', 'implementation_path', 'next_action', 'kind', 'state', 'sources', 'guidance', 'artifacts', 'rights_state', 'validation_state', 'release_state', 'release_evidence', 'selected_treatment', 'founder_selection', 'reviews', 'learning', 'events', 'checks'}
    require(required <= row.keys(), 'Missing commission fields: ' + ', '.join(sorted(required - row.keys())))
    require(type(row['schema_version']) is int and row['schema_version'] == 1, 'Unsupported schema version')
    require(re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_-]{0,79}', row['commission_id'] or ''), 'Invalid commission id')
    require(type(row['revision']) is int and row['revision'] >= 1, 'Invalid revision')
    for k in ['owner', 'objective', 'beneficiary', 'why_now', 'original_treatment', 'implementation_path', 'next_action']:
        text(row[k], k)
    require(row['kind'] in {'visual', 'nonvisual'}, 'Invalid kind')
    require(row['state'] in STATES, 'Invalid state')
    require(row['rights_state'] in RIGHTS, 'Invalid rights_state')
    require(row['validation_state'] in {'unverified', 'checked', 'failed'}, 'Invalid validation_state')
    require(row['release_state'] in {'private', 'preview', 'published'}, 'Invalid release_state')
    require(row['founder_selection'] in {'pending', 'accepted', 'not-required'}, 'Invalid founder_selection')
    require(row['selected_treatment'] is None or (isinstance(row['selected_treatment'], str) and row['selected_treatment'].strip()), 'Invalid selected_treatment')
    strings(row['release_evidence'], 'release_evidence')
    require(row['release_state'] != 'published' or row['release_evidence'], 'Published state needs release evidence')
    for k in ['sources', 'guidance', 'artifacts', 'reviews', 'learning', 'events', 'checks']:
        require(isinstance(row[k], list) and len(row[k]) <= 1000, k + ': expected bounded list')
    require(row['sources'], 'At least one source required')
    seen = set()
    for source in row['sources']:
        require(isinstance(source, dict), 'Invalid source')
        for k in ['url', 'revision', 'captured_at', 'access', 'rights', 'mechanism', 'reuse']:
            require(k in source, 'Missing source ' + k)
        key = (canonical_url(source['url']), source['revision'])
        require(key not in seen, 'Duplicate source and revision')
        seen.add(key)
        for k in ['revision', 'captured_at', 'mechanism']:
            text(source[k], k)
        require(source['access'] in {'verified', 'inaccessible', 'partial'}, 'Invalid access')
        require(source['rights'] in RIGHTS, 'Invalid source rights')
        require(source['reuse'] in {'principle', 'quoted', 'copied'}, 'Invalid reuse')
        require(source['reuse'] != 'copied' or source['rights'] == 'cleared', 'Copied source requires cleared rights')
    for guide in row['guidance']:
        for k in ['locator', 'revision', 'captured_at', 'status']:
            require(k in guide, 'Missing guidance ' + k)
        require(guide['status'] in {'accepted', 'proposal', 'stale', 'unavailable'}, 'Invalid guidance status')
    ids = set()
    for artifact in row['artifacts']:
        for k in ['id', 'role', 'locator', 'sha256', 'revision', 'mode', 'rights', 'claim', 'evidence']:
            require(k in artifact, 'Missing artifact ' + k)
        require(artifact['id'] not in ids, 'Duplicate artifact id')
        ids.add(artifact['id'])
        require(type(artifact['revision']) is int and 1 <= artifact['revision'] <= row['revision'], 'Invalid artifact revision')
        require(artifact['mode'] in {'actual', 'fixture', 'replay', 'prototype'}, 'Invalid artifact mode')
        require(artifact['rights'] in {'cleared', 'unknown', 'restricted'}, 'Invalid artifact rights')
        require(re.fullmatch(r'(sha256:)?[0-9a-f]{64}', artifact['sha256'] or ''), 'Expected artifact SHA256')
        require(artifact['claim'] in {'draft', 'preview', 'live', 'published'}, 'Invalid artifact claim')
        strings(artifact['evidence'], 'artifact evidence')
        require(artifact['claim'] not in {'live', 'published'} or artifact['mode'] == 'actual', 'Fixture/replay/prototype cannot claim live/published')
        require(artifact['claim'] not in {'live', 'published'} or artifact['evidence'], 'Live/published claim needs evidence')
        require(artifact['claim'] not in {'live', 'published'} or artifact['rights'] == 'cleared', 'Live/published artifact needs cleared rights')
    for check in row['checks']:
        require(check.get('result') in {'pass', 'fail', 'pending'}, 'Invalid check result')
        require(check.get('kind') in {'deterministic', 'model', 'tool', 'human'}, 'Invalid check kind')
        text(check.get('name'), 'check name')
        text(check.get('evidence'), 'check evidence')
    if row['validation_state'] == 'checked':
        require(row['checks'] and not any(x['result'] == 'fail' for x in row['checks']), 'Checked state needs executed passing checks without failures')
        require(any(x['result'] == 'pass' for x in row['checks']), 'No passing check')
    if row['state'] == 'accepted':
        require(type(row.get('accepted_from_revision')) is int and row['accepted_from_revision'] == row['revision'] - 1, 'Acceptance must bind immediately preceding reviewed revision')
        require(row['artifacts'] and row['validation_state'] == 'checked', 'Acceptance needs artifacts and checked validation')
        require(all(x['result'] == 'pass' for x in row['checks']), 'Acceptance blocked by pending or failed checks')
        require(row['founder_selection'] != 'pending', 'Founder selection pending')
        require(row['selected_treatment'] is not None or row['kind'] == 'nonvisual', 'Visual acceptance needs selected treatment')
        require(not any(x['status'] == 'stale' for x in row['guidance']), 'Stale guidance blocks acceptance')
        require(any(x.get('independent') is True and x.get('verdict') == 'keep' and x.get('revision') == row['accepted_from_revision'] and x.get('binding') == review_binding(row) and x.get('evidence') for x in row['reviews']), 'Acceptance needs independent keep review bound to current revision')
    return row


def review_binding(row):
    return digest({k: row[k] for k in ['commission_id', 'objective', 'beneficiary', 'why_now', 'original_treatment', 'implementation_path', 'sources', 'guidance', 'artifacts', 'selected_treatment']})


def duplicate_key(row):
    validate(row)
    return digest({'objective': ' '.join(row['objective'].lower().split()), 'sources': sorted({canonical_url(x['url']) for x in row['sources']})})


def transition(row, state, expected_revision, actor, evidence):
    validate(row)
    require(row['revision'] == expected_revision, 'Stale revision')
    require(state in STATES[row['state']], 'Illegal lifecycle transition')
    text(actor, 'actor'); text(evidence, 'transition evidence')
    result = deepcopy(row)
    result['state'] = state
    result['revision'] += 1
    if state == 'accepted':
        result['accepted_from_revision'] = row['revision']
    result['events'].append({'actor': actor, 'from': row['state'], 'to': state, 'revision': result['revision'], 'evidence': evidence})
    # Acceptance binds the review of the immediately preceding revision; later edits invalidate it.
    return validate(result)


def atomic_save(path, value, expected_revision=None):
    validate(value)
    path = Path(path)
    lock = path.with_name(path.name + '.lock')
    require(not path.is_symlink(), 'Refuse symlink destination')
    fd = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    tmp = None
    try:
        os.close(fd)
        if expected_revision is None:
            require(not path.exists(), 'Refuse overwrite without expected revision')
        else:
            require(path.exists() and load(path)['revision'] == expected_revision, 'Stale on-disk revision')
            require(value['revision'] == expected_revision + 1, 'Write must increment revision exactly once')
        with tempfile.NamedTemporaryFile('w', encoding='utf8', dir=path.parent, prefix='.' + path.name + '.', delete=False) as handle:
            tmp = Path(handle.name)
            json.dump(value, handle, indent=2, ensure_ascii=False, allow_nan=False)
            handle.write('\n'); handle.flush(); os.fsync(handle.fileno())
        os.replace(tmp, path)
        tmp = None
    finally:
        if tmp is not None:
            tmp.unlink(missing_ok=True)
        lock.unlink(missing_ok=True)


def export(row, audience='private'):
    validate(row)
    require(audience in {'private', 'public'}, 'Invalid audience')
    if audience == 'private':
        return deepcopy(row)
    # Public export is deliberately an allowlist; no private locators, notes or source media.
    return {'schema_version': 1, 'commission_id': row['commission_id'], 'revision': row['revision'], 'state': row['state'], 'rights_state': row['rights_state'], 'validation_state': row['validation_state'], 'release_state': row['release_state'], 'record_digest': digest(row), 'public_export': True}


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('command', choices=['validate', 'hash', 'dedup', 'transition', 'export'])
    p.add_argument('input')
    p.add_argument('extra', nargs='*')
    p.add_argument('--expected-revision', type=int)
    p.add_argument('--actor')
    p.add_argument('--evidence')
    p.add_argument('--audience', default='private', choices=['private', 'public'])
    args = p.parse_args()
    try:
        row = load(args.input)
        if args.command == 'validate':
            validate(row); result = {'valid': True, 'commission_id': row['commission_id'], 'revision': row['revision']}
        elif args.command == 'hash':
            validate(row); result = {'sha256': digest(row), 'dedup_key': duplicate_key(row), 'review_binding': review_binding(row)}
        elif args.command == 'dedup':
            rows = [row] + [load(x) for x in args.extra]
            groups = {}
            for item in rows:
                groups.setdefault(duplicate_key(item), []).append(item['commission_id'])
            result = {'duplicate_groups': [x for x in groups.values() if len(x) > 1]}
        elif args.command == 'transition':
            require(len(args.extra) == 1 and args.expected_revision is not None, 'Supply destination and --expected-revision')
            result = transition(row, args.extra[0], args.expected_revision, args.actor, args.evidence)
            atomic_save(args.input, result, args.expected_revision)
        else:
            require(len(args.extra) == 1, 'Supply output path')
            result = export(row, args.audience)
            with open(args.extra[0], 'x', encoding='utf8') as stream:
                json.dump(result, stream, ensure_ascii=False, indent=2, allow_nan=False); stream.write('\n')
        print(json.dumps(result, indent=2, ensure_ascii=False, allow_nan=False))
        return 0
    except (ValueError, TypeError, KeyError, OSError, UnicodeError, OverflowError) as error:
        print(json.dumps({'error': str(error)}), file=sys.stderr)
        return 2


if __name__ == '__main__':
    raise SystemExit(main())
