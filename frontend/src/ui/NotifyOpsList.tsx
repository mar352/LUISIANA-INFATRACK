import { formatAlertWhen, type OpsAlert } from "../lib/ops-alerts";

type Props = {
  alerts: OpsAlert[];
  formatAgo?: (iso: string) => string;
  onOpen: (alert: OpsAlert) => void;
  onDismiss: (id: string) => void;
  onClearAll: () => void;
};

export function NotifyOpsList({ alerts, onOpen, onDismiss, onClearAll }: Props) {
  return (
    <div style={{ marginTop: 16 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          marginBottom: 8,
        }}
      >
        <div className="sectionTitle" style={{ margin: 0 }}>
          Project &amp; schedule alerts
        </div>
        {alerts.length > 0 && (
          <button type="button" className="side-btn" onClick={onClearAll}>
            Clear
          </button>
        )}
      </div>
      <p style={{ margin: "0 0 10px", fontSize: 12, color: "var(--muted)", lineHeight: 1.45 }}>
        Deadlines, budget 90%+, delayed work, upcoming meetings, and maintenance.
      </p>
      {alerts.length ? (
        <div className="miniList">
          {alerts.map((n) => (
            <div
              key={n.id}
              className={`alert notice-card notice-${n.kind}`}
              role="button"
              tabIndex={0}
              onClick={() => onOpen(n)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onOpen(n);
                }
              }}
            >
              <div className="t">{n.title}</div>
              <div className="m">{n.message}</div>
              <div className="meta">
                {formatAlertWhen(n.at)} · Open {n.open === "planning" ? "Planning" : "Projects"}
                <button
                  type="button"
                  className="notice-dismiss"
                  aria-label="Dismiss alert"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDismiss(n.id);
                  }}
                >
                  ×
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card" style={{ color: "var(--muted)", fontSize: 13 }}>
          No deadline, budget, delay, meeting, or maintenance alerts.
        </div>
      )}
    </div>
  );
}
