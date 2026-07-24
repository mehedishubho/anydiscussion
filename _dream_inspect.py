import sqlite3
import json

DB = r'C:\Users\USER\.local\share\mimocode\mimocode.db'
conn = sqlite3.connect(DB)
conn.row_factory = sqlite3.Row
cur = conn.cursor()

# List tables
cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
tables = [r[0] for r in cur.fetchall()]
print("=== TABLES ===")
print(tables)

# List sessions for this project (looking for anydiscussion)
print("\n=== ALL SESSIONS (newest first) ===")
try:
    cur.execute("SELECT id, project_id, directory, title, time_created FROM session ORDER BY time_created DESC LIMIT 20")
    for row in cur.fetchall():
        print(dict(row))
except Exception as e:
    print(f"Error reading session table: {e}")

# Check message count per session
print("\n=== MESSAGE COUNTS PER SESSION ===")
try:
    cur.execute("""
        SELECT m.session_id, COUNT(*) as cnt, MIN(m.time_created) as first_msg, MAX(m.time_created) as last_msg
        FROM message m
        GROUP BY m.session_id
        ORDER BY last_msg DESC
        LIMIT 20
    """)
    for row in cur.fetchall():
        print(dict(row))
except Exception as e:
    print(f"Error reading message table: {e}")

# Check task table
print("\n=== TASKS ===")
try:
    cur.execute("SELECT id, session_id, status, title, time_created FROM task ORDER BY time_created DESC LIMIT 20")
    for row in cur.fetchall():
        print(dict(row))
except Exception as e:
    print(f"Error reading task table: {e}")

# Check actor_registry
print("\n=== ACTOR REGISTRY ===")
try:
    cur.execute("SELECT * FROM actor_registry ORDER BY rowid DESC LIMIT 10")
    for row in cur.fetchall():
        print(dict(row))
except Exception as e:
    print(f"Error reading actor_registry: {e}")

conn.close()
