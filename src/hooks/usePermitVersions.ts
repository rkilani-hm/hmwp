import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface PermitVersion {
  id: string;
  permit_no: string;
  rework_version: number | null;
  status: string;
  created_at: string;
  parent_permit_id: string | null;
}

/**
 * Find the root permit ID by traversing up the parent chain
 */
async function findRootPermitId(permitId: string): Promise<string> {
  let currentId = permitId;
  let maxIterations = 10; // Prevent infinite loops
  
  while (maxIterations > 0) {
    const { data, error } = await supabase
      .from('work_permits')
      .select('id, parent_permit_id')
      .eq('id', currentId)
      .maybeSingle();
    
    if (error || !data) break;
    
    if (!data.parent_permit_id) {
      return data.id; // This is the root
    }
    
    currentId = data.parent_permit_id;
    maxIterations--;
  }
  
  return currentId;
}

/**
 * Fetch all versions in a permit chain (parent + all children)
 */
export function usePermitVersionHistory(permitId: string | undefined) {
  return useQuery({
    queryKey: ['permit-versions', permitId],
    queryFn: async (): Promise<PermitVersion[]> => {
      if (!permitId) return [];
      
      // First, find the root permit
      const rootId = await findRootPermitId(permitId);
      
      // Get the root permit
      const { data: rootPermit, error: rootError } = await supabase
        .from('work_permits')
        .select('id, permit_no, rework_version, status, created_at, parent_permit_id')
        .eq('id', rootId)
        .maybeSingle();
      
      if (rootError || !rootPermit) return [];
      
      // Get all child permits recursively
      const allVersions: PermitVersion[] = [rootPermit as PermitVersion];
      
      // Fetch children iteratively (up to 10 levels)
      const parentIds = [rootId];
      let iterations = 0;
      
      while (parentIds.length > 0 && iterations < 10) {
        const currentParentId = parentIds.shift()!;
        
        const { data: children, error: childError } = await supabase
          .from('work_permits')
          .select('id, permit_no, rework_version, status, created_at, parent_permit_id')
          .eq('parent_permit_id', currentParentId)
          .order('created_at', { ascending: true });
        
        if (!childError && children) {
          for (const child of children) {
            allVersions.push(child as PermitVersion);
            parentIds.push(child.id);
          }
        }
        
        iterations++;
      }
      
      // Sort by creation date
      return allVersions.sort((a, b) => 
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
    },
    enabled: !!permitId,
  });
}

/**
 * Fetch two permits for comparison
 */
export function usePermitComparison(leftId: string | undefined, rightId: string | undefined) {
  return useQuery({
    queryKey: ['permit-comparison', leftId, rightId],
    queryFn: async () => {
      if (!leftId || !rightId) return null;
      
      const [leftResult, rightResult] = await Promise.all([
        supabase
          .from('work_permits')
          .select('*, work_types(name)')
          .eq('id', leftId)
          .maybeSingle(),
        supabase
          .from('work_permits')
          .select('*, work_types(name)')
          .eq('id', rightId)
          .maybeSingle(),
      ]);
      
      if (leftResult.error || rightResult.error) {
        throw new Error('Failed to fetch permits for comparison');
      }
      
      return {
        left: leftResult.data,
        right: rightResult.data,
      };
    },
    enabled: !!leftId && !!rightId,
  });
}
