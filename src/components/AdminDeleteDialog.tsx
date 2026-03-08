import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Trash2, Archive, RotateCcw, Loader2 } from 'lucide-react';

interface AdminDeleteDialogProps {
  title?: string;
  description?: string;
  onConfirm: () => void;
  isPending?: boolean;
  variant?: 'button' | 'icon';
  size?: 'sm' | 'default';
  actionLabel?: string;
  actionIcon?: 'delete' | 'archive' | 'restore';
  destructive?: boolean;
}

export function AdminDeleteDialog({
  title = 'Delete Record',
  description = 'Are you sure you want to delete this record? This action cannot be undone.',
  onConfirm,
  isPending = false,
  variant = 'button',
  size = 'sm',
  actionLabel = 'Delete Permanently',
  actionIcon = 'delete',
  destructive = true,
}: AdminDeleteDialogProps) {
  const [open, setOpen] = useState(false);

  const IconComponent = actionIcon === 'archive' ? Archive : actionIcon === 'restore' ? RotateCcw : Trash2;

  const handleConfirm = () => {
    onConfirm();
    setOpen(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        {variant === 'icon' ? (
          <Button
            size="sm"
            variant="ghost"
            className={destructive 
              ? "text-destructive hover:text-destructive hover:bg-destructive/10" 
              : "text-muted-foreground hover:text-foreground hover:bg-muted"}
            disabled={isPending}
          >
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <IconComponent className="h-4 w-4" />}
          </Button>
        ) : (
          <Button
            size={size}
            variant="outline"
            className={destructive
              ? "border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground"
              : ""}
            disabled={isPending}
          >
            {isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <IconComponent className="w-4 h-4 mr-2" />}
            {actionLabel}
          </Button>
        )}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            className={destructive 
              ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
              : ""}
          >
            {actionLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
