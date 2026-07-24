import sqlite3
import json

DB = r'C:\Users\USER\.local\share\mimocode\mimocode.db'
conn = sqlite3.connect(DB)
conn.row_factory = sqlite3.Row
cur = conn.cursor()

# Tasks for this project
print("=== TASKS FOR ANYDISCUSSION ===")
cur.execute("""
    SELECT t.id, t.session_id, t.status, t.summary, t.created_at, t.last_event_at
    FROM task t
    JOIN session s ON t.session_id = s.id
    WHERE s.project_id = 'ea068934-db62-4a6c-acc3-88ed2057fc33'
    ORDER BY t.created_at DESC
""")
for row in cur.fetchall():
    print(dict(row))

# Task events schema
print("\n=== TASK_EVENT COLUMNS ===")
cur.execute("PRAGMA table_info(task_event)")
for row in cur.fetchall():
    print(dict(row))

# Task events for this project
print("\n=== TASK EVENTS FOR ANYDISCUSSION ===")
cur.execute("""
    SELECT te.task_id, te.event_type, te.summary, te.created_at
    FROM task_event te
    JOIN task t ON te.task_id = t.id
    JOIN session s ON t.session_id = s.id
    WHERE s.project_id = 'ea068934-db62-4a6c-acc3-88ed2057fc33'
    ORDER BY te.created_at DESC
    LIMIT 30
""")
for row in cur.fetchall():
    print(dict(row))

conn.close()
