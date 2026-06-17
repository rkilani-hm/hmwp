import { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Mail, Plus, X, Check, ChevronsUpDown } from 'lucide-react';
import { useUsersWithRoles } from '@/hooks/useAdmin';
import {
  useApprovedPermitCcRecipients,
  useAddCcRecipient,
  useRemoveCcRecipient,
} from '@/hooks/useApprovedPermitCcRecipients';
import { cn } from '@/lib/utils';

export default function ApprovedPermitRecipients() {
  const { data: recipients = [], isLoading } = useApprovedPermitCcRecipients();
  const { data: allUsers = [] } = useUsersWithRoles();
  const addMut = useAddCcRecipient();
  const removeMut = useRemoveCcRecipient();
  const [open, setOpen] = useState(false);

  const existingIds = useMemo(() => new Set(recipients.map(r => r.user_id)), [recipients]);
  const availableUsers = useMemo(
    () => allUsers.filter(u => u.is_active !== false && !existingIds.has(u.id)),
    [allUsers, existingIds],
  );

  return (
    <div className="container mx-auto p-6 max-w-3xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Mail className="h-7 w-7" />
          Approved Permit — Email Recipients
        </h1>
        <p className="text-muted-foreground mt-2">
          These users receive a copy of every <strong>approved</strong> work permit email, in
          addition to the requester. They do not receive rejection or intermediate
          status-update emails.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>CC Recipients</CardTitle>
          <CardDescription>
            Pick from existing system users. Each user appears at most once.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={open}
                className="w-full justify-between"
                disabled={addMut.isPending}
              >
                <span className="flex items-center gap-2">
                  <Plus className="h-4 w-4" />
                  Add recipient
                </span>
                <ChevronsUpDown className="h-4 w-4 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
              <Command>
                <CommandInput placeholder="Search users by name or email..." />
                <CommandList>
                  <CommandEmpty>No users found.</CommandEmpty>
                  <CommandGroup>
                    {availableUsers.map(u => (
                      <CommandItem
                        key={u.id}
                        value={`${u.full_name ?? ''} ${u.email}`}
                        onSelect={() => {
                          addMut.mutate(u.id, { onSuccess: () => setOpen(false) });
                        }}
                      >
                        <Check className={cn('mr-2 h-4 w-4 opacity-0')} />
                        <div className="flex flex-col">
                          <span className="font-medium">{u.full_name || u.email}</span>
                          <span className="text-xs text-muted-foreground">{u.email}</span>
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>

          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : recipients.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center border rounded-md">
              No CC recipients configured. Only the requester will receive approved-permit emails.
            </p>
          ) : (
            <ul className="divide-y border rounded-md">
              {recipients.map(r => (
                <li key={r.id} className="flex items-center justify-between gap-3 p-3">
                  <div className="min-w-0">
                    <p className="font-medium truncate">
                      {r.full_name || r.email || r.user_id}
                    </p>
                    {r.email && (
                      <p className="text-xs text-muted-foreground truncate">{r.email}</p>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeMut.mutate(r.id)}
                    disabled={removeMut.isPending}
                    aria-label="Remove recipient"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
