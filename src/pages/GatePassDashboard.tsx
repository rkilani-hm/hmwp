import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGatePasses } from '@/hooks/useGatePasses';
import { gatePassStatusLabels, gatePassTypeLabels, gatePassCategoryLabels } from '@/types/gatePass';
import type { GatePass, GatePassStatus, GatePassType } from '@/types/gatePass';
import {
  useArchiveGatePass,
  useRestoreGatePass,
  useHardDeleteGatePass,
  useBulkArchiveGatePasses,
  useBulkHardDeleteGatePasses,
} from '@/hooks/useDeleteGatePass';
import { AdminDeleteDialog } from '@/components/AdminDeleteDialog';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Plus, Search, Eye, Archive, RotateCcw, Trash2 } from 'lucide-react';
import { format, subMonths, isAfter } from 'date-fns';

const statusColors: Record<GatePassStatus, string> = {
  draft: 'bg-muted text-muted-foreground',
  pending_store_manager: 'bg-warning/10 text-warning',
  pending_finance: 'bg-info/10 text-info',
  pending_security: 'bg-accent/10 text-accent',
  approved: 'bg-success/10 text-success',
  rejected: 'bg-destructive/10 text-destructive',
  completed: 'bg-primary/10 text-primary',
};

export default function GatePassDashboard() {
  const navigate = useNavigate();
  const { roles } = useAuth();
  const isAdmin = roles.includes('admin');
  const { data: passes, isLoading } = useGatePasses();
  const archiveGP = useArchiveGatePass();
  const restoreGP = useRestoreGatePass();
  const hardDeleteGP = useHardDeleteGatePass();
  const bulkArchive = useBulkArchiveGatePasses();
  const bulkHardDelete = useBulkHardDeleteGatePasses();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const twelveMoAgo = subMonths(new Date(), 12);

  const { activePasses, archivedPasses, oldArchive } = useMemo(() => {
    const all = passes || [];
    const active: GatePass[] = [];
    const archived: GatePass[] = [];
    const old: GatePass[] = [];
    all.forEach((p: any) => {
      if (p.is_archived) {
        archived.push(p);
      } else if (isAfter(new Date(p.created_at), twelveMoAgo)) {
        active.push(p);
      } else {
        old.push(p);
      }
    });
    return { activePasses: active, archivedPasses: archived, oldArchive: old };
  }, [passes]);

  const filterPasses = (list: GatePass[]) => {
    return list.filter(p => {
      if (statusFilter !== 'all' && p.status !== statusFilter) return false;
      if (typeFilter !== 'all' && p.pass_type !== typeFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          p.pass_no.toLowerCase().includes(q) ||
          p.requester_name.toLowerCase().includes(q) ||
          (p.client_contractor_name?.toLowerCase().includes(q) ?? false)
        );
      }
      return true;
    });
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = (list: GatePass[]) => {
    const ids = list.map(p => p.id);
    const allSelected = ids.every(id => selectedIds.has(id));
    setSelectedIds(prev => {
      const next = new Set(prev);
      ids.forEach(id => allSelected ? next.delete(id) : next.add(id));
      return next;
    });
  };

  const getSelectedPasses = (list: GatePass[]) =>
    list.filter(p => selectedIds.has(p.id)).map(p => ({
      id: p.id,
      pass_no: p.pass_no,
      requester_name: p.requester_name,
    }));

  const renderTable = (list: GatePass[], isArchivedView = false) => {
    const filtered = filterPasses(list);
    if (isLoading) return <p className="text-muted-foreground p-4">Loading...</p>;
    if (filtered.length === 0) return <p className="text-muted-foreground p-4">{isArchivedView ? 'No archived gate passes.' : 'No gate passes found.'}</p>;

    return (
      <>
        {/* Bulk actions bar */}
        {isAdmin && selectedIds.size > 0 && (
          <div className="flex items-center gap-3 p-3 bg-muted rounded-lg m-4">
            <span className="text-sm font-medium">{selectedIds.size} selected</span>
            {!isArchivedView ? (
              <AdminDeleteDialog
                title="Archive Selected Gate Passes"
                description={`Archive ${selectedIds.size} gate pass(es)? They can be restored later.`}
                onConfirm={() => {
                  const selected = getSelectedPasses(filtered);
                  bulkArchive.mutate(selected, { onSuccess: () => setSelectedIds(new Set()) });
                }}
                isPending={bulkArchive.isPending}
                actionLabel={`Archive ${selectedIds.size} Selected`}
                actionIcon="archive"
                destructive={false}
              />
            ) : (
              <AdminDeleteDialog
                title="Permanently Delete Selected"
                description={`Permanently delete ${selectedIds.size} gate pass(es)? This cannot be undone.`}
                onConfirm={() => {
                  const selected = getSelectedPasses(filtered);
                  bulkHardDelete.mutate(selected, { onSuccess: () => setSelectedIds(new Set()) });
                }}
                isPending={bulkHardDelete.isPending}
                actionLabel={`Delete ${selectedIds.size} Permanently`}
                actionIcon="delete"
              />
            )}
            <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>Clear</Button>
          </div>
        )}

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {isAdmin && (
                  <TableHead className="w-10">
                    <Checkbox
                      checked={filtered.length > 0 && filtered.every(p => selectedIds.has(p.id))}
                      onCheckedChange={() => toggleSelectAll(filtered)}
                    />
                  </TableHead>
                )}
                <TableHead>Pass No</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Requestor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(p => (
                <TableRow key={p.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/gate-passes/${p.id}`)}>
                  {isAdmin && (
                    <TableCell onClick={e => e.stopPropagation()}>
                      <Checkbox
                        checked={selectedIds.has(p.id)}
                        onCheckedChange={() => toggleSelect(p.id)}
                      />
                    </TableCell>
                  )}
                  <TableCell className="font-medium">{p.pass_no}</TableCell>
                  <TableCell>{gatePassCategoryLabels[p.pass_category]}</TableCell>
                  <TableCell>{gatePassTypeLabels[p.pass_type]}</TableCell>
                  <TableCell>{p.requester_name}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={statusColors[p.status]}>
                      {gatePassStatusLabels[p.status]}
                    </Badge>
                  </TableCell>
                  <TableCell>{format(new Date(p.created_at), 'dd MMM yyyy')}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1" onClick={e => e.stopPropagation()}>
                      <Button size="sm" variant="ghost" onClick={() => navigate(`/gate-passes/${p.id}`)}>
                        <Eye className="h-4 w-4" />
                      </Button>
                      {isAdmin && !isArchivedView && (
                        <AdminDeleteDialog
                          title="Archive Gate Pass"
                          description={`Archive gate pass ${p.pass_no}? It can be restored later.`}
                          onConfirm={() => archiveGP.mutate({ id: p.id, pass_no: p.pass_no, requester_name: p.requester_name })}
                          isPending={archiveGP.isPending}
                          variant="icon"
                          actionLabel="Archive"
                          actionIcon="archive"
                          destructive={false}
                        />
                      )}
                      {isAdmin && isArchivedView && (
                        <>
                          <AdminDeleteDialog
                            title="Restore Gate Pass"
                            description={`Restore gate pass ${p.pass_no} back to active?`}
                            onConfirm={() => restoreGP.mutate({ id: p.id, pass_no: p.pass_no, requester_name: p.requester_name })}
                            isPending={restoreGP.isPending}
                            variant="icon"
                            actionLabel="Restore"
                            actionIcon="restore"
                            destructive={false}
                          />
                          <AdminDeleteDialog
                            title="Permanently Delete"
                            description={`Permanently delete gate pass ${p.pass_no}? This cannot be undone.`}
                            onConfirm={() => hardDeleteGP.mutate({ id: p.id, pass_no: p.pass_no, requester_name: p.requester_name })}
                            isPending={hardDeleteGP.isPending}
                            variant="icon"
                            actionIcon="delete"
                          />
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Gate Pass Register</h1>
          <p className="text-muted-foreground">Manage gate passes and delivery permits</p>
        </div>
        <Button onClick={() => navigate('/gate-passes/new')}>
          <Plus className="mr-2 h-4 w-4" /> New Gate Pass
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search by pass no, requestor..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-[180px]"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {Object.entries(gatePassStatusLabels).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-full sm:w-[180px]"><SelectValue placeholder="Type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {Object.entries(gatePassTypeLabels).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="active" onValueChange={() => setSelectedIds(new Set())}>
        <TabsList>
          <TabsTrigger value="active">Active ({activePasses.length})</TabsTrigger>
          {isAdmin && (
            <TabsTrigger value="archived">
              <Archive className="w-3.5 h-3.5 mr-1.5" />
              Archived ({archivedPasses.length})
            </TabsTrigger>
          )}
          <TabsTrigger value="old-archive">12-Month Archive ({oldArchive.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="active">
          <Card>
            <CardContent className="p-0">{renderTable(activePasses)}</CardContent>
          </Card>
        </TabsContent>
        {isAdmin && (
          <TabsContent value="archived">
            <Card>
              <CardHeader><CardTitle className="text-lg">Archived Gate Passes</CardTitle></CardHeader>
              <CardContent className="p-0">{renderTable(archivedPasses, true)}</CardContent>
            </Card>
          </TabsContent>
        )}
        <TabsContent value="old-archive">
          <Card>
            <CardHeader><CardTitle className="text-lg">Audit Retention (12+ months old)</CardTitle></CardHeader>
            <CardContent className="p-0">{renderTable(oldArchive)}</CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
