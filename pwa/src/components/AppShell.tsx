interface Props {
  title: string;
  subtitle: string;
}

export function AppShell({ title, subtitle }: Props) {
  return (
    <div className="app-shell">
      <aside className="shell-sidebar">
        <div className="shell-logo">{title}</div>
        <p className="shell-modules-placeholder">Modules: none loaded</p>
      </aside>
      <main className="shell-content">
        <p>{subtitle}</p>
      </main>
    </div>
  );
}
