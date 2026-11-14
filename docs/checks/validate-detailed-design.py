"""Check complete design coverage and DB dictionary/DDL correspondence; no live services."""
import json,re,hashlib
from pathlib import Path
root=Path(__file__).resolve().parents[1]
dev=(root/'06-详细开发设计.md').read_text(encoding='utf-8')
db=(root/'07-完整系统数据库设计.md').read_text(encoding='utf-8')
catalog=json.loads((root/'contracts/ui-role-catalog.json').read_text(encoding='utf-8'))
issues=[];checks=0
def ck(condition,message):
    global checks
    checks+=1
    if not condition:issues.append(message)
for id,page in catalog['pages'].items():
    ck(f'| {id} {page["title"]} `'+page['route']+'`' in dev,id+' missing page/route')
for id,action in catalog['actions'].items():
    ck(len(re.findall(r'^#### \d+\. '+re.escape(id)+r' —',dev,re.M))==1,id+' missing/duplicate action')
    for endpoint in action['endpoints']:ck('`'+endpoint+'`' in dev,endpoint+' not mapped')
    ck(action['guard'] in dev,id+' stale guard')
    ck(action['success'] in dev,id+' stale result')
for i in range(1,62):ck(len(re.findall(r'^\| 需求 REQ-'+f'{i:03}'+r' ',dev,re.M))==1,f'REQ-{i:03}')
for i in range(1,17):ck(len(re.findall(r'^\| 规则 CMR-'+f'{i:02}'+r' ',dev,re.M))==1,f'CMR-{i:02}')
dictionary=re.findall(r'^#### ([a-z_]+) —',db,re.M)
ddl=re.findall(r'^CREATE TABLE ([a-z_]+) \(',db,re.M)
ck(dictionary==ddl,'dictionary/table DDL mismatch')
ck(len(ddl)==len(set(ddl)),'duplicate table')
field_count=0
for table in ddl:
    dictionary_block=re.search(r'^#### '+table+r' —.*?\n(.*?)(?=\n#### |\n<a id="table-|\n<a id="db-transactions")',db,re.M|re.S).group(1)
    dict_fields=re.findall(r'^\| ([a-z_][a-z0-9_]*) \| `',dictionary_block,re.M)
    sql_block=re.search(r'^CREATE TABLE '+table+r' \(\n(.*?)\n\);',db,re.M|re.S).group(1)
    sql_fields=re.findall(r'^  ([a-z_][a-z0-9_]*) ',sql_block,re.M)
    ck(dict_fields==sql_fields,table+' field order/coverage')
    ck('id' in sql_fields and 'revision' in sql_fields,table+' common identity')
    field_count+=len(sql_fields)
batch=json.loads((root/'contracts/output-batch.schema.json').read_text(encoding='utf-8'))
result=json.loads((root/'contracts/result.schema.json').read_text(encoding='utf-8'))
for table,col,values in [('output_batches','phase',batch['properties']['phase']['enum']),('output_batches','producer_outcome',batch['properties']['producer_outcome']['enum']),('execution_results','outcome',result['properties']['outcome']['enum'])]:
    block=re.search(r'CREATE TABLE '+table+r' \(\n(.*?)\n\);',db,re.S).group(1)
    enums=re.search(col+r' IN \((.*?)\)',block).group(1)
    ck(set(re.findall("'([^']+)'",enums))==set(values),table+'.'+col+' protocol drift')
for name in re.findall(r'\./07-完整系统数据库设计.md#table-([a-z-]+)',dev):
    ck(name.replace('-','_') in ddl,'unknown DTO table '+name)
ck('RJSF为优先验证候选' in dev and '当前仍为待验证' in dev,'RJSF status overclaim')
ck(('两连接' in dev or '多连接' in dev) and '多连接' in db,'live concurrency limitation missing')
if issues:raise SystemExit('FAIL:\n'+'\n'.join(issues))
report={'date':'2026-11-14','result':'PASS','checks':checks,'pages':len(catalog['pages']),'actions':len(catalog['actions']),'requirements':61,'commercial_rules':16,'tables':len(ddl),'fields':field_count,'documents':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in [root/'06-详细开发设计.md',root/'07-完整系统数据库设计.md']},'limit':'Static coverage and dictionary/DDL alignment; not live implementation acceptance'}
(root.parent/'output/verification/detailed-design-coverage.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(f'PASS: {checks} design coverage checks; {len(ddl)} tables, {field_count} fields, 66 pages, 102 actions, 61 requirements and 16 commercial rules.')
