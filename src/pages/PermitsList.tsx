import { useState, useEffect, useMemo } from 'react';
import { PermitCard } from '@/components/PermitCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useWorkPermits } from '@/hooks/useWorkPermits';
import {
  useArchiveWorkPermit,
  useRestoreWorkPermit,
  useHardDeleteWorkPermit,
  useBulkArchiveWorkPermits,
  useBulkHardDeleteWorkPermits,
} from '@/hooks/useDeleteWorkPermit';
import { AdminDeleteDialog } from '@/components/AdminDeleteDialog';
import { PermitStatus, statusLabels } from '@/types/workPermit';
import { Search, Filter, Plus, LayoutGrid, List, Loader2, Archive, Trash2, RotateCcw, Download } from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { downloadCsv, timestampedFilename } from '@/utils/csvExport';

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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const { data: permits, isLoading, error } = useWorkPermits();
  const archivePermit = useArchiveWorkPermit();
  const restorePermit = useRestoreWorkPermit();
  const hardDeletePermit = useHardDeleteWorkPermit();
  const bulkArchive = useBulkArchiveWorkPermits();
  const bulkHardDelete = useBulkHardDeleteWorkPermits();

  // Initialize filter from URL params
  useEffect(() => {
    const statusParam = searchParams.get('status');
    if (statusParam === 'pending' || statusParam === 'approved' || statusParam === 'rejected' || statusParam === 'closed') {
      setStatusFilter(statusParam);
    }
  }, [searchParams]);

  const handleStatusChange = (value: string) => {
    setStatusFilter(value as PermitStatus | 'all' | 'pending');
    if (value === 'all') {
      searchParams.delete('status');
    } else {
      searchParams.set('status', value);
    }
    setSearchParams(searchParams);
  };

  const { activePermits, archivedPermits } = useMemo(() => {
    const all = permits || [];
    const active = all.filter((p: any) => !p.is_archived);
    const archived = all.filter((p: any) => p.is_archived);
    return { activePermits: active, archivedPermits: archived };
  }, [permits]);

  const filterPermits = (list: any[]) => {
    return list.filter((permit) => {
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
  };

  const filteredActive = filterPermits(activePermits);
  const filteredArchived = filterPermits(archivedPermits);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = (list: any[]) => {
    const ids = list.map(p => p.id);
    const allSelected = ids.every(id => selectedIds.has(id));
    setSelectedIds(prev => {
      const next = new Set(prev);
      ids.forEach(id => allSelected ? next.delete(id) : next.add(id));
      return next;
    });
  };

  const getSelectedPermits = (list: any[]) =>
    list.filter(p => selectedIds.has(p.id)).map(p => ({
      id: p.id,
      permit_no: p.permit_no,
      requester_name: p.requester_name || p.contractor_name,
    }));

  const handleBulkArchive = (list: any[]) => {
    const selected = getSelectedPermits(list);
    bulkArchive.mutate(selected, { onSuccess: () => setSelectedIds(new Set()) });
  };

  const handleBulkHardDelete = (list: any[]) => {
    const selected = getSelectedPermits(list);
    bulkHardDelete.mutate(selected, { onSuccess: () => setSelectedIds(new Set()) });
  };

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
    'all', 'pending', 'draft', 'submitted', 'under_review',
    'pending_pm', 'pending_it', 'approved', 'rejected', 'closed',
  ];

  const renderPermitGrid = (list: any[], isArchivedView = false) => {
    if (list.length === 0) {
      return (
        <div className="text-center py-12">
          <p className="text-muted-foreground">
            {isArchivedView ? 'No archived permits.' : 'No permits found matching your criteria.'}
          </p>
        </div>
      );
    }

    return (
      <>
        {/* Bulk actions bar */}
        {isAdmin && selectedIds.size > 0 && (
          <div className="flex items-center gap-3 p-3 bg-muted rounded-lg mb-4">
            <span className="text-sm font-medium">{selectedIds.size} selected</span>
            {!isArchivedView && (
              <AdminDeleteDialog
                title="Archive Selected Permits"
                description={`Are you sure you want to archive ${selectedIds.size} permit(s)? They can be restored later.`}
                onConfirm={() => handleBulkArchive(list)}
                isPending={bulkArchive.isPending}
                actionLabel={`Archive ${selectedIds.size} Selected`}
                actionIcon="archive"
                destructive={false}
              />
            )}
            {isArchivedView && (
              <AdminDeleteDialog
                title="Permanently Delete Selected"
                description={`Are you sure you want to permanently delete ${selectedIds.size} permit(s)? This action cannot be undone.`}
                onConfirm={() => handleBulkHardDelete(list)}
                isPending={bulkHardDelete.isPending}
                actionLabel={`Delete ${selectedIds.size} Permanently`}
                actionIcon="delete"
              />
            )}
            <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
              Clear Selection
            </Button>
          </div>
        )}

        {/* Select All */}
        {isAdmin && list.length > 0 && (
          <div className="flex items-center gap-2 mb-3">
            <Checkbox
              checked={list.every(p => selectedIds.has(p.id))}
              onCheckedChange={() => toggleSelectAll(list)}
            />
            <span className="text-sm text-muted-foreground">Select All</span>
          </div>
        )}

        <div
          className={cn(
            viewMode === 'grid'
              ? 'grid gap-4 sm:grid-cols-2 lg:grid-cols-3'
              : 'space-y-3'
          )}
        >
          {list.map((permit: any) => (
            <div key={permit.id} className="relative">
              {isAdmin && (
                <div className="absolute top-2 left-2 z-10" onClick={e => e.stopPropagation()}>
                  <Checkbox
                    checked={selectedIds.has(permit.id)}
                    onCheckedChange={() => toggleSelect(permit.id)}
                  />
                </div>
              )}
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
                <div className="absolute top-2 right-2 z-10 flex gap-1" onClick={e => e.stopPropagation()}>
                  {!isArchivedView ? (
                    <AdminDeleteDialog
                      title="Archive Work Permit"
                      description={`Archive permit ${permit.permit_no}? It can be restored later.`}
                      onConfirm={() => archivePermit.mutate({
                        id: permit.id,
                        permit_no: permit.permit_no,
                        requester_name: permit.requester_name || permit.contractor_name,
                      })}
                      isPending={archivePermit.isPending}
                      variant="icon"
                      actionIcon="archive"
                      destructive={false}
                    />
                  ) : (
                    <>
                      <AdminDeleteDialog
                        title="Restore Work Permit"
                        description={`Restore permit ${permit.permit_no} back to active?`}
                        onConfirm={() => restorePermit.mutate({
                          id: permit.id,
                          permit_no: permit.permit_no,
                          requester_name: permit.requester_name || permit.contractor_name,
                        })}
                        isPending={restorePermit.isPending}
                        variant="icon"
                        actionLabel="Restore"
                        actionIcon="restore"
                        destructive={false}
                      />
                      <AdminDeleteDialog
                        title="Permanently Delete"
                        description={`Permanently delete permit ${permit.permit_no}? This cannot be undone.`}
                        onConfirm={() => hardDeletePermit.mutate({
                          id: permit.id,
                          permit_no: permit.permit_no,
                          requester_name: permit.requester_name || permit.contractor_name,
                        })}
                        isPending={hardDeletePermit.isPending}
                        variant="icon"
                        actionIcon="delete"
                      />
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </>
    );
  };

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
            {currentRole === 'tenant' ? 'My Permits' : 'All Permits'}
          </h1>
          <p className="text-muted-foreground mt-1">
            {filteredActive.length} active permit{filteredActive.length !== 1 ? 's' : ''}
          </p>
        </div>
        {currentRole === 'tenant' && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => {
                const rows = filteredActive;
                downloadCsv(timestampedFilename('permits'), rows, [
                  { header: 'Permit No', accessor: (p) => p.permit_no },
                  { header: 'Status', accessor: (p) => statusLabels[p.status as PermitStatus] || p.status },
                  { header: 'Work Type', accessor: (p) => (p as any).work_types?.name || '' },
                  { header: 'Requester', accessor: (p) => p.requester_name },
                  { header: 'Company', accessor: (p) => p.contractor_name || '' },
                  { header: 'Location', accessor: (p) => (p as any).work_locations?.name || p.work_location_other || '' },
                  { header: 'Unit/Floor', accessor: (p) => `${p.unit || ''} ${p.floor || ''}`.trim() },
                  { header: 'From', accessor: (p) => p.work_date_from || '' },
                  { header: 'To', accessor: (p) => p.work_date_to || '' },
                  { header: 'Urgency', accessor: (p) => p.urgency },
                  { header: 'Created', accessor: (p) => new Date(p.created_at).toISOString() },
                ]);
              }}
              disabled={filteredActive.length === 0}
              title="Export current view to CSV"
            >
              <Download className="w-4 h-4 mr-2" />
              Export
            </Button>
            <Button asChild className="bg-accent text-accent-foreground hover:bg-accent/90">
              <Link to="/new-permit">
                <Plus className="w-4 h-4 mr-2" />
                New Permit
              </Link>
            </Button>
          </div>
        )}
        {currentRole !== 'tenant' && (
          <Button
            variant="outline"
            onClick={() => {
              const rows = filteredActive;
              downloadCsv(timestampedFilename('permits'), rows, [
                { header: 'Permit No', accessor: (p) => p.permit_no },
                { header: 'Status', accessor: (p) => statusLabels[p.status as PermitStatus] || p.status },
                { header: 'Work Type', accessor: (p) => (p as any).work_types?.name || '' },
                { header: 'Requester', accessor: (p) => p.requester_name },
                { header: 'Company', accessor: (p) => p.contractor_name || '' },
                { header: 'Location', accessor: (p) => (p as any).work_locations?.name || p.work_location_other || '' },
                { header: 'Unit/Floor', accessor: (p) => `${p.unit || ''} ${p.floor || ''}`.trim() },
                { header: 'From', accessor: (p) => p.work_date_from || '' },
                { header: 'To', accessor: (p) => p.work_date_to || '' },
                { header: 'Urgency', accessor: (p) => p.urgency },
                { header: 'Created', accessor: (p) => new Date(p.created_at).toISOString() },
              ]);
            }}
            disabled={filteredActive.length === 0}
            title="Export current view to CSV"
          >
            <Download className="w-4 h-4 mr-2" />
            Export
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
        <Select value={statusFilter} onValueChange={handleStatusChange}>
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
            className={cn('px-3', viewMode === 'grid' && 'bg-muted')}
          >
            <LayoutGrid className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setViewMode('list')}
            className={cn('px-3', viewMode === 'list' && 'bg-muted')}
          >
            <List className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {isAdmin && archivedPermits.length > 0 ? (
        <Tabs defaultValue="active" onValueChange={() => setSelectedIds(new Set())}>
          <TabsList>
            <TabsTrigger value="active">Active ({filteredActive.length})</TabsTrigger>
            <TabsTrigger value="archived">
              <Archive className="w-3.5 h-3.5 mr-1.5" />
              Archived ({filteredArchived.length})
            </TabsTrigger>
          </TabsList>
          <TabsContent value="active">
            {renderPermitGrid(filteredActive)}
          </TabsContent>
          <TabsContent value="archived">
            {renderPermitGrid(filteredArchived, true)}
          </TabsContent>
        </Tabs>
      ) : (
        renderPermitGrid(filteredActive)
      )}
    </motion.div>
  );
}
