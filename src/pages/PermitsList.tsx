import { useState } from 'react';
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
import { mockPermits } from '@/data/mockData';
import { PermitStatus, statusLabels, UserRole } from '@/types/workPermit';
import { Search, Filter, Plus, LayoutGrid, List } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface PermitsListProps {
  currentRole: UserRole;
}

export default function PermitsList({ currentRole }: PermitsListProps) {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<PermitStatus | 'all'>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  const filteredPermits = mockPermits.filter((permit) => {
    const matchesSearch =
      permit.permitNo.toLowerCase().includes(searchQuery.toLowerCase()) ||
      permit.contractorName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      permit.workDescription.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = statusFilter === 'all' || permit.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const statusOptions: (PermitStatus | 'all')[] = [
    'all',
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
          onValueChange={(value) => setStatusFilter(value as PermitStatus | 'all')}
        >
          <SelectTrigger className="w-full sm:w-48">
            <Filter className="w-4 h-4 mr-2" />
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {statusOptions.slice(1).map((status) => (
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
            <PermitCard
              key={permit.id}
              permit={permit}
              onClick={() => navigate(`/permits/${permit.id}`)}
            />
          ))}
        </div>
      )}
    </motion.div>
  );
}
