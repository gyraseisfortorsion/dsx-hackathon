#!/usr/bin/env python3
"""Retrieve the linked open-data inventory, with bounded scope and verified files."""
import concurrent.futures as cf
import csv
import hashlib
import io
import json
from pathlib import Path
import re
import urllib.parse as up
import urllib.request as ur
import zipfile
from html.parser import HTMLParser
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parent
LIMIT = 200 * 1024 * 1024

class Links(HTMLParser):
    def __init__(self):
        super().__init__(); self.links = []
    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == 'a' and a.get('href'): self.links.append(a['href'])

def fetch(url, path, kind=None):
    req = ur.Request(url, headers={'User-Agent': 'CollegeHack research data download (academic prototype)', 'Accept': '*/*'})
    with ur.urlopen(req, timeout=45) as r:
        data = r.read(LIMIT + 1)
        if len(data) > LIMIT: raise ValueError('Exceeds 200 MiB per-file download limit')
        ct = r.headers.get('Content-Type', '')
        final = r.url
    if kind == 'json': json.loads(data)
    if kind == 'zip':
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            if z.testzip(): raise ValueError('ZIP CRC validation failed')
    if kind == 'csv':
        if 'html' in ct or data.lstrip().lower().startswith(b'<!doctype html'): raise ValueError('HTML instead of CSV')
        rows = list(csv.reader(io.StringIO(data.decode('utf-8-sig'))))
        if len(rows) < 2: raise ValueError('CSV has no data rows')
    if kind == 'xlsx' and not zipfile.is_zipfile(io.BytesIO(data)): raise ValueError('Not an XLSX archive')
    path.parent.mkdir(parents=True, exist_ok=True); path.write_bytes(data)
    result = {'url': url, 'resolved_url': final, 'file': str(path.relative_to(ROOT.parent)), 'bytes': len(data), 'content_type': ct, 'sha256': hashlib.sha256(data).hexdigest()}
    if kind == 'csv': result['data_rows'] = len(rows) - 1
    return data, result

def download(row):
    vals = [c.get('formattedValue', '') for c in row['values']]
    name, url = vals[0], vals[4]
    slug = re.sub('[^a-z0-9]+', '-', name.lower()).strip('-')
    folder = ROOT / slug
    record = {'name': name, 'source_url': url, 'sheet_description': vals[3], 'constraints': vals[7] if len(vals)>7 else '', 'files': [], 'errors': [], 'status': 'reference_only'}
    def get(u, filename, kind=None):
        try:
            data, meta = fetch(u, folder / filename, kind)
            record['files'].append(meta)
            if kind: record['status'] = 'downloaded'
            return data
        except Exception as e:
            record['errors'].append({'url': u, 'error': str(e)})
            return None
    # Existing verified data is reused rather than duplicated.
    existing = {
        'IPEDS complete data files': ['source-audit/ipeds-hd2024.zip','source-audit/ipeds-ic2024.zip','source-audit/om2023.zip'],
        'College Scorecard': ['source-audit/scorecard.zip'],
        'NSSE public displays': ['nsse-public-search/NSSE25 Sample Data (US).sav','nsse-public-search/NSSE25 Sample Data (Canada).sav'],
        'OpenAlex': ['source-audit/openalex-bu-works.json','source-audit/openalex-bu-institution.json'],
        'MassGIS colleges and universities': ['source-audit/massgis-full.json'],
        'College Navigator': ['source-audit/ipeds-hd2024.zip','source-audit/ipeds-ic2024.zip'],
    }
    if name in existing:
        for rel in existing[name]:
            p = ROOT.parent / rel
            b = p.read_bytes()
            try:
                if p.suffix == '.zip':
                    with zipfile.ZipFile(p) as z:
                        if z.testzip(): raise ValueError('ZIP CRC error')
                if p.suffix == '.json': json.loads(b)
                record['files'].append({'file': rel, 'bytes': len(b), 'sha256': hashlib.sha256(b).hexdigest(), 'reused': True})
            except Exception as e: record['errors'].append({'file':rel,'error':str(e)})
        record['status'] = 'existing_data'
        record['scope'] = 'Existing selected files; see source-audit/source-notes.md and nsse-public-search/findings.md for coverage and provenance.'
        return record
    restricted = ['U.S. News rankings','Times Higher Education rankings','QS subject rankings','ShanghaiRanking ARWU','Web of Science API','Google Scholar']
    if name in restricted:
        record['status'] = 'restricted_or_no_bulk_export'
        record['scope'] = 'Source link retained; no licensed data or unapproved scraping downloaded.'
        return record
    if 'docs.google.com' in url:
        record['status'] = 'reference_document'; return record
    page = get(url, 'source-page.html')
    links = []
    if page:
        p = Links(); p.feed(page.decode('utf-8', errors='replace'))
        links = list(dict.fromkeys(up.urljoin(url, x) for x in p.links))
        (folder/'links.json').write_text(json.dumps(links, indent=2))
    # Socrata's CSV export returns the complete dataset, unlike default API pages.
    m = re.search(r'https://(data\.(?:cambridgema|somervillema)\.gov)/.*?/([a-z0-9]{4}-[a-z0-9]{4})', url)
    if m:
        host, did = m.groups()
        get(f'https://{host}/api/views/{did}.json','metadata.json','json')
        get(f'https://{host}/api/views/{did}/rows.csv?accessType=DOWNLOAD','data.csv','csv')
        record['scope'] = 'Complete CSV export of the linked Socrata dataset at retrieval time.'
    elif 'data.boston.gov/dataset/' in url:
        did = url.rstrip('/').split('/')[-1]
        raw = get('https://data.boston.gov/api/3/action/package_show?id='+did,'metadata.json','json')
        if raw:
            resources = json.loads(raw).get('result',{}).get('resources',[])
            chosen = [r for r in resources if r.get('format','').lower() in ['csv','geojson','json','zip','xlsx']]
            for i,r in enumerate(chosen):
                fmt=r['format'].lower(); get(r['url'],f'{i+1:02d}-data.{fmt}', 'json' if fmt=='geojson' else fmt)
            record['scope'] = 'All listed CSV/JSON/GeoJSON/ZIP/XLSX resources, each bounded to 200 MiB.'
    elif name == 'O*NET database':
        candidates = [x for x in links if re.search(r'/db_\d+_\d+_text\.zip',x)]
        if candidates: get(candidates[0],up.urlparse(candidates[0]).path.split('/')[-1],'zip')
        record['scope'] = 'Full current O*NET text database ZIP linked from the official page.'
    elif name == 'BLS OEWS':
        candidates = [x for x in links if re.search(r'/oes/special.requests/oesm\d+all\.zip',x)]
        if not candidates: candidates=[x for x in links if re.search(r'oesm\d+nat\.zip',x)]
        if candidates: get(candidates[0],up.urlparse(candidates[0]).path.split('/')[-1],'zip')
        record['scope'] = 'Latest downloadable OEWS file linked on the official tables page.'
    elif name == 'Bluebikes system data':
        buckets = [x for x in links if 's3' in x or 'amazonaws' in x]
        record['download_links'] = buckets
        for x in links:
            if '.zip' in x:
                get(x,up.urlparse(x).path.split('/')[-1],'zip'); break
        record['scope'] = 'One monthly trip file for a prototype; not the complete historical archive.'
    elif name == 'American Community Survey':
        query='get=NAME,B01003_001E,B15003_001E,B15003_022E,B19013_001E,B08301_001E&for=county:*&in=state:25'
        get('https://api.census.gov/data/2024/acs/acs5?'+query,'ma-counties-2024.json','json')
        record['scope'] = '2024 ACS 5-year, all Massachusetts counties; population, education, median household income, commuting denominator. Estimates only; not full ACS.'
    elif name == 'OpenStreetMap':
        get('https://www.openstreetmap.org/api/0.6/map?bbox=-71.113,42.345,-71.096,42.355','bu-central-campus.osm')
        if any(f['file'].endswith('.osm') for f in record['files']): record['status']='downloaded'
        record['scope'] = 'BU central-campus bounding box only (-71.113,42.345,-71.096,42.355); ODbL, attribute OpenStreetMap contributors.'
    elif name == 'Boston bicycle count dashboard':
        item=up.urlparse(url).path.split('/')[-1]
        raw=get(f'https://www.arcgis.com/sharing/rest/content/items/{item}/data?f=json','dashboard.json','json')
        get(f'https://www.arcgis.com/sharing/rest/content/items/{item}?f=json','metadata.json','json')
        if raw:
            ids=list(dict.fromkeys(re.findall(r'"itemId"\s*:\s*"([a-f0-9]{32})"',raw.decode())))
            record['related_arcgis_items']=ids
        record['status']='reference_only'
    else:
        candidates=[x for x in links if re.search(r'\.(csv|xlsx|zip|geojson)(?:\?|$)',x,re.I)]
        for i,x in enumerate(candidates[:5]):
            ext=re.search(r'\.(csv|xlsx|zip|geojson)(?:\?|$)',x,re.I).group(1).lower()
            get(x,f'{i+1:02d}-data.{ext}','json' if ext=='geojson' else ext)
        record['scope']='Direct downloadable data links from the supplied source page, if exposed (up to five files). Directory/dashboard HTML is documentation, not data.'
    if not record['files'] and record['errors']: record['status']='unavailable'
    return record

def main():
    sheet=json.loads((ROOT/'source-sheet.json').read_text())
    rows=sheet['sheets'][0]['data'][0]['rowData'][2:]
    rows=[r for r in rows if len(r.get('values',[]))>4]
    records=[]
    with cf.ThreadPoolExecutor(max_workers=6) as pool:
        for rec in pool.map(download,rows):
            records.append(rec); print(rec['name']+': '+rec['status'],flush=True)
            (ROOT/'manifest.json').write_text(json.dumps({'retrieved_at':datetime.now(timezone.utc).isoformat(),'sources':records},indent=2))
    print('Saved manifest for',len(records),'sources',flush=True)

if __name__=='__main__': main()
