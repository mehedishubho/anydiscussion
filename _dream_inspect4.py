import sqlite3
import json

DB = r'C:\Users\USER\.local\share\mimocode\mimocode.db'
conn = sqlite3.connect(DB)
conn.row_factory = sqlite3.Row
cur = conn.cursor()

# Get messages from the "Extracting phase 7 implementation decisions" session
sessions = [
    ('ses_0a322b857ffezBAXFhBdHZIbPi', 'Extracting phase 7 implementation decisions'),
    ('ses_0a322b825ffepfAjPvtph7T3g7', 'Auto Distill'),
    ('ses_0a3227068ffe6KKpDR5AQF5VAp', 'checkpoint-writer'),
]

for sid, title in sessions:
    print(f"\n{'='*80}")
    print(f"SESSION: {title} ({sid})")
    print(f"{'='*80}")
    cur.execute("""
        SELECT m.id, m.agent_id, m.time_created,
               json_extract(m.data, '$.role') as role,
               m.data
        FROM message m
        WHERE m.session_id = ?
        ORDER BY m.time_created
    """, (sid,))
    for row in cur.fetchall():
        msg_data = json.loads(row['data'])
        role = msg_data.get('role', 'unknown')
        agent = row['agent_id'] or 'main'
        print(f"\n--- Message {row['id']} | role={role} | agent={agent} ---")
        # Get parts for this message
        cur2 = conn.cursor()
        cur2.execute("""
            SELECT p.id, p.data
            FROM part p
            WHERE p.message_id = ?
            ORDER BY p.time_created
        """, (row['id'],))
        for part_row in cur2.fetchall():
            part_data = json.loads(part_row['data'])
            ptype = part_data.get('type', 'unknown')
            if ptype == 'text':
                text = part_data.get('text', '')
                print(f"  [text] {text[:500]}")
            elif ptype == 'tool':
                tool = part_data.get('tool', 'unknown')
                state = part_data.get('state', {})
                inp = state.get('input', {})
                out = state.get('output', '')
                if isinstance(out, str):
                    out_preview = out[:300]
                elif isinstance(out, dict):
                    out_preview = json.dumps(out)[:300]
                else:
                    out_preview = str(out)[:300]
                print(f"  [tool:{tool}] input_keys={list(inp.keys()) if isinstance(inp, dict) else 'N/A'}")
                print(f"    output: {out_preview}")
            elif ptype == 'step-start':
                print(f"  [step-start]")
            elif ptype == 'step-finish':
                tokens = part_data.get('tokens', '')
                print(f"  [step-finish] tokens={tokens}")
            else:
                print(f"  [{ptype}] {str(part_data)[:200]}")

conn.close()
