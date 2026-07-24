import sqlite3
import json

DB = r'C:\Users\USER\.local\share\mimocode\mimocode.db'
conn = sqlite3.connect(DB)
conn.row_factory = sqlite3.Row
cur = conn.cursor()

# Check task schema
print("=== TASK COLUMNS ===")
cur.execute("PRAGMA table_info(task)")
for row in cur.fetchall():
    print(dict(row))

# Tasks for this project
print("\n=== TASKS FOR ANYDISCUSSION ===")
cur.execute("""
    SELECT t.id, t.session_id, t.status, t.data, t.time_created
    FROM task t
    JOIN session s ON t.session_id = s.id
    WHERE s.project_id = 'ea068934-db62-4a6c-acc3-88ed2057fc33'
    ORDER BY t.time_created DESC
""")
for row in cur.fetchall():
    d = dict(row)
    if d.get('data'):
        try:
            d['data'] = json.loads(d['data'])
        except:
            pass
    print(d)

# Task events for this project
print("\n=== TASK EVENTS FOR ANYDISCUSSION ===")
cur.execute("""
    SELECT te.id, te.task_id, te.event_type, te.data, te.time_created
    FROM task_event te
    JOIN task t ON te.task_id = t.id
    JOIN session s ON t.session_id = s.id
    WHERE s.project_id = 'ea068934-db62-4a6c-acc3-88ed2057fc33'
    ORDER BY te.time_created DESC
    LIMIT 30
""")
for row in cur.fetchall():
    d = dict(row)
    if d.get('data'):
        try:
            d['data'] = json.loads(d['data'])
        except:
            pass
    print(d)

conn.close()
