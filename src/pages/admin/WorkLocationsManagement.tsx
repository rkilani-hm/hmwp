import { useState } from 'react';
import { useAdminWorkLocations, useCreateWorkLocation, useUpdateWorkLocation, useDeleteWorkLocation, WorkLocation } from '@/hooks/useWorkLocations';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Building2, Loader2, MapPin, Pencil, Plus, Trash2, Store, Users } from 'lucide-react';

const emptyLocation = {
  name: '',
  description: '',
  location_type: 'shop' as 'shop' | 'common',
  is_active: true,
};

export default function WorkLocationsManagement() {
  const { data: workLocations, isLoading } = useAdminWorkLocations();
  const createLocation = useCreateWorkLocation();
  const updateLocation = useUpdateWorkLocation();
  const deleteLocation = useDeleteWorkLocation();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingLocation, setEditingLocation] = useState<WorkLocation | null>(null);
  const [formData, setFormData] = useState(emptyLocation);

  const handleCreate = () => {
    if (!formData.name.trim()) return;
    createLocation.mutate(formData, {
      onSuccess: () => {
        setIsCreateOpen(false);
        setFormData(emptyLocation);
      },
    });
  };

  const handleUpdate = () => {
    if (!editingLocation || !formData.name.trim()) return;
    updateLocation.mutate(
      { id: editingLocation.id, ...formData },
      {
        onSuccess: () => {
          setEditingLocation(null);
          setFormData(emptyLocation);
        },
      }
    );
  };

  const handleDelete = (id: string) => {
    deleteLocation.mutate(id);
  };

  const openEditDialog = (location: WorkLocation) => {
    setEditingLocation(location);
    setFormData({
      name: location.name,
      description: location.description || '',
      location_type: location.location_type,
      is_active: location.is_active,
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const LocationForm = ({ isEdit }: { isEdit: boolean }) => (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="name">Location Name *</Label>
        <Input
          id="name"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          placeholder="e.g., Shop, Corridor, Parking"
        />
      </div>
      
      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          placeholder="Brief description of this location type"
          rows={2}
        />
      </div>

      <div className="space-y-3">
        <Label>Location Type (Workflow Routing)</Label>
        <p className="text-sm text-muted-foreground">
          Determines the first approver after Helpdesk review
        </p>
        <RadioGroup
          value={formData.location_type}
          onValueChange={(value) => setFormData({ ...formData, location_type: value as 'shop' | 'common' })}
          className="grid grid-cols-2 gap-4"
        >
          <div className={`flex items-center space-x-3 p-4 rounded-lg border-2 cursor-pointer transition-all ${
            formData.location_type === 'shop' 
              ? 'border-primary bg-primary/5' 
              : 'border-border hover:border-muted-foreground'
          }`}>
            <RadioGroupItem value="shop" id="shop" />
            <Label htmlFor="shop" className="flex-1 cursor-pointer">
              <div className="flex items-center gap-2">
                <Store className="h-4 w-4 text-primary" />
                <span className="font-medium">Shop/Office</span>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                Routes to PM first
              </p>
            </Label>
          </div>
          <div className={`flex items-center space-x-3 p-4 rounded-lg border-2 cursor-pointer transition-all ${
            formData.location_type === 'common' 
              ? 'border-primary bg-primary/5' 
              : 'border-border hover:border-muted-foreground'
          }`}>
            <RadioGroupItem value="common" id="common" />
            <Label htmlFor="common" className="flex-1 cursor-pointer">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" />
                <span className="font-medium">Common Area</span>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                Routes to PD first
              </p>
            </Label>
          </div>
        </RadioGroup>
      </div>

      {isEdit && (
        <div className="flex items-center justify-between p-3 rounded-lg border bg-card">
          <Label htmlFor="is_active" className="cursor-pointer">
            Active (visible in permit forms)
          </Label>
          <Switch
            id="is_active"
            checked={formData.is_active}
            onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
          />
        </div>
      )}

      <DialogFooter>
        <Button
          variant="outline"
          onClick={() => {
            setIsCreateOpen(false);
            setEditingLocation(null);
            setFormData(emptyLocation);
          }}
        >
          Cancel
        </Button>
        <Button
          onClick={isEdit ? handleUpdate : handleCreate}
          disabled={
            !formData.name.trim() ||
            createLocation.isPending ||
            updateLocation.isPending
          }
        >
          {(createLocation.isPending || updateLocation.isPending) && (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          )}
          {isEdit ? 'Save Changes' : 'Create Location'}
        </Button>
      </DialogFooter>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Work Locations</h1>
          <p className="text-muted-foreground">
            Configure work location options and their workflow routing
          </p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Location
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Create Work Location</DialogTitle>
              <DialogDescription>
                Define a new work location and its workflow routing type
              </DialogDescription>
            </DialogHeader>
            <LocationForm isEdit={false} />
          </DialogContent>
        </Dialog>
      </div>

      {/* Info Cards */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="bg-primary/5 border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Store className="h-4 w-4" />
              Shop/Office Locations
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              After Helpdesk review, routes to <strong>Property Management (PM)</strong> first, then continues with work type requirements.
            </p>
          </CardContent>
        </Card>
        <Card className="bg-secondary/50 border-secondary">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Users className="h-4 w-4" />
              Common Area Locations
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              After Helpdesk review, routes to <strong>Project Development (PD)</strong> first, then continues with work type requirements.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Location Configuration
          </CardTitle>
          <CardDescription>
            Manage available work locations and their routing behavior. Users can also select "Other" for custom locations.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Location Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>First Approver</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[120px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {workLocations?.map((location) => (
                  <TableRow key={location.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{location.name}</p>
                        {location.description && (
                          <p className="text-sm text-muted-foreground">{location.description}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={location.location_type === 'shop' ? 'default' : 'secondary'}>
                        {location.location_type === 'shop' ? (
                          <><Store className="h-3 w-3 mr-1" /> Shop/Office</>
                        ) : (
                          <><Users className="h-3 w-3 mr-1" /> Common Area</>
                        )}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm font-medium">
                        {location.location_type === 'shop' ? 'PM' : 'PD'}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={location.is_active ? 'outline' : 'secondary'}>
                        {location.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Dialog
                          open={editingLocation?.id === location.id}
                          onOpenChange={(open) => {
                            if (!open) {
                              setEditingLocation(null);
                              setFormData(emptyLocation);
                            }
                          }}
                        >
                          <DialogTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openEditDialog(location)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-md">
                            <DialogHeader>
                              <DialogTitle>Edit Work Location</DialogTitle>
                              <DialogDescription>
                                Modify the location and its workflow routing
                              </DialogDescription>
                            </DialogHeader>
                            <LocationForm isEdit={true} />
                          </DialogContent>
                        </Dialog>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="outline" size="sm">
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete Location?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will permanently delete "{location.name}".
                                Existing permits using this location will not be affected.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleDelete(location.id)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {workLocations?.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      No work locations configured. Create one to get started.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
