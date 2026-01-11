import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface WorkLocation {
  id: string;
  name: string;
  description: string | null;
  location_type: 'shop' | 'common';
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// Fetch active work locations for permit forms
export function useWorkLocations() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['work-locations'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('work_locations')
        .select('*')
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      return data as WorkLocation[];
    },
    enabled: !!user,
  });
}

// Fetch all work locations for admin management
export function useAdminWorkLocations() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['admin-work-locations'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('work_locations')
        .select('*')
        .order('name');

      if (error) throw error;
      return data as WorkLocation[];
    },
    enabled: !!user,
  });
}

export function useCreateWorkLocation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (locationData: {
      name: string;
      description?: string;
      location_type: 'shop' | 'common';
    }) => {
      const { data, error } = await supabase
        .from('work_locations')
        .insert({
          name: locationData.name.trim(),
          description: locationData.description?.trim() || null,
          location_type: locationData.location_type,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['work-locations'] });
      queryClient.invalidateQueries({ queryKey: ['admin-work-locations'] });
      toast.success('Work location created successfully');
    },
    onError: (error: any) => {
      if (error.message?.includes('duplicate')) {
        toast.error('A location with this name already exists');
      } else {
        toast.error('Failed to create work location: ' + error.message);
      }
    },
  });
}

export function useUpdateWorkLocation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (locationData: {
      id: string;
      name: string;
      description?: string;
      location_type: 'shop' | 'common';
      is_active?: boolean;
    }) => {
      const { data, error } = await supabase
        .from('work_locations')
        .update({
          name: locationData.name.trim(),
          description: locationData.description?.trim() || null,
          location_type: locationData.location_type,
          is_active: locationData.is_active ?? true,
        })
        .eq('id', locationData.id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['work-locations'] });
      queryClient.invalidateQueries({ queryKey: ['admin-work-locations'] });
      toast.success('Work location updated successfully');
    },
    onError: (error: any) => {
      if (error.message?.includes('duplicate')) {
        toast.error('A location with this name already exists');
      } else {
        toast.error('Failed to update work location: ' + error.message);
      }
    },
  });
}

export function useDeleteWorkLocation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('work_locations')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['work-locations'] });
      queryClient.invalidateQueries({ queryKey: ['admin-work-locations'] });
      toast.success('Work location deleted successfully');
    },
    onError: (error: any) => {
      toast.error('Failed to delete work location: ' + error.message);
    },
  });
}
