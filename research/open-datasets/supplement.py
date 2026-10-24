"""Follow official download links and service metadata discovered in the first pass."""
import concurrent.futures as cf
import json
import re
import urllib.parse as up
import xml.etree.ElementTree as ET
from pathlib import Path
from download import ROOT, fetch

def run(record):
    name=record['name']
    folder=ROOT/re.sub('[^a-z0-9]+','-',name.lower()).strip('-')
    def get(url,file,kind=None):
        try:
            data,meta=fetch(url,folder/file,kind)
            record['files'].append(meta)
            return data
        except Exception as e:
            record['errors'].append({'url':url,'error':str(e)})
    links_path=folder/'links.json'
    links=json.loads(links_path.read_text()) if links_path.exists() else []
    if name=='O*NET database':
        urls=[u for u in links if re.search(r'/db_\d+_\d+_(?:excel|text|csv)\.zip',u)]
        if urls: get(urls[0],up.urlparse(urls[0]).path.split('/')[-1],'zip')
        record['scope']='Full current O*NET database in the Excel ZIP linked from its official download page.'
    elif name=='Bluebikes system data':
        raw=get('https://s3.amazonaws.com/hubway-data?list-type=2','bucket.xml')
        if raw:
            keys=[e.text for e in ET.fromstring(raw).findall('.//{*}Key') if re.match(r'2026\d{2}-bluebikes-tripdata.*\.zip$',e.text or '')]
            if keys:
                key=sorted(keys)[-1]; get('https://s3.amazonaws.com/hubway-data/'+key,key,'zip')
        for url in links:
            if '.csv' in url: get(url,'station-list.csv','csv')
        record['scope']='Latest monthly trip ZIP present in the official bucket listing at retrieval, plus the linked station CSV. Not the complete history.'
    elif name=='Boston MPO bike/ped counts':
        base=record['source_url']
        for file in ['js/common.js','js/main.js']:
            raw=get(up.urljoin(base,file),Path(file).name)
            if raw:
                for rel in set(re.findall(r'[\w./-]+\.(?:csv|geojson)',raw.decode())):
                    get(up.urljoin(base,rel),Path(rel).name,'json' if rel.endswith('geojson') else 'csv')
    elif name=='Boston bicycle count dashboard':
        raw=get('https://www.arcgis.com/sharing/rest/content/items/35b5008743be439096ceebd61cf1bc17/data?f=json','webmap.json','json')
        if raw:
            def walk(o):
                if isinstance(o,dict):
                    for k,v in o.items():
                        if k=='url' and isinstance(v,str) and re.search(r'(FeatureServer|MapServer)/\d+$',v): yield v
                        yield from walk(v)
                elif isinstance(o,list):
                    for v in o: yield from walk(v)
            for i,url in enumerate(set(walk(json.loads(raw)))):
                # A bounded feature export with explicit transfer-limit verification.
                data=get(url+'/query?'+up.urlencode({'where':'1=1','outFields':'*','f':'geojson','outSR':'4326','resultRecordCount':10000}),f'layer-{i}.geojson','json')
                if data:
                    d=json.loads(data)
                    limited=bool(d.get('exceededTransferLimit') or d.get('properties',{}).get('exceededTransferLimit'))
                    record['files'][-1]['complete']=not limited and not bool(d.get('error'))
                    if d.get('error') or limited:
                        record['errors'].append({'url':url,'error':'Export is limited or returned an API error; inspect layer response.'})
        record['scope']='Bounded feature-layer snapshots from the dashboard webmap: three layers are partial API-limited samples (1,000 / 1,000 / 2,000 features), one layer has 145 features. See per-file complete flags.'
    elif name in ['Boston Numina multimodal sensors','Boston Vision Zero crash records']:
        meta=json.loads((folder/'metadata.json').read_text())
        for r in meta.get('result',{}).get('resources',[]):
            if r.get('datastore_active') and r.get('format','').lower()=='csv':
                get('https://data.boston.gov/api/3/action/datastore_search?'+up.urlencode({'resource_id':r['id'],'limit':100000}),r['id']+'.json','json')
        record['scope']='CKAN metadata and any publicly exposed datastore records; original CSV download errors are retained.'
    elif name=='Massachusetts crash data background':
        file=folder/'document.txt'
        import hashlib
        if file.exists():
            b=file.read_bytes();record['files'].append({'file':str(file.relative_to(ROOT.parent)),'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest(),'kind':'reference_document','url':record['source_url']})
    elif name=='MassDOT statewide crash data':
        raw=get('https://www.arcgis.com/sharing/rest/content/items/b42f2c990f784716b320ae0499886591?f=json','arcgis-metadata.json','json')
        if raw:
            url=json.loads(raw).get('url')
            if url:
                url=url.rstrip('/')+'/0' if not re.search(r'/\d+$',url) else url
                query=up.urlencode({'where':"CITY_TOWN_NAME = 'BOSTON'",'outFields':'*','f':'json','resultRecordCount':2000})
                # Do not save an unverified query as a complete dataset.
                get(url+'?f=json','layer-metadata.json','json')
        record['scope']='Official ArcGIS metadata discovered through the linked crash-data background; no statewide bulk export established.'
    # Metadata and error JSON never count as downloaded observations.
    actual=[]
    for f in record['files']:
        p=ROOT.parent/f['file']
        is_data=p.suffix in ['.csv','.zip','.osm','.geojson'] or f.get('reused')
        if p.suffix in ['.json','.geojson'] and not f.get('reused'):
            try:
                d=json.loads(p.read_text())
                if isinstance(d,dict) and (d.get('error') or d.get('success') is False):
                    f['kind']='api_error'; is_data=False
                elif p.suffix=='.geojson':
                    is_data=bool(d.get('features')); f['features']=len(d.get('features',[]))
                elif isinstance(d,dict) and 'result' in d and 'records' in d['result']:
                    f['data_rows']=len(d['result']['records']); f['total_rows']=d['result'].get('total')
                    f['complete']=f['data_rows']==f['total_rows'];is_data=bool(f['data_rows'])
                else: is_data=False
            except Exception: is_data=False
        if is_data: actual.append(f)
    if actual: record['status']='existing_data' if all(f.get('reused') for f in actual) else 'downloaded'
    elif record['status']=='downloaded': record['status']='metadata_only_download_failed'
    record['data_files']=len(actual)
    print(name,record['status'],record['data_files'],flush=True)
    return record

if __name__=='__main__':
    manifest=json.loads((ROOT/'manifest.json').read_text())
    with cf.ThreadPoolExecutor(max_workers=5) as pool:
        manifest['sources']=list(pool.map(run,manifest['sources']))
    (ROOT/'manifest.json').write_text(json.dumps(manifest,indent=2))
