import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';

interface StatsCardProps {
  title: string;
  value: number | string;
  icon: LucideIcon;
  trend?: {
    value: number;
    positive: boolean;
  };
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'destructive';
  className?: string;
  href?: string;
}

export function StatsCard({
  title,
  value,
  icon: Icon,
  trend,
  variant = 'default',
  className,
  href,
}: StatsCardProps) {
  const variants = {
    default: 'bg-card',
    primary: 'bg-primary/5 border-primary/20',
    success: 'bg-success/5 border-success/20',
    warning: 'bg-warning/5 border-warning/20',
    destructive: 'bg-destructive/5 border-destructive/20',
  };

  const iconVariants = {
    default: 'bg-muted text-muted-foreground',
    primary: 'bg-primary/10 text-primary',
    success: 'bg-success/10 text-success',
    warning: 'bg-warning/10 text-warning',
    destructive: 'bg-destructive/10 text-destructive',
  };

  const content = (
    <div className="flex items-start justify-between">
      <div className="space-y-2">
        <p className="text-sm font-medium text-muted-foreground">{title}</p>
        <p className="text-3xl font-display font-bold tracking-tight">{value}</p>
        {trend && (
          <p
            className={cn(
              'text-xs font-medium',
              trend.positive ? 'text-success' : 'text-destructive'
            )}
          >
            {trend.positive ? '+' : '-'}{Math.abs(trend.value)}% from last month
          </p>
        )}
      </div>
      <div className={cn('rounded-lg p-2.5', iconVariants[variant])}>
        <Icon className="h-5 w-5" />
      </div>
    </div>
  );

  const cardClasses = cn(
    'relative overflow-hidden rounded-xl border p-5 shadow-card transition-all',
    variants[variant],
    href && 'cursor-pointer hover:shadow-card-hover hover:scale-[1.02]',
    !href && 'hover:shadow-card-hover',
    className
  );

  if (href) {
    return (
      <Link to={href} className={cardClasses}>
        {content}
      </Link>
    );
  }

  return (
    <div className={cardClasses}>
      {content}
    </div>
  );
}
