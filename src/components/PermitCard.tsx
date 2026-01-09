import { PermitStatus } from '@/types/workPermit';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar, MapPin, User, Clock, ChevronRight, Building2, Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';

export interface PermitCardData {
  id: string;
  permitNo: string;
  status: PermitStatus;
  contractorName: string;
  workDescription: string;
  workTypeName: string;
  workDateFrom: string;
  workDateTo: string;
  createdAt: string;
  unit?: string;
  floor?: string;
  workLocation?: string;
  workTimeFrom?: string;
  workTimeTo?: string;
  attachments?: string[];
  reworkVersion?: number | null;
}

interface PermitCardProps {
  permit: PermitCardData;
  onClick?: () => void;
  className?: string;
}

export function PermitCard({ permit, onClick, className }: PermitCardProps) {
  const navigate = useNavigate();
  const isReworkNeeded = permit.status === 'rework_needed';

  const handleEditClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigate(`/permits/${permit.id}/edit`);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      <Card
        className={cn(
          'group cursor-pointer transition-all hover:shadow-card-hover hover:border-accent/30',
          isReworkNeeded && 'border-orange-500/50 bg-orange-500/5',
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
                {permit.reworkVersion && permit.reworkVersion > 0 && (
                  <span className="text-xs bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 px-1.5 py-0.5 rounded font-medium">
                    V{permit.reworkVersion + 1}
                  </span>
                )}
              </div>
              <p className="text-sm text-muted-foreground truncate">{permit.workTypeName}</p>
            </div>
            <div className="flex items-center gap-1">
              {isReworkNeeded && (
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0 border-orange-500 text-orange-600 hover:bg-orange-500 hover:text-white"
                  onClick={handleEditClick}
                >
                  <Pencil className="h-3.5 w-3.5 mr-1.5" />
                  Edit
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm line-clamp-2">{permit.workDescription}</p>
          
          <div className="grid grid-cols-2 gap-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <User className="h-3.5 w-3.5" />
              <span className="truncate">{permit.contractorName}</span>
            </div>
            {permit.unit && permit.floor && (
              <div className="flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5" />
                <span>{permit.unit}, Floor {permit.floor}</span>
              </div>
            )}
            {permit.workLocation && (
              <div className="flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" />
                <span className="truncate">{permit.workLocation}</span>
              </div>
            )}
            <div className="flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5" />
              <span>{permit.workDateFrom}</span>
            </div>
          </div>

          {(permit.workTimeFrom || (permit.attachments && permit.attachments.length > 0)) && (
            <div className="pt-2 border-t flex items-center justify-between">
              {permit.workTimeFrom && permit.workTimeTo && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" />
                  <span>{permit.workTimeFrom} - {permit.workTimeTo}</span>
                </div>
              )}
              {permit.attachments && permit.attachments.length > 0 && (
                <span className="text-xs bg-muted px-2 py-0.5 rounded-full">
                  {permit.attachments.length} file{permit.attachments.length > 1 ? 's' : ''}
                </span>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
