import { IconName, MenuIcon } from "./menu-icon";
import type { Trend } from "./lib/dashboard-metrics";

export function StatCard({ label, value, trend, onClick }: { label: string; value: string | number; trend?: Trend; onClick?: () => void }) {
  const body = <>
    <span className="dhv2-stat-label">{label}</span>
    <strong className="dhv2-stat-value">{value}</strong>
    {trend && <span className={`dhv2-stat-trend dhv2-stat-trend-${trend.direction}`}>
      <MenuIcon name={trend.direction === "up" ? "trending-up" : "trending-down"} />{trend.delta} <small>{trend.caption}</small>
    </span>}
  </>;
  return onClick
    ? <button type="button" className="card dhv2-stat-card" onClick={onClick}>{body}</button>
    : <article className="card dhv2-stat-card">{body}</article>;
}

export type ListRowTrailing = { type: "check"; onClick: () => void } | { type: "pill"; label: string };

export type ListRowProps = { icon: IconName; iconColor: string; title: string; subtitle?: string; trailing?: ListRowTrailing };

export function ListRow({ icon, iconColor, title, subtitle, trailing }: ListRowProps) {
  return <div className="dhv2-list-row">
    <span className="dhv2-list-icon" style={{ color: iconColor }}><MenuIcon name={icon} /></span>
    <span className="dhv2-list-copy"><strong>{title}</strong>{subtitle && <small>{subtitle}</small>}</span>
    {trailing?.type === "check" && <button type="button" className="dhv2-list-check" onClick={trailing.onClick} aria-label="Approve">✓</button>}
    {trailing?.type === "pill" && <span className="dhv2-list-pill">{trailing.label}</span>}
  </div>;
}

export function ListCard({ title, count, action, rows, emptyLabel = "Nothing here yet" }: { title: string; count?: number; action?: { label: string; onClick: () => void }; rows: ListRowProps[]; emptyLabel?: string }) {
  return <article className="card dhv2-list-card">
    <div className="dhv2-list-head">
      <h2>{title}{typeof count === "number" && <span className="dhv2-list-count">{count}</span>}</h2>
      {action && <button type="button" className="dhv2-list-action" onClick={action.onClick}>{action.label} <span aria-hidden="true">›</span></button>}
    </div>
    {rows.length ? <div className="dhv2-list-rows">{rows.map((row, index) => <ListRow key={index} {...row} />)}</div> : <p className="dhv2-list-empty">{emptyLabel}</p>}
  </article>;
}

const quickActionColors = { blue: "var(--viz-blue)", orange: "var(--viz-orange-strong)", purple: "var(--viz-purple-strong)", slate: "var(--viz-slate)", red: "var(--viz-red-strong)" } as const;

export type QuickActionColor = keyof typeof quickActionColors;

export function QuickActionsGrid({ items }: { items: { label: string; icon: IconName; color: QuickActionColor; onClick: () => void }[] }) {
  return <div className="dhv2-quick-grid">
    {items.map((item) => <button type="button" key={item.label} className="dhv2-quick-item" style={{ color: quickActionColors[item.color] }} onClick={item.onClick}>
      <MenuIcon name={item.icon} /><span>{item.label}</span>
    </button>)}
  </div>;
}
