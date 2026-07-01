// Dependency-free, server-safe structured log wrapper (D-17).
// NO "use client" directive — must be safe for Server Components.
// Swappable to pino later (Phase 7) — keep the interface minimal.

type LogContext = Record<string, unknown>;

export const log = {
  info(msg: string, ctx?: LogContext): void {
    console.info(JSON.stringify({ level: "info", msg, ...ctx }));
  },

  error(msg: string, ctx?: LogContext): void {
    console.error(JSON.stringify({ level: "error", msg, ...ctx }));
  },
};
