"""Check the eight-document layout, links, contracts and migration; no network."""
import hashlib
import json
import re
from collections import Counter, defaultdict
from pathlib import Path

def matches_text_digest(data: bytes, expected: str) -> bool:
    normalized = data.replace(b'\r\n', b'\n')
    candidates = {data, normalized, normalized.replace(b'\n', b'\r\n')}
    return any(hashlib.sha256(candidate).hexdigest() == expected for candidate in candidates)

root = Path(__file__).resolve().parents[1]
delivery_targets = {
    (root.parent/'output/prototypes/2026-11-13-v5-commercial'/name).resolve()
    for name in ('index.html','manifest.json')
} | {
    (root.parent/'output/verification'/name).resolve()
    for name in ('v5-prototype-delivery.json','v3-final-static-checks.json','detailed-design-database.json','detailed-design-coverage.json','postgresql-foundation.json','persistence-foundation.json','frontend-implementation-progress.json','admin-operations/report.json','admin-travel/report.json','identity/report.json','production-build.json','retail-pages/report.json','consumer-overview/report.json','publisher-profile/report.json','output-pages/report.json','account-pages/report.json','notification-pages/report.json')
}
delivery_targets.add((root.parent/'output/verification/public-travel-pages/asset-provenance.json').resolve())
delivery_targets.update((root.parent/'output/verification/role-layouts'/name).resolve() for name in ('index.html','report.json'))
expected_files = {
    'README.md', '01-产品需求与功能设计.md', '02-系统架构与详细设计.md',
    '03-接口协议与脚本开发规范.md', '04-部署运维与监控手册.md',
    '05-测试验收与验证记录.md', '06-详细开发设计.md', '07-完整系统数据库设计.md',
}
expected_counts = {'REQ':61,'AC':52,'AL':29,'OBS':22,'E2E':26,'INV':16,'FLOW':13,'TX':10,'OUT':8,'LONG':6,'ADP':10}
owner = {'REQ':'01-', 'INV':'02-', 'FLOW':'02-', 'TX':'02-', 'AL':'04-'}
owner.update({k:'05-' for k in ('AC','OBS','E2E','OUT','LONG','ADP')})
markdown_files = sorted(root.rglob('*.md'))
json_files = sorted(root.rglob('*.json'))
issues = []
actual_files = {p.relative_to(root).as_posix() for p in markdown_files}
if actual_files != expected_files:
    issues.append(f'Markdown layout mismatch: {actual_files ^ expected_files}')
texts = {p.relative_to(root).as_posix():p.read_text(encoding='utf-8') for p in markdown_files}
anchors = {}
for name, text in texts.items():
    ids = re.findall(r'<a id="([a-z0-9-]+)"></a>',text)
    anchors[name] = set(ids)
    if len(ids) != len(set(ids)):
        issues.append(f'{name}: duplicate anchors')


def check_target(origin, target, label):
    if re.match(r'[A-Za-z][A-Za-z0-9+.-]*://|mailto:',target):
        return
    local, _, fragment = target.partition('#')
    path = (root / origin).parent / local if local else root / origin
    resolved = path.resolve()
    if not resolved.is_relative_to(root.resolve()) and resolved not in delivery_targets:
        issues.append(f'{label}: link escapes docs: {target}')
        return
    if not resolved.exists():
        issues.append(f'{label}: missing link: {target}')
        return
    if resolved in delivery_targets:
        if fragment:
            issues.append(f'{label}: unexpected fragment on delivery artifact: {target}')
        return
    relative = resolved.relative_to(root.resolve()).as_posix()
    if fragment and resolved.suffix == '.md' and fragment not in anchors.get(relative,set()):
        issues.append(f'{label}: missing anchor: {target}')


definitions = defaultdict(list)
table_count = 0
for name, text in texts.items():
    if '\ufffd' in text or any(ord(c)<32 and c not in '\n\r\t' for c in text):
        issues.append(f'{name}: replacement or control character')
    if len(re.findall(r'^```',text,re.M)) % 2:
        issues.append(f'{name}: unclosed fence')
    plain = re.sub(r'```.*?```','',text,flags=re.S)
    sections = [int(v) for v in re.findall(r'^## (\d+)\.',plain,re.M)]
    if sections and sections != list(range(1,len(sections)+1)):
        issues.append(f'{name}: section sequence {sections}')
    for target in re.findall(r'\]\(([^)]+)\)',plain):
        check_target(name,target,name)
    if re.search(r'\[\[|\[[^\[\]\n]*\[[^\]]+\]\([^)]+\)\]',plain):
        issues.append(f'{name}: nested/broken Markdown link')
    for block in re.findall(r'```json\s*\n(.*?)\n```',text,re.S):
        try: json.loads(block)
        except ValueError as exc: issues.append(f'{name}: invalid JSON block: {exc}')
    for prefix in expected_counts:
        ids = [int(v) for v in re.findall(r'^\| '+prefix+r'-(\d+)(?:\s|\s*/)',plain,re.M)]
        if ids and not name.startswith(owner[prefix]):
            issues.append(f'{name}: {prefix} definitions outside owning document')
        definitions[prefix].extend(ids)
    # Table rows use escaped pipes for literal separators, as required by GFM.
    lines = plain.splitlines()
    n = 0
    while n < len(lines):
        if not lines[n].startswith('|'):
            n += 1
            continue
        rows = []
        while n < len(lines) and lines[n].startswith('|'):
            rows.append(lines[n]); n += 1
        widths = [len(re.split(r'(?<!\\)\|',row))-2 for row in rows]
        if len(rows)<2 or not re.fullmatch(r'[\s|:\-]+',rows[1]) or len(set(widths)) != 1:
            issues.append(f'{name}: malformed table near line {n-len(rows)+1}: {widths}')
        else:
            table_count += 1
counts = {prefix:len(ids) for prefix,ids in definitions.items()}
for prefix, maximum in expected_counts.items():
    if sorted(definitions[prefix]) != list(range(1,maximum+1)):
        issues.append(f'{prefix}: missing/duplicate definitions: {Counter(definitions[prefix])}')
for path in json_files:
    try: json.loads(path.read_text(encoding='utf-8'))
    except ValueError as exc: issues.append(f'{path.name}: invalid JSON: {exc}')

protocol = texts.get('03-接口协议与脚本开发规范.md','')
blocks = [json.loads(b) for b in re.findall(r'```json\s*\n(.*?)\n```',protocol,re.S)]
for suffix, predicate in (
    ('manifest',lambda d:'schema_version' in d and 'actions' in d),
    ('invocation',lambda d:'input' in d and 'invocation_id' in d),
    ('result',lambda d:'outcome' in d),
):
    inline = [d for d in blocks if predicate(d)]
    sample = json.loads((root/'contracts/examples'/f'report.{suffix}.json').read_text(encoding='utf-8'))
    if inline != [sample]:issues.append(f'protocol and report.{suffix}.json differ')

ledger_path = root/'checks/document-migration.json'
ledger = json.loads(ledger_path.read_text(encoding='utf-8'))
if len(ledger['sources']) != 11 or len(ledger['assets']) != 38:
    issues.append('migration source/contract inventory mismatch')
if ledger['traceability'] != expected_counts:
    issues.append('migration traceability count mismatch')
migrated_sections = 0
for source in ledger['sources']:
    entries = source['sections']
    section_numbers = [entry['section'] for entry in entries]
    if section_numbers != [0] and section_numbers != list(range(1,len(entries)+1)):
        issues.append(f'{source["path"]}: incomplete section migration')
    for entry in entries:
        migrated_sections += 1
        for target in [entry['target'],*entry['secondary_targets']]:
            check_target('README.md',target,'migration '+source['path'])
for relative, digest in ledger['assets'].items():
    path = root/relative
    expected_digest = ledger.get('branding_title_changes', {}).get(relative, digest)
    if not path.exists() or not matches_text_digest(path.read_bytes(), expected_digest):
        issues.append(f'contract changed during documentation refactor: {relative}')
    elif expected_digest != digest:
        original_title = path.read_bytes().replace(b'"title": "Script Tools ', b'"title": "Travel Tools ')
        if not matches_text_digest(original_title, digest):
            issues.append(f'contract branding revision changed more than its title: {relative}')
if any((root/'contracts'/name).exists() for name in ('README.md','validate-docs.py','validate-contracts.ps1','validate-adapter-contracts.py','validate-output-contracts.py')):
    issues.append('old contract index or check location remains')
for name,text in texts.items():
    if re.search(r'\]\([^)]*(?:项目需求分析|项目功能分析|项目系统架构设计|项目日志监控设计|全系统逻辑闭环与开发契约|脚本产物与通知Hook设计|持续运行与产物批次设计|青龙能力借鉴与脚本接入设计|文档校验记录)\.md',text):
        issues.append(f'{name}: old document link remains')
    if 'docs/contracts/validate-' in text or 'docs\\contracts\\validate-' in text:
        issues.append(f'{name}: old check command remains')
if issues:
    raise SystemExit('FAIL:\n'+'\n'.join(issues))
print(f'PASS: {len(markdown_files)} Markdown files, {len(json_files)} JSON files, {table_count} tables; links/anchors, sections, examples and unique traceability.')
print(f'PASS: {migrated_sections} old sections mapped; 38 contract/example digests verified against the migration baseline and recorded title-only branding changes.')
print(json.dumps(counts,ensure_ascii=False,sort_keys=True))
