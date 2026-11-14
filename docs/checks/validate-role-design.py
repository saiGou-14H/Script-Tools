"""V3 role/page/action and commercial document consistency checks, not live acceptance."""
import json,re
from pathlib import Path
R=Path(__file__).resolve().parents[1]
C=json.loads((R/'contracts/ui-role-catalog.json').read_text(encoding='utf-8'))
P,A,roles=C['pages'],C['actions'],C['roles'];issues=[];checks=0

def ck(value,message):
 global checks
 checks+=1
 if not value:issues.append(message)

known={'GUEST','USER','PUBLISHER','ADMIN'}
ck(C['document_version']=='V3.0','commercial V3 baseline')
ck({r['id'] for r in roles}==known,'four workspaces')
ck((len(P),len(A),sum(len(r['pages']) for r in roles))==(66,102,75),'page/action/image inventory')
ck(len({r['folder'] for r in roles})==4,'independent role folders')
page_refs=set();action_refs=set()
for r in roles:
 ck(r['home'] in r['pages'],r['id']+': home')
 ck(len(r['pages'])==len(set(r['pages'])),r['id']+': duplicate page')
 ck(not any(x in r['folder'] for x in ('..','/','\\')),r['id']+': safe folder')
 routes=[]
 for pid in r['pages']:
  ck(pid in P,r['id']+': missing '+pid)
  if pid not in P:continue
  p=P[pid];page_refs.add(pid);routes.append(p['route'])
  if p['kind']=='detail':ck(p['parent'] in r['pages'],r['id']+'/'+pid+': parent unreachable')
  for aid in p['actions']:
   ck(aid in A,pid+': missing action '+aid)
   if aid in A:ck(r['id'] in A[aid]['roles'],r['id']+'/'+pid+': unauthorized '+aid)
 ck(len(routes)==len(set(routes)),r['id']+': route collision')
ck(page_refs==set(P),'unreferenced pages')
for pid,p in P.items():
 ck(p['id']==pid and p['kind'] in ('menu','detail'),pid+': identity/kind')
 ck(p['route'].startswith('/') and '..' not in p['route'],pid+': route')
 ck(p['feature'] in C['features'],pid+': unknown feature')
 ck(len(p['content'])>=3 and len(p['states'])>=8,pid+': insufficient content/states')
 ck(bool(p['actions']),pid+': no actions');action_refs.update(p['actions'])
ck(action_refs==set(A),'unreachable/undefined actions')
for aid,a in A.items():
 ck(aid==a['id'] and set(a['roles'])<=known,aid+': identity/roles')
 ck(a['feature'] in C['features'],aid+': feature')
 ck(all(len(a[k])>=10 for k in ['guard','success','errors']),aid+': guard/result/error')
 for ep in a['endpoints']:
  ck(bool(re.fullmatch(r'(GET|POST|PATCH|PUT|DELETE) /api/v1/[^\s]+',ep)),aid+': malformed endpoint')
  if '/admin/' in ep:ck(a['roles']==['ADMIN'],aid+': admin leakage')
  ck(not re.search(r'/reviews|review-requests|/shared-versions|/purchases/subscriptions|/wallet',ep),aid+': superseded API')
 if 'GUEST' in a['roles']:ck(aid in {'public.read','catalog.read','scene.read','auth.enter'},aid+': guest private operation')
 if aid.startswith(('ops.','admin.')):ck(a['roles']==['ADMIN'],aid+': management leakage')
ck(not any(k.startswith('review.') for k in A),'no manual review actions')
ck('PER_USE' in A['pricing.manage']['guard'],'PER_USE only')
ck('同一逻辑' in A['pending.resume']['guard'],'resume charge dedup')
ck('有效entitlement' in A['task.configure']['guard'],'paid configuration entitlement')
ck('预占权益' in A['task.run']['guard'],'atomic entitlement reservation')
ck('验签' not in A['payment.start']['success'] and '可信支付' in A['payment.start']['success'],'client cannot mark paid')
ck('未知先对账' in A['payment.start']['guard'],'unknown payment reconciliation')
ck('未决效果先核验' in A['refund.request']['guard'],'refund/side effects')
ck('UNKNOWN' in A['payout.request']['success'],'unknown payout handling')
ck('不自动获得源码' in A['script.read']['guard'],'purchase is not source license')
ck('data.diagnose' in A['ops.data_request']['guard'] and '1小时' in A['ops.data_request']['guard'],'bounded diagnostic capability')
ck('自提权' in A['ops.access']['guard'],'no self elevation')
ck('202' in A['run.stop']['success'] and 'STOPPING' in A['run.stop']['success'],'async stop')
texts={p.name:p.read_text(encoding='utf-8') for p in R.glob('*.md')}
product=texts['01-产品需求与功能设计.md'];api=texts['03-接口协议.md'];arch=texts['02-系统架构与详细设计.md'];tests=texts['05-测试验收与验证记录.md']
for r in roles:
 m=re.search(r'### 8\.\d+ '+re.escape(r['name'])+r'（'+r['id']+r'）\n(.*?)(?=### 8\.|\Z)',product,re.S)
 ck(bool(m),r['id']+': readable role table')
 if m:
  ck(re.findall(r'^\| ([A-Z]\d{2}) /',m[1],re.M)==r['pages'],r['id']+': table sequence')
  for pid in r['pages']:ck('`'+P[pid]['route']+'`' in m[1],pid+': route documentation')
for aid,a in A.items():
 ck(f'| `{aid}` / {a["label"]} |' in api,aid+': API documentation')
 for ep in a['endpoints']:ck('`'+ep+'`' in api,aid+': endpoint documentation')
for source in C['sources']:
 name,anchor=source.split('#');ck('<a id="'+anchor+'"></a>' in texts[name],source+': anchor')
for term in ['service_orders','booking_orders','service_releases','deployments','price_plans','quotes','payments','entitlements','usage_reservations','refunds','ledger_entries','settlement_batches','payouts','management_guard','data_access_sessions']:
 ck(term in arch,term+': entity missing')
for n in range(1,17):ck(f'| CMR-{n:02} |' in product,f'CMR-{n:02} requirement')
for n in range(1,25):ck(f'| RUI-{n:02} |' in tests,f'RUI-{n:02} acceptance')
for term in ['PER_USE','quantity=1','NOT_REQUIRED','最多1小时','UNKNOWN','晚到','冲正','首次有效领取']:
 ck(term in arch or term in api,term+': critical contract')
document_versions = {'03-接口协议.md': '版本V3.1', '08-脚本开发规范.md': '规范版本1.1'}
for name,s in texts.items():
 ck(document_versions.get(name, '版本：V3.0') in s,name+': document version')
 for bad in ['REVIEWER','OPS_ADMIN','共享审核','审核通过后','按策略审批','计费在本版无执行入口','当前无收费页面','平台内置的通用支付、代收资金、退款处理','无自动校验员','人工自动校验']:
  ck(bad not in s,name+': stale phrase '+bad)
ck('运行验收须' in tests and '尚未' in tests,'evidence limitation')
if issues:raise SystemExit('FAIL:\n'+'\n'.join(issues))
print(f'PASS: {checks} role, page, operation, commercial-boundary and document cross-checks.')
print('PASS: 4 workspaces; 66 page definitions; 102 guarded operations; 75 role-page deliverables; 16 commercial requirements; 24 acceptance scenarios.')
print('LIMIT: static design consistency only; no live payments, execution, authorization or image acceptance.')
