import { useState, useEffect } from 'react';
import { PermitCard } from '@/components/PermitCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useWorkPermits } from '@/hooks/useWorkPermits';
import { useDeleteWorkPermit } from '@/hooks/useDeleteWorkPermit';
import { AdminDeleteDialog } from '@/components/AdminDeleteDialog';
import { PermitStatus, statusLabels } from '@/types/workPermit';
import { Search, Filter, Plus, LayoutGrid, List, Loader2 } from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface PermitsListProps {
  currentRole: string;
}

export default function PermitsList({ currentRole }: PermitsListProps) {
  const navigate = useNavigate();
  const { roles } = useAuth();
  const isAdmin = roles.includes('admin');
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<PermitStatus | 'all' | 'pending'>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  
  const { data: permits, isLoading, error } = useWorkPermits();
  const deletePermit = useDeleteWorkPermit();

  // Initialize filter from URL params
  useEffect(() => {
    const statusParam = searchParams.get('status');
    if (statusParam === 'pending' || statusParam === 'approved' || statusParam === 'rejected' || statusParam === 'closed') {
      setStatusFilter(statusParam);
    }
  }, [searchParams]);

  // Update URL when filter changes
  const handleStatusChange = (value: string) => {
    setStatusFilter(value as PermitStatus | 'all' | 'pending');
    if (value === 'all') {
      searchParams.delete('status');
    } else {
      searchParams.set('status', value);
    }
    setSearchParams(searchParams);
  };

  const filteredPermits = (permits || []).filter((permit) => {
    const matchesSearch =
      permit.permit_no.toLowerCase().includes(searchQuery.toLowerCase()) ||
      permit.contractor_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      permit.work_description.toLowerCase().includes(searchQuery.toLowerCase());

    let matchesStatus = false;
    if (statusFilter === 'all') {
      matchesStatus = true;
    } else if (statusFilter === 'pending') {
      matchesStatus = permit.status.startsWith('pending') || 
                      permit.status === 'submitted' || 
                      permit.status === 'under_review';
    } else {
      matchesStatus = permit.status === statusFilter;
    }

    return matchesSearch && matchesStatus;
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-destructive">Failed to load permits</p>
      </div>
    );
  }

  const statusOptions: (PermitStatus | 'all' | 'pending')[] = [
    'all',
    'pending',
    'draft',
    'submitted',
    'under_review',
    'pending_pm',
    'pending_it',
    'approved',
    'rejected',
    'closed',
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-display font-bold">
            {currentRole === 'contractor' ? 'My Permits' : 'All Permits'}
          </h1>
          <p className="text-muted-foreground mt-1">
            {filteredPermits.length} permit{filteredPermits.length !== 1 ? 's' : ''} found
          </p>
        </div>
        {currentRole === 'contractor' && (
          <Button asChild className="bg-accent text-accent-foreground hover:bg-accent/90">
            <Link to="/new-permit">
              <Plus className="w-4 h-4 mr-2" />
              New Permit
            </Link>
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search permits..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select
          value={statusFilter}
          onValueChange={handleStatusChange}
        >
          <SelectTrigger className="w-full sm:w-48">
            <Filter className="w-4 h-4 mr-2" />
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="pending">All Pending</SelectItem>
            {statusOptions.slice(2).map((status) => (
              <SelectItem key={status} value={status}>
                {statusLabels[status as PermitStatus]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex border rounded-lg p-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setViewMode('grid')}
            className={cn(
              'px-3',
              viewMode === 'grid' && 'bg-muted'
            )}
          >
            <LayoutGrid className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setViewMode('list')}
            className={cn(
              'px-3',
              viewMode === 'list' && 'bg-muted'
            )}
          >
            <List className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Permits Grid/List */}
      {filteredPermits.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">No permits found matching your criteria.</p>
        </div>
      ) : (
        <div
          className={cn(
            viewMode === 'grid'
              ? 'grid gap-4 sm:grid-cols-2 lg:grid-cols-3'
              : 'space-y-3'
          )}
        >
        {filteredPermits.map((permit) => (
            <div key={permit.id} className="relative">
              <PermitCard
                permit={{
                  id: permit.id,
                  permitNo: permit.permit_no,
                  status: permit.status as PermitStatus,
                  contractorName: permit.contractor_name,
                  workDescription: permit.work_description,
                  workTypeName: permit.work_types?.name || 'General',
                  workDateFrom: permit.work_date_from,
                  workDateTo: permit.work_date_to,
                  createdAt: permit.created_at,
                  unit: permit.unit,
                  floor: permit.floor,
                  workLocation: permit.work_location,
                  workTimeFrom: permit.work_time_from,
                  workTimeTo: permit.work_time_to,
                  attachments: permit.attachments || [],
                }}
                onClick={() => navigate(`/permits/${permit.id}`)}
              />
              {isAdmin && (
                <div className="absolute top-2 right-2 z-10" onClick={e => e.stopPropagation()}>
                  <AdminDeleteDialog
                    title="Delete Work Permit"
                    description={`Are you sure you want to delete permit ${permit.permit_no}? This action cannot be undone.`}
                    onConfirm={() => deletePermit.mutate(permit.id)}
                    isPending={deletePermit.isPending}
                    variant="icon"
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}
