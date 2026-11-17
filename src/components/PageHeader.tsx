import type { ReactNode } from 'react';

/** Main workspace pages share one title row, independent of supporting copy. */
export default function PageHeader({
  title,
  description,
  actions,
  children,
  className = '',
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <header className={`page-header ${className}`}>
      <div className="page-header-row">
        <h1 className="page-header-title">{title}</h1>
        {actions && <div className="page-header-actions">{actions}</div>}
      </div>
      {description && <p className="page-header-description">{description}</p>}
      {children}
    </header>
  );
}
