import { useMemo, useState } from 'react';
import { useContractorOverview, useContractorTenants } from '@/hooks/useContractors';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Loader2, HardHat, Search, Users } from 'lucide-react';
import { format } from 'date-fns';

/**
 * Admin view of the contractor registry — every contractor captured when a
 * tenant (or staff) raises a work permit / gate pass, with how many tenants use
 * them and how many permits/passes they appear on. Click a row to see which
 * tenants use that contractor. Base for future per-tenant / performance reports.
 */
export default function ContractorsManagement() {
  const { data: contractors, isLoading } = useContractorOverview();
  const [search, setSearch] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const openName = contractors?.find((c) => c.id === openId)?.name ?? '';

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = contractors ?? [];
    if (!q) return rows;
    return rows.filter((c) =>
      [c.name, c.contact_person, c.phone, c.email, c.trade]
        .filter(Boolean)
        .some((v) => (v as string).toLowerCase().includes(q)),
    );
  }, [contractors, search]);

  const totals = useMemo(() => {
    const rows = contractors ?? [];
    return {
      contractors: rows.length,
      permits: rows.reduce((s, c) => s + c.wp_count + c.gp_count, 0),
    };
  }, [contractors]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Contractors</h1>
        <p className="text-muted-foreground">
          Every contractor captured when a permit or gate pass is raised — reusable across tenants.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:max-w-md">
        <Card><CardContent className="pt-6 flex items-center gap-3">
          <HardHat className="h-8 w-8 text-muted-foreground" />
          <div><div className="text-2xl font-bold">{totals.contractors}</div>
            <div className="text-xs text-muted-foreground">Contractors</div></div>
        </CardContent></Card>
        <Card><CardContent className="pt-6 flex items-center gap-3">
          <Users className="h-8 w-8 text-muted-foreground" />
          <div><div className="text-2xl font-bold">{totals.permits}</div>
            <div className="text-xs text-muted-foreground">Permits &amp; passes linked</div></div>
        </CardContent></Card>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search contractors…" value={search}
              onChange={(e) => setSearch(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center p-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !filtered.length ? (
            <p className="text-muted-foreground p-6 text-center">
              No contractors yet — they appear here once tenants raise permits.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Contractor</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead className="text-center">Tenants</TableHead>
                    <TableHead className="text-center">Permits</TableHead>
                    <TableHead className="text-center">Gate passes</TableHead>
                    <TableHead>Last used</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((c) => (
                    <TableRow key={c.id} className="cursor-pointer" onClick={() => setOpenId(c.id)}>
                      <TableCell className="font-medium">
                        {c.name}
                        {c.trade && <div className="text-xs text-muted-foreground">{c.trade}</div>}
                      </TableCell>
                      <TableCell className="text-sm">
                        {c.contact_person && <div>{c.contact_person}</div>}
                        <div className="text-xs text-muted-foreground">
                          {[c.phone, c.email].filter(Boolean).join(' · ') || '—'}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className="gap-1"><Users className="h-3 w-3" />{c.tenant_count}</Badge>
                      </TableCell>
                      <TableCell className="text-center">{c.wp_count}</TableCell>
                      <TableCell className="text-center">{c.gp_count}</TableCell>
                      <TableCell className="text-sm whitespace-nowrap">
                        {c.last_used ? format(new Date(c.last_used), 'dd MMM yyyy') : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <ContractorTenantsDialog contractorId={openId} name={openName} onClose={() => setOpenId(null)} />
    </div>
  );
}

function ContractorTenantsDialog({ contractorId, name, onClose }: {
  contractorId: string | null; name: string; onClose: () => void;
}) {
  const { data: tenants, isLoading } = useContractorTenants(contractorId);
  return (
    <Dialog open={!!contractorId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{name}</DialogTitle>
          <DialogDescription>Tenants who use this contractor.</DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <div className="flex items-center justify-center p-6"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : !tenants?.length ? (
          <p className="text-sm text-muted-foreground py-4 text-center">No tenant links yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow><TableHead>Tenant</TableHead><TableHead>Company</TableHead><TableHead className="text-center">Uses</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {tenants.map((t) => (
                <TableRow key={t.tenant_id}>
                  <TableCell className="text-sm">{t.tenant_name || '—'}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{t.company || '—'}</TableCell>
                  <TableCell className="text-center">{t.usage_count}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </DialogContent>
    </Dialog>
  );
}
