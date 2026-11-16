import type { ButtonHTMLAttributes } from 'react';
import type { LucideIcon } from 'lucide-react';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  icon?: LucideIcon;
};

export default function Button({
  variant = 'secondary',
  icon: Icon,
  type = 'button',
  className = '',
  children,
  ...props
}: Props) {
  return (
    <button
      {...props}
      type={type}
      className={`ui-button ui-button--${variant} ${Icon && children == null ? 'ui-button--icon' : ''} ${variant === 'primary' ? 'primary-action' : variant === 'danger' ? 'danger-button' : ''} ${className}`}
    >
      {Icon && <Icon aria-hidden="true" />}
      {children}
    </button>
  );
}
