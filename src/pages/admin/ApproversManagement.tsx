import { useState } from 'react';
import { useUsersWithRoles, useAddUserRole, useRemoveUserRole, UserWithRoles } from '@/hooks/useAdmin';
import { useUpdateUserStatus, useResetUserPassword, useSyncUserProfiles, useDeleteUser } from '@/hooks/useUserManagement';
import { useRoles } from '@/hooks/useRoles';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, Search, Shield, Trash2, UserPlus, UserX, Key, Plus, RefreshCw, Pencil, Users, Briefcase } from 'lucide-react';
import { CreateUserDialog } from '@/components/admin/CreateUserDialog';
import { EditUserDialog } from '@/components/admin/EditUserDialog';

// Tab values for the All/Tenants/Staff filter above the table.
type UserTab = 'all' | 'tenants' | 'staff';

// A user is considered a "tenant" when their ONLY role is the tenant
// role (the default for self-signups). A user with any approver or
// admin role is "staff" — even if they also happen to carry the
// tenant role for some reason.
function isTenantOnly(user: UserWithRoles): boolean {
  return user.roles.length > 0 && user.roles.every((r) => r === 'tenant');
}
function isStaff(user: UserWithRoles): boolean {
  return user.roles.some((r) => r !== 'tenant');
}

export default function ApproversManagement() {
  const { data: users, isLoading: usersLoading } = useUsersWithRoles();
  const { data: roles, isLoading: rolesLoading } = useRoles();
  const addRole = useAddUserRole();
  const removeRole = useRemoveUserRole();
  const updateStatus = useUpdateUserStatus();
  const resetPassword = useResetUserPassword();
  const syncProfiles = useSyncUserProfiles();
  const deleteUser = useDeleteUser();

  // Create a map of role name -> label from the roles table
  const roleLabelsMap = roles?.reduce((acc, role) => {
    acc[role.name] = role.label;
    return acc;
  }, {} as Record<string, string>) || {};

  // Get active roles for the dropdown
  const availableRoles = roles?.filter(role => role.is_active) || [];
  
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<UserTab>('all');
  const [selectedUser, setSelectedUser] = useState<UserWithRoles | null>(null);
  const [selectedRole, setSelectedRole] = useState('');
  const [isRoleDialogOpen, setIsRoleDialogOpen] = useState(false);
  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);
  const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);
  const [editProfileUser, setEditProfileUser] = useState<UserWithRoles | null>(null);
  const [isCreateUserDialogOpen, setIsCreateUserDialogOpen] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<UserWithRoles | null>(null);

  // Tab counts (computed from the full set, not the filtered set, so the
  // numbers stay stable as the user types in the search box)
  const tenantCount = users?.filter(isTenantOnly).length ?? 0;
  const staffCount = users?.filter(isStaff).length ?? 0;
  const totalCount = users?.length ?? 0;

  // Apply tab filter, then search filter.
  const tabFiltered = users?.filter((user) => {
    if (activeTab === 'tenants') return isTenantOnly(user);
    if (activeTab === 'staff') return isStaff(user);
    return true;
  });

  const filteredUsers = tabFiltered?.filter(
    (user) =>
      user.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.company_name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleAddRole = () => {
    if (selectedUser && selectedRole) {
      addRole.mutate(
        { userId: selectedUser.id, role: selectedRole },
        {
          onSuccess: () => {
            setIsRoleDialogOpen(false);
            setSelectedRole('');
          },
        }
      );
    }
  };

  const handleRemoveRole = (userId: string, role: string) => {
    if (confirm('Are you sure you want to remove this role?')) {
      removeRole.mutate({ userId, role });
    }
  };

  const handleToggleUserStatus = (user: UserWithRoles, isActive: boolean) => {
    updateStatus.mutate({ userId: user.id, isActive });
  };

  const handleResetPassword = () => {
    if (selectedUser && newPassword) {
      resetPassword.mutate(
        { userId: selectedUser.id, newPassword },
        {
          onSuccess: () => {
            setNewPassword('');
          },
        }
      );
    }
  };

  const handleSendResetEmail = () => {
    if (selectedUser) {
      resetPassword.mutate({ userId: selectedUser.id, sendResetEmail: true });
    }
  };

  // Opens the new EditUserDialog (full_name, phone, company).
  const openEditProfile = (user: UserWithRoles) => {
    setEditProfileUser(user);
    setIsEditProfileOpen(true);
  };

  // Opens the password-management dialog for this user.
  const openPasswordDialog = (user: UserWithRoles) => {
    setSelectedUser(user);
    setNewPassword('');
    setIsPasswordDialogOpen(true);
  };

  // Two-step delete: clicking the trash icon stages the user; the
  // AlertDialog (confirm) does the actual mutate.
  const confirmDelete = () => {
    if (!deleteTarget) return;
    deleteUser.mutate(
      { userId: deleteTarget.id },
      { onSettled: () => setDeleteTarget(null) }
    );
  };

  const getRoleBadgeVariant = (role: string) => {
    if (role === 'admin') return 'destructive';
    if (role === 'tenant') return 'secondary';
    return 'default';
  };

  const isLoading = usersLoading || rolesLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">User Management</h1>
        <p className="text-muted-foreground">
          Manage users, assign roles, and control access to the system
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Users & Roles
          </CardTitle>
          <CardDescription>
            Enable/disable users, assign companies, manage roles, and reset passwords
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Audience tabs — split the user list into Tenants vs Staff
              so admins can review each cohort separately. The 'All' tab
              preserves the previous flat-list behaviour. Counts come
              from the unfiltered list so they don't shift as the
              admin types in the search box. */}
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as UserTab)} className="mb-4">
            <TabsList className="grid w-full grid-cols-3 sm:w-auto sm:inline-flex">
              <TabsTrigger value="all" className="gap-2">
                <Users className="h-4 w-4" />
                All
                <Badge variant="secondary" className="ml-1">{totalCount}</Badge>
              </TabsTrigger>
              <TabsTrigger value="tenants" className="gap-2">
                <Users className="h-4 w-4" />
                Tenants
                <Badge variant="secondary" className="ml-1">{tenantCount}</Badge>
              </TabsTrigger>
              <TabsTrigger value="staff" className="gap-2">
                <Briefcase className="h-4 w-4" />
                Staff
                <Badge variant="secondary" className="ml-1">{staffCount}</Badge>
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="flex items-center gap-4 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search users by name, email, or company..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button 
              variant="outline" 
              onClick={() => syncProfiles.mutate()}
              disabled={syncProfiles.isPending}
            >
              {syncProfiles.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Sync Users
            </Button>
            <Button onClick={() => setIsCreateUserDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create User
            </Button>
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>Full Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Roles</TableHead>
                  <TableHead className="w-[180px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers?.map((user) => (
                  <TableRow key={user.id} className={!user.is_active ? 'opacity-50' : ''}>
                    <TableCell>
                      <Switch
                        checked={user.is_active}
                        onCheckedChange={(checked) => handleToggleUserStatus(user, checked)}
                        disabled={updateStatus.isPending}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {!user.is_active && (
                          <UserX className="h-4 w-4 text-destructive" />
                        )}
                        <p className="font-medium">{user.full_name || '-'}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <p className="text-sm">{user.email}</p>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">{user.company_name || '-'}</span>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {user.roles.map((role) => (
                          <Badge
                            key={role}
                            variant={getRoleBadgeVariant(role)}
                            className="cursor-pointer group"
                            onClick={() => handleRemoveRole(user.id, role)}
                          >
                            {roleLabelsMap[role] || role}
                            <Trash2 className="h-3 w-3 ml-1 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </Badge>
                        ))}
                        {user.roles.length === 0 && (
                          <span className="text-sm text-muted-foreground">No roles assigned</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Dialog open={isRoleDialogOpen && selectedUser?.id === user.id} onOpenChange={(open) => {
                          setIsRoleDialogOpen(open);
                          if (!open) {
                            setSelectedUser(null);
                            setSelectedRole('');
                          }
                        }}>
                          <DialogTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setSelectedUser(user)}
                              title="Add Role"
                            >
                              <UserPlus className="h-4 w-4" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Add Role to User</DialogTitle>
                              <DialogDescription>
                                Assign an approver role to {user.full_name || user.email}
                              </DialogDescription>
                            </DialogHeader>
                            <div className="py-4">
                              <Select value={selectedRole} onValueChange={setSelectedRole}>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select a role..." />
                                </SelectTrigger>
                                <SelectContent>
                                  {availableRoles
                                    .filter((role) => !user.roles.includes(role.name))
                                    .map((role) => (
                                      <SelectItem key={role.name} value={role.name}>
                                        {role.label}
                                      </SelectItem>
                                    ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <DialogFooter>
                              <Button variant="outline" onClick={() => setIsRoleDialogOpen(false)}>
                                Cancel
                              </Button>
                              <Button onClick={handleAddRole} disabled={!selectedRole || addRole.isPending}>
                                {addRole.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                                Add Role
                              </Button>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>

                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openEditProfile(user)}
                          title="Edit profile"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>

                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openPasswordDialog(user)}
                          title="Reset password"
                        >
                          <Key className="h-4 w-4" />
                        </Button>

                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setDeleteTarget(user)}
                          title="Delete user"
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {filteredUsers?.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      No users found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Reset Password dialog (one of three row actions) */}
      <Dialog
        open={isPasswordDialogOpen}
        onOpenChange={(open) => {
          setIsPasswordDialogOpen(open);
          if (!open) {
            setSelectedUser(null);
            setNewPassword('');
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reset password</DialogTitle>
            <DialogDescription>
              {selectedUser?.full_name
                ? `Set a new password for ${selectedUser.full_name} or send them a reset email.`
                : selectedUser?.email
                ? `Set a new password for ${selectedUser.email} or send them a reset email.`
                : 'Set a new password or send a reset email.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="newPassword">New password</Label>
              <Input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter new password"
              />
              <p className="text-xs text-muted-foreground">
                Set a new password directly, or send a reset email.
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={handleResetPassword}
                disabled={!newPassword || resetPassword.isPending}
                className="flex-1"
              >
                {resetPassword.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                <Key className="h-4 w-4 mr-2" />
                Set password
              </Button>
              <Button
                variant="outline"
                onClick={handleSendResetEmail}
                disabled={resetPassword.isPending}
                className="flex-1"
              >
                Send reset email
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Profile dialog (full_name, phone, company) */}
      <EditUserDialog
        user={editProfileUser}
        open={isEditProfileOpen}
        onOpenChange={(open) => {
          setIsEditProfileOpen(open);
          if (!open) setEditProfileUser(null);
        }}
      />

      {/* Delete confirmation */}
      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this user?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes{' '}
              <span className="font-medium text-foreground">
                {deleteTarget?.full_name || deleteTarget?.email}
              </span>{' '}
              from the system. Their auth account, profile, and role
              assignments are deleted. Permits and gate-passes they
              submitted stay in the historical record. This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete user
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Create User Dialog */}
      <CreateUserDialog
        open={isCreateUserDialogOpen}
        onOpenChange={setIsCreateUserDialogOpen}
      />
    </div>
  );
}
