export default function EventsPage() {
  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", margin: "0 0 8px" }}>
        Event Log
      </h1>
      <p style={{ fontSize: 12, color: "var(--text-muted)" }}>
        Append-only Postgres event log — wired in Slice 4.
      </p>
    </div>
  );
}