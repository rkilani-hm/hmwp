import { useState } from 'react';
import { useUsersWithRoles, useAddUserRole, useRemoveUserRole, UserWithRoles } from '@/hooks/useAdmin';
import { useUpdateUserStatus, useUpdateUserCompany, useResetUserPassword, useSyncUserProfiles } from '@/hooks/useUserManagement';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, Search, Shield, Trash2, UserPlus, Building2, Key, UserX, Plus, RefreshCw } from 'lucide-react';
import { CreateUserDialog } from '@/components/admin/CreateUserDialog';

export default function ApproversManagement() {
  const { data: users, isLoading: usersLoading } = useUsersWithRoles();
  const { data: roles, isLoading: rolesLoading } = useRoles();
  const addRole = useAddUserRole();
  const removeRole = useRemoveUserRole();
  const updateStatus = useUpdateUserStatus();
  const updateCompany = useUpdateUserCompany();
  const resetPassword = useResetUserPassword();
  const syncProfiles = useSyncUserProfiles();

  // Create a map of role name -> label from the roles table
  const roleLabelsMap = roles?.reduce((acc, role) => {
    acc[role.name] = role.label;
    return acc;
  }, {} as Record<string, string>) || {};

  // Get active roles for the dropdown
  const availableRoles = roles?.filter(role => role.is_active) || [];
  
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUser, setSelectedUser] = useState<UserWithRoles | null>(null);
  const [selectedRole, setSelectedRole] = useState('');
  const [isRoleDialogOpen, setIsRoleDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isCreateUserDialogOpen, setIsCreateUserDialogOpen] = useState(false);
  const [editCompany, setEditCompany] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const filteredUsers = users?.filter(
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

  const handleUpdateCompany = () => {
    if (selectedUser) {
      updateCompany.mutate(
        { userId: selectedUser.id, companyName: editCompany },
        {
          onSuccess: () => {
            setIsEditDialogOpen(false);
            setEditCompany('');
          },
        }
      );
    }
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

  const openEditDialog = (user: UserWithRoles) => {
    setSelectedUser(user);
    setEditCompany(user.company_name || '');
    setNewPassword('');
    setIsEditDialogOpen(true);
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
                          onClick={() => openEditDialog(user)}
                          title="Edit User"
                        >
                          <Building2 className="h-4 w-4" />
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

      {/* Edit User Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={(open) => {
        setIsEditDialogOpen(open);
        if (!open) {
          setSelectedUser(null);
          setEditCompany('');
          setNewPassword('');
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>
              Update {selectedUser?.full_name || selectedUser?.email}'s settings
            </DialogDescription>
          </DialogHeader>
          
          <Tabs defaultValue="company" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="company">Company</TabsTrigger>
              <TabsTrigger value="password">Password</TabsTrigger>
            </TabsList>
            
            <TabsContent value="company" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="company">Company Name</Label>
                <Input
                  id="company"
                  value={editCompany}
                  onChange={(e) => setEditCompany(e.target.value)}
                  placeholder="Enter company name"
                />
              </div>
              <Button 
                onClick={handleUpdateCompany} 
                disabled={updateCompany.isPending}
                className="w-full"
              >
                {updateCompany.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                <Building2 className="h-4 w-4 mr-2" />
                Update Company
              </Button>
            </TabsContent>
            
            <TabsContent value="password" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="newPassword">New Password</Label>
                <Input
                  id="newPassword"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new password"
                />
                <p className="text-xs text-muted-foreground">
                  Set a new password directly or send a reset email
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
                  Set Password
                </Button>
                <Button 
                  variant="outline"
                  onClick={handleSendResetEmail} 
                  disabled={resetPassword.isPending}
                  className="flex-1"
                >
                  Send Reset Email
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Create User Dialog */}
      <CreateUserDialog
        open={isCreateUserDialogOpen}
        onOpenChange={setIsCreateUserDialogOpen}
      />
    </div>
  );
}
