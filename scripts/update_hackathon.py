import os
import re

def update_file(filepath):
    print(f"Processing {filepath}...")
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # Determine original newline style
    is_crlf = '\r\n' in content
    text = content.replace('\r\n', '\n')

    # 1. Update CSS
    old_css = """.hk{display:grid;grid-template-columns:110px minmax(0,1fr);gap:16px;padding:14px;border-radius:20px;background:var(--soft);box-shadow:inset 0 0 0 1px var(--line);margin-bottom:10px}"""
    
    new_css = """.hk{display:grid;grid-template-columns:110px minmax(0,1fr);gap:16px;padding:14px;border-radius:20px;background:var(--soft);box-shadow:inset 0 0 0 1px var(--line);margin-bottom:10px;transition:transform .2s ease,box-shadow .2s ease}
.hk.is-live{background:linear-gradient(135deg,rgba(110,68,255,0.06),rgba(61,220,132,0.04)),var(--soft);box-shadow:inset 0 0 0 1.5px rgba(110,68,255,0.35),0 12px 32px -10px rgba(110,68,255,0.15)}
.hk:hover{transform:translateY(-2px)}
.hkt{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-bottom:3px}
.hkt-tag{font-size:11px;font-weight:700;letter-spacing:.04em;padding:3px 9px;border-radius:99px;background:rgba(125,125,125,0.08);color:var(--mut);border:1px solid var(--line)}
.hkt-prize{font-size:11px;font-weight:800;letter-spacing:.04em;padding:3px 10px;border-radius:99px;background:linear-gradient(135deg,rgba(255,183,77,0.22),rgba(255,140,0,0.16));color:#ff9f1c;border:1px solid rgba(255,159,28,0.45)}
.hka{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin-top:8px}
.hka .zb{align-self:auto;padding:10px 18px;font-size:13px;margin-top:0}"""

    if old_css in text and '.hk.is-live' not in text:
        text = text.replace(old_css, new_css, 1)
        print("  [OK] Updated CSS")
    else:
        print("  [-] CSS already updated or not found")

    # 2. Update LINKS
    # Find LINKS object
    old_links_match = re.search(r"const LINKS=\{orcathon:[^}]+};", text)
    if old_links_match:
        old_links_str = old_links_match.group(0)
        # Parse or inject tatva into LINKS
        new_links_str = ("const LINKS={orcathon:'https://unstop.com/o/vON6wtS?lb=useupllP&utm_medium=Share&utm_source=online_coding_challenge&utm_campaign=Parthhyg96055',"
                         "tatva:'https://unstop.com/o/9sLW7l8?lb=useupllP&utm_medium=Share&utm_source=online_coding_challenge&utm_campaign=Parthhyg96055',"
                         "instagram:'https://www.instagram.com/devharbour.official',"
                         "community:'https://chat.whatsapp.com/Dt87L7lU5SOBSfKDKuNS8s',"
                         "about:'',"
                         "contact:'',"
                         "github:'',"
                         "linkedin:'https://www.linkedin.com/company/devharbour/',"
                         "terms:'',"
                         "poster:'assets/orcathon-2k26-poster.jpg',"
                         "tatvaPoster:'assets/tatva-hackathon-poster.png'};")
        text = text.replace(old_links_str, new_links_str, 1)
        print("  [OK] Updated LINKS")

    # 3. Update HACKS & render function
    # Search for const HACKS=[...];
    hacks_regex = re.search(r"const HACKS=\[\{name:'Orcathon 2K26'[^\]]+\];", text)
    if hacks_regex:
        old_hacks_str = hacks_regex.group(0)
        new_hacks_str = ("const HACKS=["
                         "{"
                         "name:'TATVA \u2013 National Hackathon 2026',"
                         "org:'DevHarbour \u00b7 01 Nov \u2013 06 Dec 2026',"
                         "status:'Live now',"
                         "headline:'\u20b92,27,790 in prizes & AI credits \u00b7 \u20b92.28 Lakh Cash/Credits Grand Winner',"
                         "desc:'DevHarbour presents TATVA \u2014 an online individual coding hackathon with Open Problem Statement (Open PS). Build your own innovative project across Web, AI, Cybersecurity, or Automation. Rank-wise verified certificates for all eligible submissions.',"
                         "link:LINKS.tatva,"
                         "wpLink:LINKS.community,"
                         "poster:LINKS.tatvaPoster,"
                         "fee:'\u20b929',"
                         "format:'Open PS \u00b7 Solo',"
                         "prizes:'\u20b92,27,790 Prizes',"
                         "cta:'Register on Unstop (\u20b929) \u2197'"
                         "},"
                         "{"
                         "name:'Orcathon 2K26',"
                         "org:'Orca Coders \u00b7 October 2026',"
                         "status:'Closed',"
                         "headline:'\u20b93 lakh+ worth of AI credits & prizes',"
                         "desc:'Build with AI, turn an idea into a working project, and pitch it to judges.',"
                         "link:LINKS.orcathon,"
                         "poster:LINKS.poster,"
                         "cta:'Closed'"
                         "}];")
        text = text.replace(old_hacks_str, new_hacks_str, 1)
        print("  [OK] Updated HACKS array")

    # 4. Update the render logic: $('hkl').innerHTML=...
    old_render_regex = re.search(r"\$\('hkl'\)\.innerHTML=HACKS\.map\(h=>`<article class=\"hk\">[^;]+;\n", text)
    if not old_render_regex:
        old_render_regex = re.search(r"\$\('hkl'\)\.innerHTML=HACKS\.map\([^;]+;\n", text)
    
    if old_render_regex:
        old_render_str = old_render_regex.group(0)
        new_render_str = """$('hkl').innerHTML=HACKS.map(h=>{
const isLive=h.status==='Live now';
const tags=[`<span class="hks${isLive?' live':''}">${h.status}</span>`];
if(h.prizes)tags.push(`<span class="hkt-prize">🏆 ${h.prizes}</span>`);
if(h.format)tags.push(`<span class="hkt-tag">${h.format}</span>`);
if(h.fee)tags.push(`<span class="hkt-tag">Fee: ${h.fee}</span>`);
const btns=[];
if(h.link)btns.push(`<a class="zb" href="${esc(h.link)}" target="_blank" rel="noopener noreferrer">${h.cta||'Register ↗'}</a>`);
else btns.push(`<a class="zb" href="#" data-t="Registration link not added yet">${h.cta||'Register ↗'}</a>`);
if(h.wpLink)btns.push(`<a class="zb o" href="${esc(h.wpLink)}" target="_blank" rel="noopener noreferrer"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style="vertical-align:-2px;margin-right:5px"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.885-9.889 9.885m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L0 24l6.335-1.662c1.746.953 3.71 1.456 5.711 1.457h.005c6.554 0 11.89-5.335 11.893-11.893a11.82 11.82 0 00-3.48-8.413z"/></svg>WhatsApp Community ↗</a>`);
return `<article class="hk${isLive?' is-live':''}"><div class="hkp"><span>${h.name.split(' ').join('<br>')}</span>${h.poster?`<img src="${esc(h.poster)}" alt="${esc(h.name)} poster" decoding="async" onerror="this.remove()">`:''}</div><div class="hkb"><div class="hkt">${tags.join('')}</div><h3>${h.name}</h3><p class="zn">${h.org}</p><p class="zhl">${h.headline}</p><p class="zd">${h.desc}</p><div class="hka">${btns.join('')}</div></div></article>`;
}).join('');
"""
        text = text.replace(old_render_str, new_render_str, 1)
        print("  [OK] Updated render logic")

    # Restore CRLF if needed
    if is_crlf:
        text = text.replace('\n', '\r\n')

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(text)
    print(f"  Saved {filepath}")

for p in ['public/index.html', 'index.html', 'standalone/index.html', 'output/devharbour_standalone.html']:
    if os.path.exists(p):
        update_file(p)
