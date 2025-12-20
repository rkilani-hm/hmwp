import { WorkPermit } from '@/types/workPermit';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar, MapPin, User, Clock, ChevronRight, Building2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

interface PermitCardProps {
  permit: WorkPermit;
  onClick?: () => void;
  className?: string;
}

export function PermitCard({ permit, onClick, className }: PermitCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      <Card
        className={cn(
          'group cursor-pointer transition-all hover:shadow-card-hover hover:border-accent/30',
          className
        )}
        onClick={onClick}
      >
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1 min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-display font-semibold text-base">{permit.permitNo}</span>
                <StatusBadge status={permit.status} />
              </div>
              <p className="text-sm text-muted-foreground truncate">{permit.workTypeName}</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm line-clamp-2">{permit.workDescription}</p>
          
          <div className="grid grid-cols-2 gap-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <User className="h-3.5 w-3.5" />
              <span className="truncate">{permit.contractorName}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5" />
              <span>{permit.unit}, Floor {permit.floor}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5" />
              <span className="truncate">{permit.workLocation}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5" />
              <span>{permit.workDateFrom}</span>
            </div>
          </div>

          <div className="pt-2 border-t flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              <span>{permit.workTimeFrom} - {permit.workTimeTo}</span>
            </div>
            {permit.attachments.length > 0 && (
              <span className="text-xs bg-muted px-2 py-0.5 rounded-full">
                {permit.attachments.length} file{permit.attachments.length > 1 ? 's' : ''}
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
