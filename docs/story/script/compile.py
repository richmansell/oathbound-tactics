import re, json, sys, os
# Chapter 1 screenplay compiler. Usage: python3 docs/story/script/compile.py  (run from anywhere)
# Reads act*.txt beside this file, validates against characters/enemies/locations/maps,
# writes src/content/campaigns/main/chapter1/scenes/act*.ts and docs/story/chapters/chapter1_vo_script.md.
HERE=os.path.dirname(os.path.abspath(__file__))
ROOT=os.path.abspath(os.path.join(HERE,'..','..','..'))
MAIN=ROOT+'/src/content/campaigns/main'
chars=set(re.findall(r'^  (\w+): \{', open(MAIN+'/characters.ts').read(), re.M))
temps=set(re.findall(r'^  (\w+): t\(', open(MAIN+'/enemies.ts').read(), re.M))
locs=set(re.findall(r"^  (\w+): L\(", open(MAIN+'/locations.ts').read(), re.M))
def load_maps():
    src=open(MAIN+'/maps.ts').read()
    out={}
    for blk in re.split(r"\n  (?=map_\w+: \{)", src)[1:]:
        mid=re.match(r"(map_\w+)", blk).group(1)
        rows=re.findall(r"^      '([^']*)',$", blk, re.M)
        props=[{'at':[int(a),int(b)],'type':t} for a,b,t in re.findall(r"at: \[(\d+), (\d+)\], type: '(\w+)'", blk)]
        out[mid]={'rows':rows,'props':props}
    return out
maps=load_maps()
EXPR={'neutral','happy','angry','sad','surprised','determined','hurt','smirk'}
errs=[]; warns=[]
def err(m): errs.append(m)

def passable(mid,x,y):
    rows=maps[mid]['rows']
    if y<0 or y>=len(rows): return False
    toks=rows[y].split()
    if x<0 or x>=len(toks): return False
    t=toks[x]
    if t=='x' or t[0]=='W': return False
    if [x,y] in [p['at'] for p in maps[mid]['props']]: return False
    return True

def parse(fn):
    scenes=[]; cur=None; choice=None
    for ln,raw in enumerate(open(fn),1):
        line=raw.rstrip('\n')
        if not line.strip() or line.lstrip().startswith('#'): continue
        where=f'{fn}:{ln}'
        if line.startswith('== '):
            parts=[p.strip() for p in line[3:].split('|')]
            sid=parts[0]; title=parts[1]
            kv=dict(p.split('=',1) for p in parts[2:])
            m=re.match(r'c1\.s(\d\d)$',sid)
            if not m: err(f'{where} bad scene id {sid}')
            cur={'id':sid,'title':title,'location':kv['loc'],'steps':[],'_n':0,'_nn':m.group(1)}
            if 'map' in kv: cur['map']=kv['map']
            if 'music' in kv: cur['music']=kv['music']
            if kv['loc'] not in locs: err(f'{where} unknown location {kv["loc"]}')
            if 'map' in kv and kv['map'] not in maps: err(f'{where} unknown map')
            scenes.append(cur); choice=None; continue
        def vo():
            cur['_n']+=1
            return f"main.c1.s{cur['_nn']}.{cur['_n']:03d}"
        if line.startswith('@ '):
            acts={}
            for a in line[2:].split(';'):
                a=a.split()
                cid,x,y=a[0],int(a[1]),int(a[2]); d=a[3] if len(a)>3 else None
                if cid not in chars: err(f'{where} unknown actor char {cid}')
                if 'map' in cur and not passable(cur['map'],x,y): err(f'{where} actor {cid} on bad tile {x},{y}')
                acts[cid]={'character':cid,'at':[x,y]}
                if d: acts[cid]['dir']=d
            cur['actors']=acts; continue
        if line.startswith('- ') and choice is not None:
            m=re.match(r'- (.+?)\s*=>\s*(.*)$',line)
            opt={'text':m.group(1).strip().strip('"') if m.group(1).startswith('"') and m.group(1).endswith('"') else m.group(1).strip()}
            for kvp in m.group(2).split():
                k,v=kvp.split(':',1)
                opt['setFlag' if k=='flag' else 'goto']=v
            choice['options'].append(opt); continue
        choice=None
        if line.startswith('CHOICE '):
            m=re.match(r'CHOICE (\w+):\s*(.*)$',line)
            choice={'kind':'choice','id':vo(),'speaker':m.group(1),'prompt':m.group(2),'options':[]}
            cur['steps'].append(choice); continue
        if line.startswith('['):
            body=line.strip()[1:-1].split()
            a=body[0]
            st=None
            if a=='flag': st={'kind':'flag', body[1]:body[2]}
            elif a=='label': st={'kind':'label','name':body[1]}
            elif a=='goto':
                st={'kind':'goto','label':body[1]}
                if len(body)>2: st['ifFlag' if body[2]=='if' else 'ifNotFlag']=body[3]
            else:
                st={'kind':'stage','action':a}
                if a in ('walk','place'):
                    st['actor']=body[1]; st['to']=[int(body[2]),int(body[3])]
                    if len(body)>4: st['dir']=body[4]
                    if body[1] not in chars: err(f'{where} unknown actor {body[1]}')
                    if 'map' in cur and not passable(cur['map'],*st['to']): err(f'{where} {a} to bad tile {st["to"]}')
                    if 'map' not in cur: err(f'{where} stage {a} in map-less scene')
                elif a=='face': st['actor']=body[1]; st['dir']=body[2]
                elif a in ('exit',): st['actor']=body[1]
                elif a in ('anim','emote'): st['actor']=body[1]; st['value']=body[2]
                elif a=='camera': st['to']=[int(body[1]),int(body[2])]
                elif a in ('fade','flash','music','sfx','background'): st['value']=body[1]
                elif a=='wait': st['ms']=int(body[1])
                elif a=='shake': pass
                else: err(f'{where} unknown stage {a}')
                if a=='background' and body[1] not in locs: err(f'{where} unknown bg loc')
                if a in ('face','exit','anim','emote') and 'map' not in cur: err(f'{where} stage {a} in map-less scene')
            cur['steps'].append(st); continue
        m=re.match(r'^NARR:\s*(.*?)(?:\s*\|\|\s*(.*))?$',line)
        if m:
            st={'kind':'narration','id':vo(),'text':m.group(1)}
            if m.group(2): st['direction']=m.group(2)
            cur['steps'].append(st)
            if len(st['text'])>180: err(f'{where} narration too long {len(st["text"])}')
            continue
        m=re.match(r'^(\w+)(?:\{([^}]*)\})?\.(\w+)([!~^<>]*):\s*(.*?)(?:\s*\|\|\s*(.*))?$',line)
        if m:
            spk,name,ex,mods,text,dirn=m.groups()
            if spk not in chars and spk not in temps: err(f'{where} unknown speaker {spk}')
            if ex not in EXPR: err(f'{where} bad expression {ex}')
            st={'kind':'line','id':vo(),'speaker':spk}
            if name: st['name']=name
            st['expression']=ex
            if '<' in mods: st['side']='left'
            if '>' in mods: st['side']='right'
            st['text']=text
            if dirn: st['direction']=dirn
            if '!' in mods: st['style']='shout'
            elif '~' in mods: st['style']='whisper'
            elif '^' in mods: st['style']='thought'
            if len(text)>180: err(f'{where} line too long {len(text)}: {text[:40]}')
            if not text: err(f'{where} empty text')
            cur['steps'].append(st); continue
        err(f'{where} unparsed: {line}')
    for s in scenes:
        labels={x['name'] for x in s['steps'] if x['kind']=='label'}
        for x in s['steps']:
            if x['kind']=='goto' and x['label'] not in labels: err(f"{s['id']} goto missing label {x['label']}")
            if x['kind']=='choice':
                for o in x['options']:
                    if 'goto' in o and o['goto'] not in labels: err(f"{s['id']} choice goto missing {o['goto']}")
    return scenes

def ts_obj(o, ind=0):
    return json.dumps(o, ensure_ascii=False)

def emit(scenes, name, header):
    out=[f"/**\n * {header}\n * Chapter 1 scenes — FULL DIALOGUE. VO ids are permanent (never renumber; append or suffix).\n * GENERATED from docs/story/script/act*.txt by docs/story/script/compile.py. Edit the .txt and recompile;\n * if you hot-fix this file directly, port the change back to the .txt first or it will be overwritten.\n * Speakers/actors are character ids (characters.ts) or enemy template ids (enemies.ts).\n */",
         "import type { SceneDef } from '../../../../schema';","",f"export const {name}: Record<string, SceneDef> = {{"]
    for s in scenes:
        out.append(f"  '{s['id']}': {{")
        out.append(f"    id: '{s['id']}',")
        out.append(f"    title: {json.dumps(s['title'],ensure_ascii=False)},")
        out.append(f"    location: '{s['location']}',")
        if 'map' in s: out.append(f"    map: '{s['map']}',")
        if 'music' in s: out.append(f"    music: '{s['music']}',")
        if 'actors' in s:
            out.append("    actors: {")
            for k,v in s['actors'].items():
                d=f", dir: '{v['dir']}'" if 'dir' in v else ''
                out.append(f"      {k}: {{ character: '{v['character']}', at: [{v['at'][0]}, {v['at'][1]}]{d} }},")
            out.append("    },")
        out.append("    steps: [")
        for st in s['steps']:
            out.append("      "+ts_obj(st)+",")
        out.append("    ],")
        out.append("  },")
    out.append("};\n")
    return '\n'.join(out)

all_scenes=[]
os.makedirs(MAIN+'/chapter1/scenes',exist_ok=True)
for fn,name,hdr in [('act1.txt','scenesAct1','Prologue + Act I — The Lantern Road (s01–s11, B1–B3 triggers).'),
                    ('act2.txt','scenesAct2','The Turn + Act II — The Greyfen (s12–s18, B4–B6 triggers).'),
                    ('act3.txt','scenesAct3','Act III — The Split Penny (s19–s24, B7 triggers, skirmish intros).')]:
    sc=parse(os.path.join(HERE,fn)); all_scenes+=sc
    open(MAIN+f'/chapter1/scenes/{fn[:-4]}.ts','w').write(emit(sc,name,hdr))
ids=[s['id'] for s in all_scenes]
assert len(ids)==len(set(ids)), 'dup scene'
nlines=sum(1 for s in all_scenes for x in s['steps'] if x['kind'] in ('line','narration'))
print('scenes',len(all_scenes),'lines',nlines)
for e in errs: print('ERR',e)
if errs: sys.exit(1)

# VO script export
md=['# Chapter 1 — Voice Script (generated)','',
    '> Generated by `docs/story/script/compile.py` from `docs/story/script/act*.txt` (which also generates the scene TS). Do not edit by hand.',
    '> Columns: VO id · speaker · style · line · direction. Casting/voice notes: BIBLE.md §7 and characters.ts `voice`.','']
cn={}
for c in re.findall(r"^  (\w+): \{\n    id: '\w+',\n    name: '([^']*(?:\\'[^']*)*)'", open(MAIN+'/characters.ts').read(), re.M): cn[c[0]]=c[1].replace("\\'","'")
counts={}
for s in all_scenes:
    md.append(f"## {s['id']} — {s['title']}  ")
    md.append(f"*Location:* `{s['location']}`" + (f" · *Map:* `{s['map']}`" if 'map' in s else '') + (f" · *Music:* `{s['music']}`" if 'music' in s else ''))
    md.append('')
    md.append('| VO id | Speaker | Line | Direction |'); md.append('|---|---|---|---|')
    for x in s['steps']:
        if x['kind']=='line':
            nm=x.get('name') or cn.get(x['speaker'],x['speaker'])
            counts[x['speaker']]=counts.get(x['speaker'],0)+1
            sty=f" *({x['style']})*" if x.get('style') else ''
            md.append(f"| `{x['id']}` | **{nm}** ({x['expression']}){sty} | {x['text'].replace('|','/')} | {x.get('direction','').replace('|','/')} |")
        elif x['kind']=='narration':
            counts['NARRATOR']=counts.get('NARRATOR',0)+1
            md.append(f"| `{x['id']}` | *Narrator* | {x['text']} | {x.get('direction','')} |")
        elif x['kind']=='choice':
            md.append(f"| `{x['id']}` | *Choice ({x['speaker']})* | {x['prompt']} — " + ' / '.join(o['text'] for o in x['options'])+" | (not voiced) |")
    md.append('')
md.insert(5,'## Line counts by speaker\n\n'+'\n'.join(f'- {k}: {v}' for k,v in sorted(counts.items(),key=lambda kv:-kv[1]))+'\n')
open(ROOT+'/docs/story/chapters/chapter1_vo_script.md','w').write('\n'.join(md))
