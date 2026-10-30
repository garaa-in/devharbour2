"""
DevHarbour — Official Ultra-HD Batch Certificate PDF Generator
Event: ORCA CODERS: ORCATHON 2026
Generates a consolidated, searchable, vector-quality PDF of all 693 verified candidates.
"""

import os
import sys
import time
import html
import json
import csv
import sqlite3
import pymupdf as fitz
from playwright.sync_api import sync_playwright

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
OUTPUT_DIR = os.path.join(BASE_DIR, 'output')
PUBLIC_CERT_DIR = os.path.join(BASE_DIR, 'public', 'certificates')
SCRATCH_DIR = os.path.join(BASE_DIR, 'scratch_pdf_gen')

os.makedirs(OUTPUT_DIR, exist_ok=True)
os.makedirs(PUBLIC_CERT_DIR, exist_ok=True)
os.makedirs(SCRATCH_DIR, exist_ok=True)

TEMPLATE_PNG_PATH = os.path.join(BASE_DIR, 'public', 'assets', 'crystal_cert_template.png')
if not os.path.exists(TEMPLATE_PNG_PATH):
    raise FileNotFoundError(f"Master certificate template not found at {TEMPLATE_PNG_PATH}")

TEMPLATE_FILE_URL = 'file:///' + os.path.abspath(TEMPLATE_PNG_PATH).replace('\\', '/')

def load_all_candidates():
    db_path = os.path.join(BASE_DIR, 'devharbour.sqlite')
    if os.path.exists(db_path):
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        rows = cursor.execute('''
            SELECT participant_id, credential_id, recipient_name, recipient_email, recipient_organisation
            FROM issued_certificates
            WHERE event_slug = 'orca-coders-orcathon-2026'
            ORDER BY CAST(participant_id AS INTEGER) ASC
        ''').fetchall()
        conn.close()
        if rows and len(rows) >= 693:
            print(f"Loaded {len(rows)} verified candidates from SQLite database.")
            candidates = []
            for r in rows:
                candidates.append({
                    'participant_id': r[0],
                    'credential_id': r[1],
                    'name': r[2],
                    'email': r[3],
                    'org': r[4] or ''
                })
            return candidates

    # Fallback to JSON if SQLite not populated
    json_path = os.path.join(BASE_DIR, 'data', 'orcathon_participants.json')
    with open(json_path, 'r', encoding='utf-8') as f:
        participants = json.load(f)
    print(f"Loaded {len(participants)} participants from {json_path}")
    candidates = []
    for p in participants:
        pid = str(p.get('id', '1')).padStart(4, '0')
        raw_id = f"DH-ORCA-2026-{pid}"
        candidates.append({
            'participant_id': str(p.get('id', '1')),
            'credential_id': raw_id,
            'name': p.get('name', 'Participant'),
            'email': p.get('email', ''),
            'org': p.get('org', '')
        })
    return candidates

def get_display_id(raw_id):
    if raw_id.startswith('DH-ORCA-2026-'):
        parts = raw_id.split('-')
        if len(parts) > 4:
            return 'ORC26-' + '-'.join(parts[3:])
        elif len(parts) > 3:
            return 'ORC26-' + parts[3]
    return raw_id

def build_batch_html(candidates):
    pages_html = []
    for c in candidates:
        raw_name = (c['name'] or 'PARTICIPANT').strip().upper()
        name = html.escape(raw_name)
        display_id = html.escape(get_display_id(c['credential_id']))
        
        name_len = len(raw_name)
        base_size = 36
        font_size = 19 if name_len > 38 else (22 if name_len > 32 else (26 if name_len > 24 else (31 if name_len > 18 else base_size)))
        name_y = 352
        
        page = f"""
<div class="cert-page">
  <svg viewBox="0 0 1024 725" width="2048" height="1450" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <filter id="dhBevel" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0.5" dy="1.2" stdDeviation="0.4" flood-color="#180630" flood-opacity="0.85" />
      </filter>
    </defs>
    <image href="{TEMPLATE_FILE_URL}" x="0" y="0" width="1024" height="725" preserveAspectRatio="xMidYMid meet" />
    <!-- 3D Bevel Engraved Highlight Shadow -->
    <text x="511.4" y="{(name_y - 0.8):.1f}" text-anchor="middle" font-family="Cinzel, 'Times New Roman', Georgia, serif" font-size="{font_size}" font-weight="700" fill="rgba(255, 255, 255, 0.75)" letter-spacing="2px">{name}</text>
    <!-- 3D Bevel Engraved Deep Shadow -->
    <text x="512.6" y="{(name_y + 1.4):.1f}" text-anchor="middle" font-family="Cinzel, 'Times New Roman', Georgia, serif" font-size="{font_size}" font-weight="700" fill="rgba(20, 5, 40, 0.88)" letter-spacing="2px">{name}</text>
    <!-- Primary Name Text with Filter -->
    <text x="512" y="{name_y}" text-anchor="middle" font-family="Cinzel, 'Times New Roman', Georgia, serif" font-size="{font_size}" font-weight="700" fill="#270c4a" filter="url(#dhBevel)" letter-spacing="2px">{name}</text>
    <!-- Authentic Credential ID -->
    <text x="512" y="598" text-anchor="middle" font-family="'Plus Jakarta Sans', Cinzel, 'Times New Roman', monospace" font-size="14" font-weight="700" fill="#260c44" letter-spacing="1.2px">{display_id}</text>
  </svg>
</div>"""
        pages_html.append(page)

    return f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700;800&family=Plus+Jakarta+Sans:wght@500;600;700;800&display=swap" rel="stylesheet">
<style>
  @page {{
    size: 2048px 1450px;
    margin: 0;
  }}
  * {{
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }}
  html, body {{
    background: #ffffff;
    margin: 0;
    padding: 0;
  }}
  .cert-page {{
    width: 2048px;
    height: 1450px;
    page-break-after: always;
    break-after: page;
    position: relative;
    overflow: hidden;
  }}
  svg {{
    width: 2048px;
    height: 1450px;
    display: block;
  }}
</style>
</head>
<body>
{''.join(pages_html)}
</body>
</html>"""

def main():
    print("=" * 70)
    print("  DEVHARBOUR — OFFICIAL BATCH CERTIFICATE PDF GENERATION PIPELINE")
    print("=" * 70)
    start_time = time.time()
    
    candidates = load_all_candidates()
    total_candidates = len(candidates)
    print(f"Total candidate certificates to render: {total_candidates}")
    
    # Save manifest files
    manifest = []
    for idx, c in enumerate(candidates, start=1):
        display_id = get_display_id(c['credential_id'])
        manifest.append({
            'page_number': idx,
            'participant_id': c['participant_id'],
            'recipient_name': c['name'].strip().upper(),
            'recipient_email': c['email'],
            'recipient_organisation': c['org'],
            'credential_id': c['credential_id'],
            'display_credential_id': display_id
        })
    
    manifest_json_path = os.path.join(OUTPUT_DIR, 'certificates_manifest.json')
    with open(manifest_json_path, 'w', encoding='utf-8') as f:
        json.dump(manifest, f, indent=2)
    print(f"Manifest JSON saved to: {manifest_json_path}")
    
    manifest_csv_path = os.path.join(OUTPUT_DIR, 'certificates_manifest.csv')
    with open(manifest_csv_path, 'w', encoding='utf-8', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=[
            'page_number', 'participant_id', 'recipient_name', 'recipient_email', 
            'recipient_organisation', 'credential_id', 'display_credential_id'
        ])
        writer.writeheader()
        writer.writerows(manifest)
    print(f"Manifest CSV saved to: {manifest_csv_path}")

    # Process in batches
    BATCH_SIZE = 70
    batches = [candidates[i:i + BATCH_SIZE] for i in range(0, total_candidates, BATCH_SIZE)]
    print(f"Rendering in {len(batches)} batches of up to {BATCH_SIZE} pages each...")
    
    batch_pdf_paths = []
    
    with sync_playwright() as p:
        browser = p.chromium.launch()
        context = browser.new_context(viewport={'width': 2048, 'height': 1450})
        
        for b_idx, batch in enumerate(batches, start=1):
            batch_t0 = time.time()
            batch_html = build_batch_html(batch)
            batch_html_file = os.path.join(SCRATCH_DIR, f'batch_{b_idx:02d}.html')
            batch_pdf_file = os.path.join(SCRATCH_DIR, f'batch_{b_idx:02d}.pdf')
            
            with open(batch_html_file, 'w', encoding='utf-8') as f:
                f.write(batch_html)
                
            page = context.new_page()
            file_url = 'file:///' + os.path.abspath(batch_html_file).replace('\\', '/')
            page.goto(file_url)
            page.wait_for_load_state('networkidle')
            page.pdf(path=batch_pdf_file, width='2048px', height='1450px', print_background=True)
            page.close()
            
            batch_pdf_paths.append(batch_pdf_file)
            batch_time = time.time() - batch_t0
            start_num = (b_idx - 1) * BATCH_SIZE + 1
            end_num = min(b_idx * BATCH_SIZE, total_candidates)
            print(f"Batch {b_idx:02d}/{len(batches):02d} rendered ({start_num:3d} - {end_num:3d}): {len(batch)} pages in {batch_time:.2f}s")
            
        browser.close()

    # Merge all batches into master PDF with PyMuPDF
    print("\nMerging batch PDFs into consolidated master PDF...")
    merged_doc = fitz.open()
    for b_pdf in batch_pdf_paths:
        batch_doc = fitz.open(b_pdf)
        merged_doc.insert_pdf(batch_doc)
        batch_doc.close()

    total_pages = len(merged_doc)
    print(f"Merged document contains {total_pages} total pages.")

    # Save to output and public directories
    output_pdf_path = os.path.join(OUTPUT_DIR, 'orcathon_2026_all_certificates.pdf')
    public_pdf_path = os.path.join(PUBLIC_CERT_DIR, 'orcathon_2026_all_certificates.pdf')

    print(f"Optimizing and saving master PDF to: {output_pdf_path}")
    merged_doc.save(output_pdf_path, deflate=True, garbage=4)
    print(f"Copying to public directory: {public_pdf_path}")
    merged_doc.save(public_pdf_path, deflate=True, garbage=4)
    merged_doc.close()

    output_size_mb = os.path.getsize(output_pdf_path) / (1024 * 1024)
    total_time = time.time() - start_time
    print("=" * 70)
    print(f"  SUCCESSFULLY GENERATED ALL {total_pages} CANDIDATE CERTIFICATES!")
    print(f"  Total Pages: {total_pages}")
    print(f"  Master PDF:  {output_pdf_path} ({output_size_mb:.2f} MB)")
    print(f"  Public PDF:  {public_pdf_path}")
    print(f"  Manifest:    {manifest_csv_path}")
    print(f"  Time Taken:  {total_time:.2f} seconds ({total_time / 60:.1f} minutes)")
    print("=" * 70)

if __name__ == '__main__':
    main()
