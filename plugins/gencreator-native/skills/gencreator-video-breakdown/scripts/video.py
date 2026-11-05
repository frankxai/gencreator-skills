#!/usr/bin/env python3
"""Offline video evidence, explicit Apify import and bounded collection plans.

No network calls, credentials, publishing, or model calls. Python 3.10+.
"""
import argparse
from datetime import datetime
import hashlib
import json
import math
from pathlib import Path
import re
import subprocess
import sys
from urllib.parse import urlsplit, urlencode

LIMIT = 5 * 1024 * 1024
MODALITIES = {'visual', 'transcript', 'audio', 'metadata'}


def need(ok, message):
    if not ok:
        raise ValueError(message)


def number(value):
    return type(value) in (int, float) and math.isfinite(value)


def text(value):
    return isinstance(value, str) and bool(value.strip()) and len(value) <= 20000


def pairs(values):
    result = {}
    for key, value in values:
        need(key not in result, 'duplicate JSON key')
        result[key] = value
    return result


def load(path):
    raw = Path(path).read_bytes()
    need(len(raw) <= LIMIT, 'input exceeds 5 MiB')
    return json.loads(raw, object_pairs_hook=pairs,
                      parse_constant=lambda _: (_ for _ in ()).throw(ValueError('nonfinite JSON')))


def digest(value):
    raw = json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False,
                     allow_nan=False).encode()
    return 'sha256:' + hashlib.sha256(raw).hexdigest()


def timestamp(value):
    need(text(value), 'timestamp required')
    dt = datetime.fromisoformat(value.replace('Z', '+00:00'))
    need(dt.utcoffset() is not None, 'timezone required')
    return value


def canonical_url(value):
    need(text(value), 'video URL required')
    p = urlsplit(value)
    need(p.scheme == 'https' and p.hostname and not p.username and not p.password
         and p.port in (None, 443), 'HTTPS URL without credentials required')
    host = p.hostname.lower().removeprefix('www.').removeprefix('m.')
    parts = p.path.strip('/').split('/')
    if host == 'youtu.be':
        vid = parts[0]
        need(bool(re.fullmatch(r'[A-Za-z0-9_-]{11}', vid)), 'invalid YouTube ID')
        return 'https://www.youtube.com/shorts/' + vid
    if host == 'youtube.com':
        from urllib.parse import parse_qs
        vid = parse_qs(p.query).get('v', [''])[0] if parts[0] == 'watch' else (
            parts[1] if len(parts) == 2 and parts[0] in {'shorts', 'embed', 'live'} else '')
        need(bool(re.fullmatch(r'[A-Za-z0-9_-]{11}', vid)), 'invalid YouTube video URL')
        return 'https://www.youtube.com/shorts/' + vid
    if host == 'instagram.com':
        need(len(parts) == 2 and parts[0] in {'p', 'reel', 'reels'}
             and bool(re.fullmatch(r'[A-Za-z0-9_-]+', parts[1])), 'invalid Instagram video URL')
        return 'https://www.instagram.com/reel/' + parts[1] + '/'
    if host == 'tiktok.com':
        need(len(parts) == 3 and parts[0].startswith('@') and parts[1] == 'video'
             and parts[2].isdigit(), 'resolve TikTok shortlinks with an authorized provider first')
        return 'https://www.tiktok.com/' + '/'.join(parts)
    raise ValueError('supported video hosts: YouTube, Instagram, TikTok')


def plan(data):
    required = {'actor', 'build', 'input', 'input_schema_ref', 'max_usd', 'max_items', 'timeout_seconds'}
    need(isinstance(data, dict) and set(data) == required, 'collection plan fields differ from contract')
    need(isinstance(data['actor'], str) and bool(re.fullmatch(r'[A-Za-z0-9_-]+(?:~[A-Za-z0-9_-]+)?', data['actor'])), 'invalid Actor ID')
    need(isinstance(data['build'], str) and bool(re.fullmatch(r'\d+\.\d+\.\d+', data['build'])), 'pin a numeric Actor build; latest is not reproducible')
    need(isinstance(data['input'], dict) and bool(data['input']), 'verified actor-specific input required')
    need(text(data['input_schema_ref']) and data['input_schema_ref'].startswith('https://'), 'actor input schema reference required')
    need(number(data['max_usd']) and 0 < data['max_usd'] <= 10, 'budget must be >0 and <=10 USD')
    need(type(data['max_items']) is int and 1 <= data['max_items'] <= 100, 'item cap must be 1..100')
    need(type(data['timeout_seconds']) is int and 1 <= data['timeout_seconds'] <= 300, 'timeout must be 1..300 seconds')
    # Input is sent nowhere. Reject common credential keys even in an offline plan.
    def inspect(v):
        if isinstance(v, dict):
            for k, child in v.items():
                need(not re.search(r'token|password|secret|cookie|authorization|api.?key', k, re.I), 'credentials do not belong in plans')
                inspect(child)
        elif isinstance(v, list):
            for child in v: inspect(child)
    inspect(data['input'])
    query = urlencode({'build': data['build'], 'maxTotalChargeUsd': data['max_usd'],
                       'maxItems': data['max_items'], 'timeout': data['timeout_seconds'],
                       'restartOnError': 'false'})
    result = {'schema': 'gencreator.apify-plan.v1', 'state': 'planned_only',
              'method': 'POST', 'url': 'https://api.apify.com/v2/actors/' + data['actor'] + '/runs?' + query,
              'body': data['input'], 'input_schema_ref': data['input_schema_ref'],
              'max_usd': data['max_usd'], 'actual_cost_usd': None,
              'execution_blockers': ['Actor schema/build verification', 'registry admission',
                                     'authorized provider connection', 'durable reservation and ambiguous-start reconciliation'],
              'warning': 'maxItems caps charged results for pay-per-result Actors, not returned rows; apply an import cap too'}
    result['plan_digest'] = digest(result)
    return result


def field(row, path):
    if path is None:
        return None
    need(text(path), 'field paths must be strings or null')
    value = row
    for key in path.split('.'):
        if not isinstance(value, dict) or key not in value:
            return None
        value = value[key]
    return value


def normalize(rows, mapping):
    keys = {'id', 'url', 'creator', 'views', 'published_at', 'duration_seconds', 'transcript'}
    need(isinstance(mapping, dict) and set(mapping) == {'schema', 'fields', 'provenance'}, 'mapping fields differ')
    need(mapping['schema'] == 'gencreator.apify-map.v1' and isinstance(mapping['fields'], dict)
         and set(mapping['fields']) == keys, 'explicit field mapping required')
    for k, value in mapping['fields'].items():
        need(value is None or text(value), 'mapping values must be paths or null')
        if k in {'id', 'url', 'creator'}: need(text(value), 'identity mappings required')
    prov = mapping['provenance']
    need(isinstance(prov, dict) and set(prov) == {'actor', 'build', 'run_id', 'dataset_id', 'observed_at', 'actual_cost_usd'}, 'provenance fields differ')
    for key in {'actor', 'build', 'run_id', 'dataset_id'}: need(text(prov[key]), 'provider lineage required')
    timestamp(prov['observed_at'])
    need(prov['actual_cost_usd'] is None or number(prov['actual_cost_usd']) and prov['actual_cost_usd'] >= 0, 'invalid actual cost')
    need(isinstance(rows, list) and 1 <= len(rows) <= 100, 'import 1..100 rows; paginate deliberately')
    output, ids, urls = [], set(), set()
    for row in rows:
        need(isinstance(row, dict), 'dataset row must be an object')
        record = {key: field(row, mapping['fields'][key]) for key in keys}
        for key in {'id', 'creator'}: need(text(record[key]), 'identity missing; numeric IDs must be exported as strings')
        record['url'] = canonical_url(record['url'])
        need(record['id'] not in ids and record['url'] not in urls, 'duplicate video identity')
        ids.add(record['id']); urls.add(record['url'])
        for key in {'views', 'duration_seconds'}:
            v = record[key]
            need(v is None or number(v) and v >= 0, 'invalid numeric observation')
        if record['published_at'] is not None: timestamp(record['published_at'])
        need(record['transcript'] is None or isinstance(record['transcript'], str), 'transcript must be text or null')
        record.update(paid=None, audience_segment='unknown', observation_window_hours=None,
                      media_inspected=False, rights='unknown', provenance=dict(prov))
        output.append(record)
    return {'schema': 'gencreator.video-observations.v1', 'state': 'imported_unverified',
            'dataset_digest': digest(rows), 'mapping_digest': digest(mapping), 'videos': output,
            'performance_status': 'insufficient_evidence',
            'limitations': ['Metadata is not video inspection', 'Lifetime counts are not equal-age cohorts',
                            'Provider attribution is supplied, not authenticated', 'No retention curve or causality established']}


def validate_report(data):
    need(isinstance(data, dict) and set(data) == {'schema', 'video_ref', 'duration_seconds', 'evidence', 'claims', 'beats'}, 'report fields differ')
    need(data['schema'] == 'gencreator.video-breakdown.v1' and text(data['video_ref']), 'invalid report identity')
    duration = data['duration_seconds']
    need(number(duration) and 0 < duration <= 3600, 'invalid duration')
    evidence = data['evidence']; claims = data['claims']; beats = data['beats']
    need(isinstance(evidence, list) and 1 <= len(evidence) <= 500, '1..500 evidence entries required')
    index = {}
    for e in evidence:
        need(isinstance(e, dict) and set(e) == {'id', 'modality', 'start', 'end', 'artifact_ref', 'sha256'}, 'evidence fields differ')
        need(text(e['id']) and e['id'] not in index and e['modality'] in MODALITIES, 'evidence identity or modality invalid')
        need(number(e['start']) and number(e['end']) and 0 <= e['start'] <= e['end'] <= duration, 'evidence timestamps out of bounds')
        need(text(e['artifact_ref']) and isinstance(e['sha256'], str)
             and bool(re.fullmatch(r'sha256:[a-f0-9]{64}', e['sha256'])), 'artifact reference and digest required')
        index[e['id']] = e
    need(isinstance(claims, list) and 1 <= len(claims) <= 100, '1..100 claims required')
    for claim in claims:
        need(isinstance(claim, dict) and set(claim) == {'text', 'kind', 'modality', 'evidence_ids'}, 'claim fields differ')
        need(text(claim['text']) and claim['kind'] in {'observation', 'hypothesis'}
             and claim['modality'] in MODALITIES, 'invalid claim')
        refs = claim['evidence_ids']
        need(isinstance(refs, list) and bool(refs) and all(isinstance(r, str) and r in index for r in refs), 'claim has missing evidence')
        need(all(index[r]['modality'] == claim['modality'] for r in refs), 'claim modality unsupported by evidence')
    need(isinstance(beats, list) and 1 <= len(beats) <= 100, '1..100 beats required')
    last_end = 0
    for beat in beats:
        need(isinstance(beat, dict) and set(beat) == {'start', 'end', 'role', 'evidence_ids'}, 'beat fields differ')
        need(number(beat['start']) and number(beat['end']) and last_end <= beat['start'] < beat['end'] <= duration, 'beats must be ordered, nonoverlapping and within duration')
        need(text(beat['role']), 'beat role required')
        refs = beat['evidence_ids']
        need(isinstance(refs, list) and bool(refs) and all(isinstance(r, str) and r in index for r in refs), 'beat evidence missing')
        need(all(index[r]['start'] <= beat['end'] and index[r]['end'] >= beat['start'] for r in refs), 'beat evidence does not overlap beat')
        last_end = beat['end']
    mods = sorted({e['modality'] for e in evidence})
    return {'schema': 'gencreator.video-validation.v1', 'state': 'structurally_valid',
            'report_digest': digest(data), 'modalities': mods,
            'scope': 'multimodal' if len(mods) > 1 else mods[0] + '_only',
            'limitations': ['References and human/model observations are not independently authenticated',
                            'No causal explanation or viewer retention established', 'Not publication approval']}


def handoff(data):
    need(isinstance(data, dict) and set(data) == {'report', 'creator_pack_ref', 'original_angle', 'script', 'experiment'}, 'handoff fields differ')
    check = validate_report(data['report'])
    for key in {'creator_pack_ref', 'original_angle', 'script'}: need(text(data[key]), key + ' required')
    experiment = data['experiment']
    required = {'hypothesis', 'changed_variable', 'control', 'metric', 'denominator', 'window', 'stop_rule'}
    need(isinstance(experiment, dict) and set(experiment) == required
         and all(text(v) for v in experiment.values()), 'complete experiment required')
    packet = {'schema': 'gencreator.video-production-handoff.v1', 'state': 'draft',
              'creator_pack_ref': data['creator_pack_ref'], 'source_report_digest': check['report_digest'],
              'source_report': data['report'], 'original_angle': data['original_angle'],
              'script': data['script'], 'experiment': experiment, 'rights': 'review_required',
              'approval': None, 'published': False,
              'next_owners': ['gencreator-voice-studio', 'gencreator-produce', 'review-and-learn'],
              'managed_import': 'not_implemented'}
    packet['revision_digest'] = digest(packet)
    return packet


def frames(media, output, step):
    media = Path(media).resolve(); output = Path(output).absolute()
    need(media.is_file() and media.suffix.lower() in {'.mp4', '.mov', '.webm', '.mkv'}, 'local video file required')
    need(media.stat().st_size <= 256 * 1024 * 1024, 'local media exceeds 256 MiB')
    need(not output.exists() and not output.is_symlink(), 'new output directory required')
    need(number(step) and 0.5 <= step <= 30, 'frame step must be 0.5..30 seconds')
    common = ['-v', 'error', '-protocol_whitelist', 'file,pipe', '-format_whitelist', 'mov,matroska,webm']
    probe = subprocess.run(['ffprobe', *common, '-show_entries', 'format=duration', '-of', 'json', str(media)],
                           capture_output=True, timeout=20, check=True)
    duration = float(json.loads(probe.stdout)['format']['duration'])
    need(math.isfinite(duration) and 0 < duration <= 600 and math.ceil(duration / step) <= 120, 'media exceeds 600s or 120 frames; increase step or make an authorized clip')
    output.mkdir(parents=True)
    subprocess.run(['ffmpeg', '-nostdin', *common, '-n', '-i', str(media), '-an',
                    '-vf', f'fps=1/{step},scale=640:-2', '-frames:v', '120', str(output / 'frame-%04d.jpg')],
                   capture_output=True, timeout=90, check=True)
    files = sorted(output.glob('frame-*.jpg'))
    need(bool(files), 'no frames extracted')
    # fps samples are approximate; do not present them as scene cuts or exact source PTS.
    entries = [{'path': p.name, 'approx_seconds': min((i + 0.5) * step, duration),
                'sha256': 'sha256:' + hashlib.sha256(p.read_bytes()).hexdigest()} for i, p in enumerate(files)]
    receipt = {'schema': 'gencreator.frame-manifest.v1', 'duration_seconds': duration,
               'sampling': 'uniform_approximate', 'step_seconds': step, 'frames': entries,
               'inspected': False, 'audio_listened': False,
               'media_sha256': 'sha256:' + hashlib.sha256(media.read_bytes()).hexdigest()}
    (output / 'manifest.json').write_text(json.dumps(receipt, indent=2) + '\n')
    return receipt


def main():
    p = argparse.ArgumentParser(description=__doc__)
    sub = p.add_subparsers(dest='command', required=True)
    for action in ['plan', 'validate', 'handoff']:
        s = sub.add_parser(action); s.add_argument('input')
    s = sub.add_parser('import-apify'); s.add_argument('input'); s.add_argument('mapping')
    s = sub.add_parser('frames'); s.add_argument('media'); s.add_argument('output'); s.add_argument('--step', type=float, default=2)
    args = p.parse_args()
    try:
        if args.command == 'frames': result = frames(args.media, args.output, args.step)
        elif args.command == 'import-apify': result = normalize(load(args.input), load(args.mapping))
        else: result = {'plan': plan, 'validate': validate_report, 'handoff': handoff}[args.command](load(args.input))
        print(json.dumps(result, indent=2, allow_nan=False))
    except (ValueError, TypeError, KeyError, OSError, OverflowError, RecursionError, subprocess.SubprocessError):
        print(json.dumps({'state': 'blocked', 'error': 'invalid input, missing local capability or media processing failed; no operation claimed successful'}), file=sys.stderr)
        return 2
    return 0


if __name__ == '__main__':
    sys.exit(main())
