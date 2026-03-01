import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGatePasses } from '@/hooks/useGatePasses';
import { gatePassStatusLabels, gatePassTypeLabels, gatePassCategoryLabels } from '@/types/gatePass';
import type { GatePass, GatePassStatus, GatePassType } from '@/types/gatePass';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Plus, Search, Eye } from 'lucide-react';
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
  const { data: passes, isLoading } = useGatePasses();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  const twelveMoAgo = subMonths(new Date(), 12);

  const { active, archived } = useMemo(() => {
    const all = passes || [];
    const active: GatePass[] = [];
    const archived: GatePass[] = [];
    all.forEach(p => {
      if (isAfter(new Date(p.created_at), twelveMoAgo)) active.push(p);
      else archived.push(p);
    });
    return { active, archived };
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

  const renderTable = (list: GatePass[]) => {
    const filtered = filterPasses(list);
    if (isLoading) return <p className="text-muted-foreground p-4">Loading...</p>;
    if (filtered.length === 0) return <p className="text-muted-foreground p-4">No gate passes found.</p>;

    return (
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
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
                  <Button size="sm" variant="ghost" onClick={e => { e.stopPropagation(); navigate(`/gate-passes/${p.id}`); }}>
                    <Eye className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
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
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {Object.entries(gatePassStatusLabels).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="Type" /></SelectTrigger>
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

      <Tabs defaultValue="active">
        <TabsList>
          <TabsTrigger value="active">Active ({active.length})</TabsTrigger>
          <TabsTrigger value="archive">12-Month Archive ({archived.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="active">
          <Card>
            <CardContent className="p-0">{renderTable(active)}</CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="archive">
          <Card>
            <CardHeader><CardTitle className="text-lg">Audit Retention (12+ months old)</CardTitle></CardHeader>
            <CardContent className="p-0">{renderTable(archived)}</CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
