/* Review changes stay in this browser until the user downloads the project. */
(function(global){
'use strict';
const copy=x=>JSON.parse(JSON.stringify(x));
const fields=['topic','scenario','request','need','unknown'];
const labels={topic:'需求组名称',scenario:'共同场景',request:'用户提出的方案（保留差异）',need:'底层需求推断',unknown:'待核实问题'};
const allowed=['直接相关','间接相关','不相关'];
const planLabels={participants:'访谈对象与招募条件',questions:'访谈问题',task:'观察任务',measures:'需要记录的信息',criteria:'如何判断假设得到支持或需要调整'};
const planFields=Object.keys(planLabels);
function assert(ok,message){if(!ok)throw Error(message);}
function makeProject(report,records,question){
  return {format:'feedback-review-v1',question,records:copy(records),original:copy(report),
    current:{screening:copy(report.screening),groups:report.needs.map((g,i)=>({...copy(g),id:'G'+(i+1),reviewed:false})),screening_reviewed:false},
    history:[],next_group:report.needs.length+1};
}
function counts(p){const ids=p.current.screening.filter(d=>d.relevance!=='不相关').map(d=>d.feedback_id);const used=new Set(p.current.groups.flatMap(g=>g.evidence.map(e=>e.feedback_id)));return {included:ids.length,groups:p.current.groups.length,unassigned:ids.filter(id=>!used.has(id))};}
function check(p){
  assert(p&&p.format==='feedback-review-v1','请选择本工具下载的审核项目。');
  assert(Array.isArray(p.records)&&p.records.length>0&&p.records.length<=100,'反馈数量不符合要求。');
  const index=new Map(p.records.map(r=>[r.feedback_id,r]));
  assert(index.size===p.records.length,'反馈编号重复。');
  for(const r of p.records)for(const f of ['feedback_id','title','content','source_url'])assert(typeof r[f]==='string'&&r[f].trim(),'原文必填字段缺失。');
  assert(p.original&&typeof p.original.confirmed_scope==='string','原始分析范围缺失。');
  assert(p.current&&Array.isArray(p.current.screening)&&Array.isArray(p.current.groups),'审核内容缺失。');
  const ds=p.current.screening;
  assert(ds.length===index.size&&new Set(ds.map(d=>d.feedback_id)).size===index.size,'分类必须覆盖全部反馈且不能重复。');
  for(const d of ds){
    assert(index.has(d.feedback_id)&&allowed.includes(d.relevance),'分类或编号无效。');
    assert(typeof d.reason==='string'&&d.reason.trim(),'请填写分类理由。');
    for(const k of ['boundary_quote','support_quote'])assert(typeof d[k]==='string','纳入依据格式错误。');
    if(d.relevance!=='不相关'){
      assert(d.boundary_quote.trim()&&p.original.confirmed_scope.includes(d.boundary_quote),'对应条件必须摘自本次已确认范围。');
      assert(d.support_quote.trim()&&index.get(d.feedback_id).content.includes(d.support_quote),'纳入依据必须是该反馈正文中的连续原文。');
    }else assert(!d.boundary_quote&&!d.support_quote,'不相关反馈应清空纳入依据。');
  }
  assert(p.current.groups.length<=200&&new Set(p.current.groups.map(g=>g.id)).size===p.current.groups.length,'分组重复或过多。');
  const included=new Set(ds.filter(d=>d.relevance!=='不相关').map(d=>d.feedback_id));
  for(const g of p.current.groups){
    assert(typeof g.id==='string'&&g.id,'分组编号缺失。');
    for(const f of fields)assert(typeof g[f]==='string','分组内容格式错误。');
    assert(Array.isArray(g.evidence)&&g.evidence.length>0,'每个需求组至少需要一条原文证据。');
    for(const e of g.evidence){
      assert(included.has(e.feedback_id),'不相关反馈不能出现在需求组中。');
      assert(typeof e.quote==='string'&&e.quote.trim()&&index.get(e.feedback_id).content.includes(e.quote),'分组引文必须是对应正文中的连续原文。');
      e.source_url=index.get(e.feedback_id).source_url;
    }
    g.feedback_count=new Set(g.evidence.map(e=>e.feedback_id)).size;
    if(g.validation!==undefined){
      assert(g.validation&&typeof g.validation.source_stamp==='string','验证计划来源记录缺失。');
      for(const f of planFields)assert(typeof g.validation[f]==='string','验证计划字段格式错误。');
    }
  }
  assert(Array.isArray(p.history)&&Number.isInteger(p.next_group)&&p.next_group>0,'修改记录格式错误。');
  return p;
}
function ready(p){return counts(p).unassigned.length===0&&p.current.screening_reviewed===true&&p.current.groups.every(g=>g.reviewed===true&&fields.every(f=>g[f].trim()));}
function change(p,action,mutate){const next=copy(p),before=copy(p.current);mutate(next);check(next);next.history.push({at:new Date().toISOString(),action,before,after:copy(next.current)});return next;}
function saveDecision(p,id,values){return change(p,'修改分类 '+id,n=>{
  const d=n.current.screening.find(d=>d.feedback_id===id);assert(d,'编号不存在。');
  Object.assign(d,values);if(d.relevance==='不相关'){d.boundary_quote='';d.support_quote='';}
  n.current.screening_reviewed=false;
  for(const g of n.current.groups)if(g.evidence.some(e=>e.feedback_id===id)){g.reviewed=false;if(d.relevance==='不相关')g.evidence=g.evidence.filter(e=>e.feedback_id!==id);}
  n.current.groups=n.current.groups.filter(g=>g.evidence.length);
});}
function saveGroup(p,id,values){return change(p,id?'修改需求组 '+id:'新增需求组',n=>{
  const g=id?n.current.groups.find(g=>g.id===id):{id:'G'+n.next_group++};assert(g,'分组不存在。');
  for(const f of fields)g[f]=values[f];g.evidence=copy(values.evidence);g.reviewed=false;
  if(!id)n.current.groups.push(g);
});}
function move(p,source,target,id){return change(p,'移动反馈 '+id+'：'+source+' → '+target,n=>{
  assert(source!==target,'请选择其他需求组。');
  const a=n.current.groups.find(g=>g.id===source),b=n.current.groups.find(g=>g.id===target);assert(a&&b,'目标组不存在。');
  const evidence=a.evidence.filter(e=>e.feedback_id===id);assert(evidence.length,'该组没有这条反馈。');
  for(const e of evidence)if(!b.evidence.some(x=>x.feedback_id===id&&x.quote===e.quote))b.evidence.push(e);
  a.evidence=a.evidence.filter(e=>e.feedback_id!==id);a.reviewed=b.reviewed=false;
  n.current.groups=n.current.groups.filter(g=>g.evidence.length);
});}
function merge(p,source,target){return change(p,'合并需求组 '+source+' → '+target,n=>{
  assert(source!==target,'请选择其他需求组。');
  const a=n.current.groups.find(g=>g.id===source),b=n.current.groups.find(g=>g.id===target);assert(a&&b,'目标组不存在。');
  for(const e of a.evidence)if(!b.evidence.some(x=>x.feedback_id===e.feedback_id&&x.quote===e.quote))b.evidence.push(e);
  for(const f of fields.filter(f=>f!=='topic'))if(a[f]!==b[f])b[f]+='\n\n【合入 '+a.id+'，请整理】\n'+a[f];
  b.reviewed=false;n.current.groups=n.current.groups.filter(g=>g.id!==source);
});}
function confirmGroup(p,id){return change(p,'确认需求组 '+id,n=>{const g=n.current.groups.find(g=>g.id===id);assert(g&&fields.every(f=>g[f].trim()),'请先补齐分组内容；删除的推断可保持草稿，但不能直接确认为完整。');assert(!fields.some(f=>g[f].includes('【合入 ')),'请先编辑整理合入的内容，再确认。');g.reviewed=true;});}
function planStamp(p,g){
  const ids=new Set(g.evidence.map(e=>e.feedback_id));
  return JSON.stringify({scope:p.original.confirmed_scope,content:fields.map(f=>g[f]),evidence:g.evidence.map(e=>[e.feedback_id,e.quote]),screening:p.current.screening.filter(d=>ids.has(d.feedback_id))});
}
function defaultPlan(g){return {
  participants:'招募实际经历过“'+(g.scenario||'本组使用场景')+'”的人；先确认最近一次经历。招募渠道和人数由研究者在执行前确定。',
  questions:'1. 请回忆最近一次相关经历，当时想完成什么？\n2. 你实际如何完成？在哪一步遇到困难，用过什么替代办法？\n3. 这种困难多久发生一次，带来了什么具体影响？\n本组还需核实：'+(g.unknown||'请补充尚未确认的信息。'),
  task:'请参与者用自己的资料演示一次“'+(g.scenario||'相关任务')+'”。先观察现有做法，不提示采用所建议的功能；涉及隐私时使用脱敏资料。',
  measures:'记录任务目标、操作路径、耗时、卡点、替代办法和参与者原话；将观察事实与研究者解释分开。',
  criteria:'支持：实际演示中出现与本组推断一致的困难，且有具体影响。调整或反驳：原有方式已能顺利完成，或主要困难与推断不同。仅表示喜欢某功能不能作为充分支持；量化阈值需在执行前另行约定。'};}
function planState(p,g){return !g.validation?'建议草稿，尚未保存':g.validation.source_stamp!==planStamp(p,g)?'依据已变化，计划待更新':'计划已保存，尚未执行';}
function savePlan(p,id,values){return change(p,'保存验证计划 '+id,n=>{const g=n.current.groups.find(g=>g.id===id);assert(g,'需求组不存在。');const plan={};for(const f of planFields){assert(typeof values[f]==='string'&&values[f].trim(),'请补齐所有验证计划字段。');plan[f]=values[f];}plan.source_stamp=planStamp(n,g);g.validation=plan;});}
function reportReady(p){return ready(p)&&p.current.groups.every(g=>g.validation&&g.validation.source_stamp===planStamp(p,g));}
function md(value){return String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/([\\`*_{}\[\]()#+.!|~-])/g,'\\$1');}
function markdown(p){
  p=check(copy(p));const c=counts(p),lines=['# 用户需求分析与验证计划','',
    '**材料状态：'+(reportReady(p)?'分析已人工审核，验证计划已保存':'草稿，仍有审核或计划待完成')+'**','',
    '需求验证状态：尚未执行。人工审核不代表需求已被用户研究证实，也不代表开发优先级。','',
    '分析问题：'+md(p.question||'未记录'),'','分析范围：'+md(p.original.confirmed_scope),'',
    `输入 ${p.records.length} 条，纳入 ${c.included} 条（按编号去重），需求组 ${c.groups} 个。各组可引用相同反馈，组内条数不可相加作为独立人数。`,''];
  if(c.unassigned.length)lines.push('尚未归组：'+c.unassigned.map(md).join('、'),'');
  if(!p.current.groups.length)lines.push('## 暂无需求验证卡片','','当前没有需求组，不生成虚构需求或验证任务。','');
  for(const g of p.current.groups){
    lines.push('## '+md(g.id+' '+(g.topic||'未命名需求')),'',
      '分析审核：'+(g.reviewed&&p.current.screening_reviewed?'已人工确认':'待审核')+'；'+planState(p,g)+'。','',
      '### 问题、场景与假设','',
      '**使用场景：** '+md(g.scenario),'','**待验证的需求推断：** '+md(g.need),'',
      '**用户提出的方案：** '+md(g.request),'','**尚不清楚：** '+md(g.unknown),'',
      '### 原文证据','');
    for(const e of g.evidence){const r=p.records.find(r=>r.feedback_id===e.feedback_id);lines.push('**'+md(e.feedback_id+' · '+r.title)+'**','',...e.quote.split('\n').map(l=>'> '+md(l)),'');
      if(/^https?:\/\//.test(r.source_url))lines.push('[查看来源](<'+r.source_url.replace(/[<>\s\\]/g,c=>encodeURIComponent(c))+'>)','');
    }
    lines.push('### 下一步验证','',g.validation?'以下为人工保存的验证计划；未记录实际执行结果。':'以下为规则生成的起草建议，尚未人工保存，不是原文事实。','');
    if(g.validation&&g.validation.source_stamp!==planStamp(p,g))lines.push('**注意：需求内容、证据或分类已变化。以下旧计划需要重新检查并保存。**','');
    const plan=g.validation||defaultPlan(g);for(const f of planFields)lines.push('**'+planLabels[f]+'**','',md(plan[f]),'');
  }
  lines.push('## 筛选清单','');for(const d of p.current.screening)lines.push('- '+md(d.feedback_id+' · '+d.relevance+'：'+d.reason));
  lines.push('','## 数据限制与记录','',md(p.original.limitations||'未提供额外限制。'),'','不以栏目排名推断业务优先级，不以缺失或采集时间推断趋势。','',`人工操作记录 ${p.history.length} 条；完整前后内容见审核项目 JSON。`,'');
  for(const h of p.history)lines.push('- '+md(h.at+' '+h.action));
  return lines.join('\n')+'\n';
}
const api={makeProject,check,counts,ready,saveDecision,saveGroup,move,merge,confirmGroup,change,defaultPlan,planState,savePlan,reportReady,markdown};
if(typeof module!=='undefined')module.exports=api;
global.ReviewCore=api;
if(typeof document==='undefined')return;
let project=null,dirty=false;const pending=new Set();
const host=document.querySelector('#review');
function el(tag,text,parent=host){const e=document.createElement(tag);e.textContent=text;parent.append(e);return e;}
function button(text,parent,fn){const b=el('button',text,parent);b.type='button';b.onclick=()=>{try{fn();}catch(e){alert(e.message);}};return b;}
function input(label,value,parent,rows=3){const l=el('label',label,parent);l.style.display='block';const t=el('textarea','',l);t.value=value;t.rows=rows;t.style.width='96%';t.addEventListener('input',()=>{dirty=true;pending.add(t);});return t;}
function select(options,value,parent){const s=el('select','',parent);for(const [v,t] of options){const o=el('option',t,s);o.value=v;}s.value=value;return s;}
function commit(next,owner){if([...pending].some(e=>!owner?.contains(e))&&!confirm('其他编辑区还有未保存输入。继续将放弃这些输入，是否继续？'))return;project=next;dirty=true;render();}
function download(){
  assert(!pending.size,'请先点击编辑区的保存按钮，再下载审核项目。');check(project);const data={...project,review_status:ready(project)?'人工已确认':'草稿，待审核'};
  const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
  const a=el('a','');a.href=url;a.download='feedback_review_'+Date.now()+'.json';a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);dirty=false;
}
function downloadMarkdown(){
  assert(!pending.size,'请先保存编辑区内容，再导出报告。');
  const url=URL.createObjectURL(new Blob([markdown(project)],{type:'text/markdown;charset=utf-8'}));
  const a=el('a','');a.href=url;a.download='feedback_report_'+Date.now()+'.md';a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function sources(id,parent){const r=project.records.find(r=>r.feedback_id===id);const d=el('details','',parent);el('summary',id+' · '+r.title,d);const p=el('p',r.content,d);p.style.whiteSpace='pre-wrap';if(/^https?:\/\//.test(r.source_url)){const a=el('a','查看来源',d);a.href=r.source_url;a.target='_blank';a.rel='noopener noreferrer';}}
function groupEditor(g,parent){
  const form=el('details','',parent);el('summary',g?'编辑内容与组内证据':'新建需求组 / 拆分现有组',form);
  const inputs={};for(const f of fields)inputs[f]=input(labels[f],g?g[f]:'',form);
  el('p','勾选此组包含的反馈，填写连续原文。一条反馈可以支持多个不同需求；拆分时请同时调整原组。',form);
  const entries=[];
  for(const d of project.current.screening.filter(d=>d.relevance!=='不相关')){
    const box=el('div','',form),label=el('label',d.feedback_id,box),c=el('input','',label);c.type='checkbox';
    const prior=g?g.evidence.filter(e=>e.feedback_id===d.feedback_id):[];c.checked=prior.length>0;c.onchange=()=>{dirty=true;pending.add(c);};
    // Each quote retains its own field so multiple continuous excerpts stay independent.
    const quotes=(prior.length?prior:[{quote:d.support_quote}]).map(e=>input('原文证据',e.quote,box,2));
    sources(d.feedback_id,box);entries.push({id:d.feedback_id,c,quotes});
  }
  button('保存分组草稿',form,()=>{const values={};for(const f of fields)values[f]=inputs[f].value;values.evidence=entries.filter(x=>x.c.checked).flatMap(x=>x.quotes.map(q=>({feedback_id:x.id,quote:q.value})));commit(saveGroup(project,g?.id,values),form);});
}
function render(){
  pending.clear();host.hidden=false;host.replaceChildren();el('h2','第三步：归并与人工审核');
  el('p','以下是可编辑工作稿，模型原始报告保持不变。修改不调用模型；合并或移动后，文字不会自动改写，必须重新审核。');
  el('p','本项目问题：'+(project.question||'未记录'));
  const original=el('details','');el('summary','查看模型原始分析（只读）',original);
  for(const d of project.original.screening||[])el('p',d.feedback_id+' · '+d.relevance+'：'+d.reason,original);
  for(const g of project.original.needs||[]){el('h4',g.topic,original);for(const f of fields.filter(f=>f!=='topic'))el('p',labels[f]+'：'+g[f],original);for(const e of g.evidence||[])el('blockquote',e.feedback_id+'：'+e.quote,original);}
  el('p','刷新会丢失未下载的工作。先保存各处编辑，再下载审核项目；文件含原始报告、反馈正文和修改记录，可重新打开。');
  const c=counts(project);el('p',`相关反馈 ${c.included} 条（去重），需求组 ${c.groups} 个；${ready(project)?'人工已确认':'待审核'}。`);
  if(c.unassigned.length)el('p','尚未归组：'+c.unassigned.join('、')).className='error';
  button('下载审核项目',host,download);
  const screening=el('details','');el('summary','审核分类与纳入依据',screening);
  el('p','本次范围：'+project.original.confirmed_scope,screening);
  for(const d of project.current.screening){
    const item=el('details','',screening);el('summary',d.feedback_id+' · '+d.relevance,item);sources(d.feedback_id,item);
    const s=select(allowed.map(x=>[x,x]),d.relevance,item);s.onchange=()=>{dirty=true;pending.add(s);};
    const reason=input('分类理由',d.reason,item),boundary=input('对应范围条件（从已确认范围摘取）',d.boundary_quote,item,2),quote=input('支持纳入的原文',d.support_quote,item,2);
    button('保存分类',item,()=>commit(saveDecision(project,d.feedback_id,{relevance:s.value,reason:reason.value,boundary_quote:boundary.value,support_quote:quote.value}),item));
  }
  button(project.current.screening_reviewed?'分类已确认':'确认全部分类',screening,()=>commit(change(project,'确认分类',n=>n.current.screening_reviewed=true)));
  for(const g of project.current.groups){
    const card=el('section','');card.style.cssText='border:1px solid #ccd3df;border-radius:10px;padding:18px;margin:18px 0';
    el('h3',`${g.id} ${g.topic||'未命名'} · ${g.feedback_count} 条反馈 · ${g.reviewed?'已确认':'待审核'}`,card);
    for(const f of fields.filter(f=>f!=='topic')){const p=el('p',labels[f]+'：'+g[f],card);p.style.whiteSpace='pre-wrap';}
    for(const id of new Set(g.evidence.map(e=>e.feedback_id))){
      sources(id,card);g.evidence.filter(e=>e.feedback_id===id).forEach(e=>el('blockquote',e.quote,card));
      const targets=project.current.groups.filter(x=>x.id!==g.id);
      if(targets.length){const s=select(targets.map(x=>[x.id,x.id+' '+x.topic]),targets[0].id,card);button('移动 '+id+' 到所选组',card,()=>commit(move(project,g.id,s.value,id)));}
    }
    groupEditor(g,card);button('确认此组内容与证据',card,()=>commit(confirmGroup(project,g.id)));
    const targets=project.current.groups.filter(x=>x.id!==g.id);
    if(targets.length){const s=select(targets.map(x=>[x.id,x.id+' '+x.topic]),targets[0].id,card);button('将本组合入所选组',card,()=>commit(merge(project,g.id,s.value)));}
    button('删除此组（反馈保留）',card,()=>commit(change(project,'删除需求组 '+g.id,n=>n.current.groups=n.current.groups.filter(x=>x.id!==g.id))));
  }
  groupEditor(null,host);
  el('h2','第四步：需求验证卡片与导出');
  el('p','卡片复用当前审核内容。下方验证计划由固定规则起草，不调用模型；请按实际情况编辑。人工审核通过不等于需求已被验证。');
  el('p',reportReady(project)?'分析已审核、计划已保存，可导出评审材料；用户研究尚未执行。':'可以导出草稿；尚未审核、未保存计划或依据变化的项目会在报告中标明。');
  if(!project.current.groups.length)el('p','当前没有需求组，不生成验证卡片。');
  for(const g of project.current.groups){
    const card=el('section','');card.style.cssText='border:1px solid #ccd3df;border-radius:10px;padding:18px;margin:18px 0';
    el('h3',g.id+' '+(g.topic||'未命名需求')+' · 验证卡片',card);
    el('p','分析：'+(g.reviewed&&project.current.screening_reviewed?'已人工确认':'待审核')+'；'+planState(project,g),card);
    el('p','场景：'+g.scenario,card);el('p','待验证假设：'+g.need,card);el('p','用户提出的方案：'+g.request,card);el('p','尚不清楚：'+g.unknown,card);
    const evidence=el('details','',card);el('summary','关联证据（'+g.feedback_count+' 条反馈）',evidence);
    for(const id of new Set(g.evidence.map(e=>e.feedback_id))){sources(id,evidence);for(const e of g.evidence.filter(e=>e.feedback_id===id))el('blockquote',e.quote,evidence);}
    const form=el('details','',card);el('summary','编辑下一步验证计划',form);
    const inputs={},plan=g.validation||defaultPlan(g);for(const f of planFields)inputs[f]=input(planLabels[f],plan[f],form,4);
    button('保存验证计划',form,()=>commit(savePlan(project,g.id,Object.fromEntries(planFields.map(f=>[f,inputs[f].value]))),form));
  }
  button('导出 Markdown 评审报告',host,downloadMarkdown);
  el('p','报告用于阅读和讨论；要继续编辑，请同时下载审核项目 JSON。导出报告不会替代项目保存。');
  const history=el('details','');el('summary','修改记录（'+project.history.length+'）',history);
  for(const entry of project.history){const d=el('details','',history);el('summary',entry.at+' '+entry.action,d);const pre=el('pre',JSON.stringify({before:entry.before,after:entry.after},null,2),d);pre.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere';}
}
global.ReviewUI={start(report,records,question){if(project&&dirty&&!confirm('已有未下载的审核工作。是否用新分析替换？'))return;project=check(makeProject(report,records,question));dirty=true;render();}};
document.querySelector('#restore-review').onchange=async event=>{
  try{const file=event.target.files[0];if(!file)return;assert(file.size<=10*1024*1024,'审核文件不能超过 10 MB。');const next=check(JSON.parse(await file.text()));if(project&&dirty&&!confirm('已有未下载的审核工作。是否打开其他项目？'))return;project=next;dirty=false;render();}
  catch(e){alert('无法打开审核项目：'+e.message);}finally{event.target.value='';}
};
window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
})(typeof window==='undefined'?globalThis:window);
