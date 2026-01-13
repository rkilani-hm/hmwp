import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface WorkType {
  id: string;
  name: string;
  requires_pm: boolean;
  requires_pd: boolean;
  requires_bdcr: boolean;
  requires_mpr: boolean;
  requires_it: boolean;
  requires_fitout: boolean;
  requires_ecovert_supervisor: boolean | null;
  requires_pmd_coordinator: boolean | null;
  workflow_template_id: string | null;
  created_at: string;
}

export interface WorkTypeFormData {
  name: string;
  requires_pm: boolean;
  requires_pd: boolean;
  requires_bdcr: boolean;
  requires_mpr: boolean;
  requires_it: boolean;
  requires_fitout: boolean;
  requires_ecovert_supervisor: boolean;
  requires_pmd_coordinator: boolean;
  workflow_template_id: string | null;
}

export const useAdminWorkTypes = () => {
  return useQuery({
    queryKey: ["admin-work-types"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("work_types")
        .select("*")
        .order("name");

      if (error) throw error;
      return data as WorkType[];
    },
  });
};

export const useCreateWorkType = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (workType: WorkTypeFormData) => {
      const { data, error } = await supabase
        .from("work_types")
        .insert(workType)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-work-types"] });
      toast.success("Work type created successfully");
    },
    onError: (error: Error) => {
      toast.error(`Failed to create work type: ${error.message}`);
    },
  });
};

export const useUpdateWorkType = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      ...updates
    }: Partial<WorkTypeFormData> & { id: string }) => {
      const { data, error } = await supabase
        .from("work_types")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-work-types"] });
      toast.success("Work type updated successfully");
    },
    onError: (error: Error) => {
      toast.error(`Failed to update work type: ${error.message}`);
    },
  });
};

export const useDeleteWorkType = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("work_types").delete().eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-work-types"] });
      toast.success("Work type deleted successfully");
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete work type: ${error.message}`);
    },
  });
};
