"""Complete paginated public APIs and produce a human-readable source inventory."""
import concurrent.futures as cf
import csv
import hashlib
import json
from pathlib import Path
import urllib.parse as up
from download import ROOT, fetch

def file_meta(path, **extra):
    b=path.read_bytes()
    return {'file':str(path.relative_to(ROOT.parent)),'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest(),**extra}

def complete(record):
    for f in record['files']:
        path=ROOT.parent/f['file']
        if 'total_rows' not in f: continue
        data=json.loads(path.read_text()); result=data['result']
        try:
            while len(result['records'])<result['total']:
                offset=len(result['records'])
                base=up.urlsplit(f['url']); params=dict(up.parse_qsl(base.query));params.update(offset=offset,limit=10000)
                url=up.urlunsplit(base._replace(query=up.urlencode(params)))
                page_path=path.with_name(path.stem+f'-page-{offset}.json')
                raw,meta=fetch(url,page_path,'json'); page=json.loads(raw)
                if not page.get('success') or not page['result']['records']: raise ValueError('API returned no records before reaching total')
                result['records'].extend(page['result']['records'])
                page_path.unlink() # Merged into the complete response below.
            path.write_text(json.dumps(data))
            f.update(file_meta(path,data_rows=len(result['records']),total_rows=result['total'],complete=len(result['records'])==result['total']))
            columns=[x['id'] for x in result['fields']]
            out=path.with_suffix('.csv')
            with out.open('w',newline='') as h:
                writer=csv.DictWriter(h,fieldnames=columns);writer.writeheader();writer.writerows(result['records'])
            record.setdefault('derived_files',[]).append(file_meta(out,data_rows=len(result['records']),derived_from=f['file']))
        except Exception as e:
            record['errors'].append({'file':f['file'],'error':str(e)})
    if record['name']=='MassDOT statewide crash data':
        folder=ROOT/'massdot-statewide-crash-data'
        service=json.loads((folder/'arcgis-metadata.json').read_text()).get('url')
        if service:
            try:
                def query(params,filename):
                    raw,meta=fetch(service+'/query?'+up.urlencode(params),folder/filename,'json')
                    d=json.loads(raw)
                    if d.get('error'): raise ValueError(str(d['error']))
                    record['files'].append(meta);return d,meta
                where="CITY_TOWN_NAME = 'BOSTON'"
                counts,_=query({'where':where,'returnCountOnly':'true','f':'json'},'boston-count.json')
                total=counts['count'];features=[];fields=[]
                while len(features)<total:
                    d,meta=query({'where':where,'outFields':'*','outSR':'4326','f':'json','resultOffset':len(features),'resultRecordCount':2000,'orderByFields':'OBJECTID'},f'boston-page-{len(features)}.json')
                    chunk=d.get('features',[])
                    if not chunk: raise ValueError('No records before reaching count')
                    features.extend(chunk);fields=d.get('fields',fields)
                    meta['data_rows']=len(chunk)
                out=folder/'boston-2024.csv';columns=[f['name'] for f in fields]
                with out.open('w',newline='') as h:
                    w=csv.DictWriter(h,fieldnames=columns);w.writeheader();w.writerows(x['attributes'] for x in features)
                record['files'].append(file_meta(out,url=service,data_rows=len(features),total_rows=total,complete=len(features)==total))
                record['scope']='Complete Boston subset of the official MassDOT 2024 crash layer, verified against returnCountOnly. Not the statewide archive.'
                record['status']='downloaded';record['data_files']=1+sum('data_rows' in f for f in record['files'][:-1])
            except Exception as e:record['errors'].append({'url':service,'error':str(e)})
    print('Verified',record['name'],flush=True)
    return record

def report(manifest):
    lines=['# Open datasets from the CollegeHack spreadsheet','',
        'Retrieved October 24, 2026. The source worksheet lists 33 sources; several are directories, dashboards, licensed services, or reference documents rather than downloadable datasets.','',
        '[Source worksheet](https://docs.google.com/spreadsheets/d/1RaA6ecNuExAW98tWhhlHTUMMjdj5xp6fN3RgJL7e9Qk/edit?gid=806827996). A snapshot including links is saved in `source-sheet.json`.','',
        'Existing validated datasets remain in `../source-audit` and `../nsse-public-search`; the manifest references them without making duplicate copies.','',
        'Large sources use explicit subsets: Bluebikes is one latest available month; OSM is the central BU campus area; MassDOT is Boston in 2024; OpenAlex is the pre-existing BU research sample. These are not complete global or historical archives.','',
        '| Source | Result | Data files | Coverage / limitation |','| --- | --- | ---: | --- |']
    for r in manifest['sources']:
        scope=r.get('scope','')
        if r['status'] in ['unavailable','reference_only','metadata_only_download_failed'] and r.get('errors'):
            scope+=' Request errors: '+ '; '.join(dict.fromkeys(e['error'] for e in r['errors'] if 'error' in e))
        lines.append(f"| [{r['name']}]({r['source_url']}) | {r['status']} | {r.get('data_files',0)} | {scope.replace('|','/').replace(chr(10),' ')} |")
    lines += ['', '## Local files and row counts','']
    for r in manifest['sources']:
        data=[f for f in r['files']+r.get('derived_files',[]) if 'data_rows' in f or 'features' in f or Path(f['file']).suffix in ['.zip','.osm','.sav'] or f.get('reused')]
        if not data: continue
        lines += ['### '+r['name'],'']
        for f in data:
            suffix=''
            if 'data_rows' in f:suffix=f" — {f['data_rows']:,} rows"
            elif 'features' in f:suffix=f" — {f['features']:,} features"
            if f.get('complete') is False: suffix+=' (PARTIAL)'
            lines.append(f"- [{f['file']}](../{f['file']}){suffix}")
        lines.append('')
    lines+=['## Verification and reproduction','',
        '`manifest.json` records URLs, byte sizes, SHA-256 hashes, row counts where available, scope and failed requests. ZIPs were checked for readable archives and CRC integrity; CSVs were parsed. Saved HTML and metadata are documentation and are not counted as observations. CKAN exports were paginated and checked against the API total. JSON files and their derived CSVs contain the same records; do not concatenate them.','',
        'Run from the project root:','',
        '```sh','python3 research/open-datasets/download.py','python3 research/open-datasets/supplement.py','python3 research/open-datasets/complete_exports.py','```','',
        'Network access is required. The Google Sheet snapshot and crash background document were retrieved through the connected Google Drive account; these snapshots are preserved locally. Data remains subject to the original source terms and attribution requirements. OSM requires attribution to OpenStreetMap contributors (ODbL). O*NET attribution and reuse details are included in its archive / source page.','']
    (ROOT/'README.md').write_text('\n'.join(lines))

if __name__=='__main__':
    manifest=json.loads((ROOT/'manifest.json').read_text())
    with cf.ThreadPoolExecutor(max_workers=4) as pool:manifest['sources']=list(pool.map(complete,manifest['sources']))
    (ROOT/'manifest.json').write_text(json.dumps(manifest,indent=2))
    report(manifest)
