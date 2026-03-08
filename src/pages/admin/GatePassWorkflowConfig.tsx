import { useGatePassTypeWorkflows, useUpdateGatePassTypeWorkflow } from '@/hooks/useGatePassTypeWorkflows';
import { useWorkflowTemplates } from '@/hooks/useWorkflowTemplates';
import { gatePassTypeLabels } from '@/types/gatePass';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Loader2, Route, Unlink } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function GatePassWorkflowConfig() {
  const { data: mappings, isLoading: loadingMappings } = useGatePassTypeWorkflows();
  const { data: templates, isLoading: loadingTemplates } = useWorkflowTemplates('gate_pass');
  const updateMapping = useUpdateGatePassTypeWorkflow();

  const isLoading = loadingMappings || loadingTemplates;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const getTemplateName = (templateId: string | null) => {
    if (!templateId) return null;
    return templates?.find(t => t.id === templateId)?.name || 'Unknown';
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Gate Pass Workflow Configuration</h1>
        <p className="text-muted-foreground">Map each gate pass type to a workflow template to control its approval path.</p>
      </div>

      {(!templates || templates.length === 0) && (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">No gate pass workflow templates found. Create one in the Workflow Builder first.</p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4">
        {mappings?.map(mapping => {
          const label = gatePassTypeLabels[mapping.pass_type as keyof typeof gatePassTypeLabels] || mapping.pass_type;
          const templateName = getTemplateName(mapping.workflow_template_id);

          return (
            <Card key={mapping.id}>
              <CardContent className="pt-6">
                <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Route className="h-4 w-4 text-primary flex-shrink-0" />
                      <span className="font-semibold text-foreground">{label}</span>
                      <Badge variant="outline" className="text-xs">{mapping.pass_type}</Badge>
                    </div>
                    {templateName ? (
                      <p className="text-sm text-muted-foreground">Currently mapped to: <span className="font-medium text-foreground">{templateName}</span></p>
                    ) : (
                      <p className="text-sm text-warning">No workflow assigned — will use default flow</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Select
                      value={mapping.workflow_template_id || 'none'}
                      onValueChange={(v) =>
                        updateMapping.mutate({
                          passType: mapping.pass_type,
                          workflowTemplateId: v === 'none' ? null : v,
                        })
                      }
                    >
                      <SelectTrigger className="w-full sm:w-[240px]">
                        <SelectValue placeholder="Select workflow" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">
                          <span className="flex items-center gap-1">
                            <Unlink className="h-3 w-3" /> Default Flow
                          </span>
                        </SelectItem>
                        {templates?.map(t => (
                          <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
