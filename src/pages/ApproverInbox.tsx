import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePendingPermitsForApprover, WorkPermit } from '@/hooks/useWorkPermits';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Inbox,
  Search,
  Clock,
  AlertTriangle,
  Eye,
  Loader2,
  Timer,
  Building2,
  Calendar,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { formatDistanceToNow, isPast, parseISO, format } from 'date-fns';
import { cn } from '@/lib/utils';

export default function ApproverInbox() {
  const navigate = useNavigate();
  const { data: permits, isLoading } = usePendingPermitsForApprover();
  const [searchTerm, setSearchTerm] = useState('');
  const [urgencyFilter, setUrgencyFilter] = useState<string>('all');

  const filteredPermits = (permits || []).filter(permit => {
    const matchesSearch = 
      permit.permit_no.toLowerCase().includes(searchTerm.toLowerCase()) ||
      permit.contractor_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      permit.work_description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      permit.unit.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesUrgency = urgencyFilter === 'all' || permit.urgency === urgencyFilter;
    
    return matchesSearch && matchesUrgency;
  });

  const getSLAStatus = (permit: WorkPermit) => {
    if (!permit.sla_deadline) return null;
    const deadline = parseISO(permit.sla_deadline);
    const isOverdue = isPast(deadline);
    const timeLeft = formatDistanceToNow(deadline, { addSuffix: true });
    return { isOverdue, timeLeft, deadline };
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold flex items-center gap-2">
            <Inbox className="w-7 h-7" />
            Approver Inbox
          </h1>
          <p className="text-muted-foreground">
            {filteredPermits.length} permit{filteredPermits.length !== 1 ? 's' : ''} awaiting your review
          </p>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4 md:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search permits..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={urgencyFilter} onValueChange={setUrgencyFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by urgency" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Urgencies</SelectItem>
                <SelectItem value="urgent">Urgent Only</SelectItem>
                <SelectItem value="normal">Normal Only</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Permits List */}
      {filteredPermits.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
              <Inbox className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium mb-2">No pending approvals</h3>
            <p className="text-muted-foreground text-center max-w-md">
              You're all caught up! There are no work permits waiting for your review.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredPermits.map((permit, index) => {
            const slaStatus = getSLAStatus(permit);
            
            return (
              <motion.div
                key={permit.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <Card 
                  className={cn(
                    "cursor-pointer transition-all hover:shadow-md",
                    permit.urgency === 'urgent' && "border-l-4 border-l-destructive",
                    slaStatus?.isOverdue && "bg-destructive/5"
                  )}
                  onClick={() => navigate(`/permits/${permit.id}`)}
                >
                  <CardContent className="p-6">
                    <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                      {/* Main Info */}
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-3 flex-wrap">
                          <h3 className="font-semibold text-lg">{permit.permit_no}</h3>
                          <StatusBadge status={permit.status as any} />
                          {permit.urgency === 'urgent' && (
                            <Badge variant="destructive" className="flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" />
                              URGENT
                            </Badge>
                          )}
                          {slaStatus?.isOverdue && (
                            <Badge variant="outline" className="text-destructive border-destructive flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              SLA BREACHED
                            </Badge>
                          )}
                        </div>
                        
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {permit.work_description}
                        </p>
                        
                        <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Building2 className="w-4 h-4" />
                            {permit.contractor_name}
                          </span>
                          <span className="flex items-center gap-1">
                            <Calendar className="w-4 h-4" />
                            {format(new Date(permit.work_date_from), 'MMM d, yyyy')}
                          </span>
                          <span>Unit: {permit.unit}, Floor: {permit.floor}</span>
                        </div>
                      </div>

                      {/* SLA Timer */}
                      <div className="flex flex-col items-end gap-2">
                        {slaStatus && (
                          <div className={cn(
                            "flex items-center gap-2 px-3 py-2 rounded-lg",
                            slaStatus.isOverdue 
                              ? "bg-destructive/10 text-destructive" 
                              : "bg-muted"
                          )}>
                            <Timer className="w-4 h-4" />
                            <div className="text-right">
                              <p className="text-xs font-medium">
                                {slaStatus.isOverdue ? 'Overdue' : 'Due'}
                              </p>
                              <p className="text-sm font-semibold">
                                {slaStatus.timeLeft}
                              </p>
                            </div>
                          </div>
                        )}
                        
                        <Button size="sm" className="gap-2">
                          <Eye className="w-4 h-4" />
                          Review
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Stats Summary */}
      {filteredPermits.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-4 bg-muted rounded-lg">
                <p className="text-2xl font-bold">{filteredPermits.length}</p>
                <p className="text-sm text-muted-foreground">Total Pending</p>
              </div>
              <div className="text-center p-4 bg-destructive/10 rounded-lg">
                <p className="text-2xl font-bold text-destructive">
                  {filteredPermits.filter(p => p.urgency === 'urgent').length}
                </p>
                <p className="text-sm text-muted-foreground">Urgent</p>
              </div>
              <div className="text-center p-4 bg-destructive/10 rounded-lg">
                <p className="text-2xl font-bold text-destructive">
                  {filteredPermits.filter(p => p.sla_breached).length}
                </p>
                <p className="text-sm text-muted-foreground">SLA Breached</p>
              </div>
              <div className="text-center p-4 bg-muted rounded-lg">
                <p className="text-2xl font-bold">
                  {filteredPermits.filter(p => p.sla_deadline && !isPast(parseISO(p.sla_deadline))).length}
                </p>
                <p className="text-sm text-muted-foreground">On Track</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
