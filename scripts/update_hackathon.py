import os
import re

def update_file(filepath):
    print(f"Processing {filepath}...")
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    is_crlf = '\r\n' in content
    text = content.replace('\r\n', '\n')

    # 1. Clean CSS - minimal, no noisy gradient cards or emoji tags
    old_css_regex = re.search(r"/\* ===== HACKATHON CARD \(compact, supports many\) ===== \*/.*?@media\(max-width:480px\)\{\.hk\{grid-template-columns:84px minmax\(0,1fr\);gap:12px;padding:12px\}\.hkp\{min-height:120px;font-size:10px\}\}", text, re.DOTALL)
    
    new_css = """/* ===== HACKATHON CARD (compact, supports many) ===== */
.hkc{max-width:900px;padding:clamp(14px,2.2vw,22px);border-radius:26px;background:var(--card);box-shadow:inset 0 0 0 1.5px var(--line)}
html[data-theme="mercury"] .hkc{box-shadow:inset 0 0 0 1.5px var(--ink)}
.hkh{display:flex;justify-content:space-between;align-items:center;gap:10px;padding-bottom:12px;margin-bottom:12px;border-bottom:1px solid var(--line)}
.hkh .xlg{font-size:12px;letter-spacing:.1em}.hkh .xli{width:28px;height:28px}.hkh b{font-size:12px;letter-spacing:.2em;text-transform:uppercase;color:var(--mut);font-weight:800}
.hk{display:grid;grid-template-columns:110px minmax(0,1fr);gap:16px;padding:14px;border-radius:20px;background:var(--soft);box-shadow:inset 0 0 0 1px var(--line);margin-bottom:10px}
.hkp{position:relative;border-radius:14px;overflow:hidden;min-height:150px;display:grid;place-content:center;text-align:center;font-family:'Michroma',var(--font);font-size:12px;line-height:1.5;color:var(--mut);background:linear-gradient(160deg,var(--card),var(--soft));box-shadow:inset 0 0 0 1px var(--line)}
.hkp img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:center top}
.hkb{display:flex;flex-direction:column;gap:5px;min-width:0}
.hks{align-self:flex-start;display:inline-flex;align-items:center;gap:7px;font-size:11px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;padding:5px 11px;border-radius:99px;background:var(--ink);color:var(--bg)}
.hks.live:before{content:"";width:7px;height:7px;border-radius:50%;background:#3ddc84;animation:pu 1.6s infinite}
.hkb h3{font-size:clamp(18px,2.4vw,24px);font-weight:800;letter-spacing:-.02em;margin-top:2px}.hkb .zd{font-size:14px}.hkb .zhl{font-weight:800;font-size:15px}
.hka{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin-top:8px}
.hka .zb{align-self:auto;padding:10px 18px;font-size:13px;margin-top:0}
.hkn{margin-top:6px}
@media(max-width:480px){.hk{grid-template-columns:84px minmax(0,1fr);gap:12px;padding:12px}.hkp{min-height:120px;font-size:10px}}"""

    if old_css_regex:
        text = text[:old_css_regex.start()] + new_css + text[old_css_regex.end():]
        print("  [OK] Cleaned CSS to minimal style")

    # 2. Update LINKS (blank poster for tatva)
    old_links_match = re.search(r"const LINKS=\{orcathon:[^}]+};", text)
    if old_links_match:
        new_links_str = ("const LINKS={orcathon:'https://unstop.com/o/vON6wtS?lb=useupllP&utm_medium=Share&utm_source=online_coding_challenge&utm_campaign=Parthhyg96055',"
                         "tatva:'https://unstop.com/o/9sLW7l8?lb=useupllP&utm_medium=Share&utm_source=online_coding_challenge&utm_campaign=Parthhyg96055',"
                         "instagram:'https://www.instagram.com/devharbour.official',"
                         "community:'https://chat.whatsapp.com/Dt87L7lU5SOBSfKDKuNS8s',"
                         "about:'',"
                         "contact:'',"
                         "github:'',"
                         "linkedin:'https://www.linkedin.com/company/devharbour/',"
                         "terms:'',"
                         "poster:''};")
        text = text.replace(old_links_match.group(0), new_links_str, 1)
        print("  [OK] Updated LINKS")

    # 3. Update HACKS - minimal, no emojis, blank poster, clean shortName
    hacks_regex = re.search(r"const HACKS=\[.*?\];", text, re.DOTALL)
    if hacks_regex:
        new_hacks_str = ("const HACKS=["
                         "{"
                         "name:'TATVA \u2013 National Hackathon 2026',"
                         "shortName:'TATVA<br>2026',"
                         "org:'DevHarbour \u00b7 01 Nov \u2013 06 Dec 2026 \u00b7 Online \u00b7 Open PS',"
                         "status:'Live now',"
                         "headline:'\u20b92,27,790 in prizes & AI credits',"
                         "desc:'Online individual Open Problem Statement hackathon. Build your own ideas across AI, Web, Cybersecurity or Automation. Rank-wise verified certificates for all eligible submissions.',"
                         "link:LINKS.tatva,"
                         "wpLink:LINKS.community,"
                         "poster:'',"
                         "cta:'Register on Unstop (\u20b929) \u2197'"
                         "},"
                         "{"
                         "name:'Orcathon 2K26',"
                         "shortName:'Orcathon<br>2K26',"
                         "org:'Orca Coders \u00b7 October 2026',"
                         "status:'Closed',"
                         "headline:'\u20b93 lakh+ worth of AI credits & prizes',"
                         "desc:'Build with AI, turn an idea into a working project, and pitch it to judges.',"
                         "link:LINKS.orcathon,"
                         "poster:'',"
                         "cta:'Closed'"
                         "}];")
        text = text[:hacks_regex.start()] + new_hacks_str + text[hacks_regex.end():]
        print("  [OK] Cleaned HACKS array")

    # 4. Minimal render logic: NO emojis, blank thumbnail, minimal buttons
    render_regex = re.search(r"\$\('hkl'\)\.innerHTML=HACKS\.map\(.*?\}\)\.join\(''\);", text, re.DOTALL)
    if not render_regex:
        render_regex = re.search(r"\$\('hkl'\)\.innerHTML=HACKS\.map\(h=>`<article class=\"hk\">[^;]+;\n", text)

    if render_regex:
        new_render_str = """$('hkl').innerHTML=HACKS.map(h=>{
const isLive=h.status==='Live now';
const btns=[];
if(h.link)btns.push(`<a class="zb" href="${esc(h.link)}" target="_blank" rel="noopener noreferrer">${h.cta||'Register ↗'}</a>`);
else btns.push(`<a class="zb" href="#" data-t="Registration link not added yet">${h.cta||'Register ↗'}</a>`);
if(h.wpLink)btns.push(`<a class="zb o" href="${esc(h.wpLink)}" target="_blank" rel="noopener noreferrer">WhatsApp Community ↗</a>`);
const label=h.shortName||h.name.split(' ').join('<br>');
return `<article class="hk"><div class="hkp"><span>${label}</span>${h.poster?`<img src="${esc(h.poster)}" alt="${esc(h.name)} poster" decoding="async" onerror="this.remove()">`:''}</div><div class="hkb"><span class="hks${isLive?' live':''}">${h.status}</span><h3>${h.name}</h3><p class="zn">${h.org}</p><p class="zhl">${h.headline}</p><p class="zd">${h.desc}</p><div class="hka">${btns.join('')}</div></div></article>`;
}).join('');"""
        text = text[:render_regex.start()] + new_render_str + text[render_regex.end():]
        print("  [OK] Cleaned render logic to ultra-minimal")

    if is_crlf:
        text = text.replace('\n', '\r\n')

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(text)
    print(f"  Saved {filepath}")

for p in ['public/index.html', 'index.html', 'standalone/index.html', 'output/devharbour_standalone.html']:
    if os.path.exists(p):
        update_file(p)
