import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useProcessedPermitsForApprover } from '@/hooks/useWorkPermits';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { PermitStatus } from '@/types/workPermit';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Search,
  FileText,
  Calendar,
  MapPin,
  Clock,
  User,
  CheckCircle,
  XCircle,
  RotateCcw,
  Forward,
  Send,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { formatDistanceToNow, format } from 'date-fns';
import { cn } from '@/lib/utils';

const actionLabels: Record<string, { label: string; icon: typeof CheckCircle; color: string }> = {
  approved: { label: 'Approved', icon: CheckCircle, color: 'text-green-500' },
  rejected: { label: 'Rejected', icon: XCircle, color: 'text-red-500' },
  forwarded: { label: 'Forwarded', icon: Forward, color: 'text-blue-500' },
  rework: { label: 'Sent for Rework', icon: RotateCcw, color: 'text-amber-500' },
};

export default function ApproverOutbox() {
  const navigate = useNavigate();
  const { roles, profile } = useAuth();
  const { data: permits, isLoading, error } = useProcessedPermitsForApprover();
  const [searchQuery, setSearchQuery] = useState('');
  const [actionFilter, setActionFilter] = useState<string>('all');

  const filteredPermits = (permits || []).filter(permit => {
    const matchesSearch = 
      permit.permit_no?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      permit.work_description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      permit.contractor_name?.toLowerCase().includes(searchQuery.toLowerCase());
    
    if (actionFilter === 'all') return matchesSearch;
    
    // Filter by action type based on the approver's action
    const userAction = permit.userAction;
    return matchesSearch && userAction === actionFilter;
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-destructive">Error loading outbox permits</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold tracking-tight">Outbox</h1>
          <p className="text-muted-foreground">
            Permits you have processed ({filteredPermits.length})
          </p>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col gap-4 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search permits..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={actionFilter} onValueChange={setActionFilter}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="Filter by action" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Actions</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
                <SelectItem value="forwarded">Forwarded</SelectItem>
                <SelectItem value="rework">Sent for Rework</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Permits List */}
      {filteredPermits.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Send className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">No processed permits</h3>
            <p className="text-muted-foreground">
              Permits you approve, reject, forward, or send for rework will appear here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {filteredPermits.map((permit, index) => {
            const actionInfo = actionLabels[permit.userAction || 'approved'];
            const ActionIcon = actionInfo?.icon || CheckCircle;
            
            return (
              <motion.div
                key={permit.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <Card 
                  className="hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => navigate(`/permits/${permit.id}`)}
                >
                  <CardContent className="p-6">
                    <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                      {/* Permit Info */}
                      <div className="flex-1 space-y-3">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                              <FileText className="w-5 h-5 text-primary" />
                            </div>
                            <div>
                              <h3 className="font-semibold">{permit.permit_no}</h3>
                              <p className="text-sm text-muted-foreground line-clamp-1">
                                {permit.work_description}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <StatusBadge status={permit.status as PermitStatus} />
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                          <div className="flex items-center gap-1.5">
                            <User className="w-4 h-4" />
                            <span>{permit.contractor_name}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <MapPin className="w-4 h-4" />
                            <span>{permit.unit}, {permit.floor}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Calendar className="w-4 h-4" />
                            <span>
                              {format(new Date(permit.work_date_from), 'MMM d')} - {format(new Date(permit.work_date_to), 'MMM d, yyyy')}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Action Taken */}
                      <div className="flex items-center gap-4 lg:border-l lg:pl-4">
                        <div className="flex items-center gap-2">
                          <div className={cn(
                            "w-8 h-8 rounded-full flex items-center justify-center",
                            permit.userAction === 'approved' && "bg-green-500/10",
                            permit.userAction === 'rejected' && "bg-red-500/10",
                            permit.userAction === 'forwarded' && "bg-blue-500/10",
                            permit.userAction === 'rework' && "bg-amber-500/10"
                          )}>
                            <ActionIcon className={cn("w-4 h-4", actionInfo?.color)} />
                          </div>
                          <div>
                            <p className="text-sm font-medium">{actionInfo?.label}</p>
                            <p className="text-xs text-muted-foreground">
                              {permit.actionDate 
                                ? formatDistanceToNow(new Date(permit.actionDate), { addSuffix: true })
                                : 'Recently'}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
