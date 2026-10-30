import sqlite3
import os
import json

base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
db_path = os.path.join(base_dir, 'devharbour.sqlite')
supabase_dir = os.path.join(base_dir, 'supabase')
os.makedirs(supabase_dir, exist_ok=True)

conn = sqlite3.connect(db_path)
conn.row_factory = sqlite3.Row
cursor = conn.cursor()

tables = [r[0] for r in cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").fetchall()]
print("Tables in SQLite:", tables)
for t in tables:
    count = cursor.execute(f'SELECT COUNT(*) FROM "{t}"').fetchone()[0]
    print(f"  {t}: {count} rows")

conn.close()
