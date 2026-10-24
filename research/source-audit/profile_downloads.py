"""Reproduce the source inventory from the downloaded public files. No network calls."""
import csv
import io
import json
from pathlib import Path
import zipfile

ROOT = Path(__file__).parent

def read_csv_archive(filename):
    with zipfile.ZipFile(ROOT / filename) as archive:
        member = next(name for name in archive.namelist()
                      if name.lower().endswith('.csv') and not name.startswith('__MACOSX/'))
        contents = archive.read(member).decode('utf-8-sig')
        return [{key.strip(): value for key, value in row.items()}
                for row in csv.DictReader(io.StringIO(contents))]

profiles = {}
tables = {}
for filename in ['ipeds-hd2024.zip', 'ipeds-ic2024.zip', 'scorecard.zip', 'om2023.zip']:
    rows = read_csv_archive(filename)
    tables[filename] = rows
    keys = [(row['UNITID'], row['OMCHRT']) if 'OMCHRT' in row else row['UNITID']
            for row in rows]
    profiles[filename] = {
        'rows': len(rows),
        'columns': len(rows[0]),
        'institutions': len({row['UNITID'] for row in rows}),
        'unique_candidate_keys': len(set(keys)),
        'key': ['UNITID', 'OMCHRT'] if 'OMCHRT' in rows[0] else ['UNITID'],
    }

profiles['scorecard.zip']['massachusetts_rows'] = sum(
    row['STABBR'] == 'MA' for row in tables['scorecard.zip'])
massgis = json.loads((ROOT / 'massgis-full.json').read_text())
profiles['massgis'] = {
    'campus_points': len(massgis['features']),
    'points_with_nces_id': sum(bool(row['attributes'].get('NCES_ID'))
                               for row in massgis['features']),
}
openalex = json.loads((ROOT / 'openalex-bu-works.json').read_text())
profiles['openalex_bu_2024'] = {
    'api_total_matching': openalex['meta']['count'],
    'downloaded_sample': len(openalex['results']),
    'sample_with_abstract': sum(bool(row.get('abstract_inverted_index'))
                               for row in openalex['results']),
    'sample_with_topic': sum(bool(row.get('primary_topic'))
                            for row in openalex['results']),
}
output = ROOT / 'verified-profile.json'
output.write_text(json.dumps(profiles, indent=2) + '\n')
print(json.dumps(profiles, indent=2))
