import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePermitVersionHistory, PermitVersion } from '@/hooks/usePermitVersions';
import { PermitComparisonDialog } from '@/components/PermitComparisonDialog';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PermitStatus } from '@/types/workPermit';
import { History, ArrowLeftRight, ExternalLink, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface PermitVersionHistoryProps {
  permitId: string;
  currentPermitNo: string;
}

export function PermitVersionHistory({ permitId, currentPermitNo }: PermitVersionHistoryProps) {
  const navigate = useNavigate();
  const { data: versions, isLoading } = usePermitVersionHistory(permitId);
  const [compareDialogOpen, setCompareDialogOpen] = useState(false);
  const [compareWith, setCompareWith] = useState<PermitVersion | null>(null);
  
  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg font-display flex items-center gap-2">
            <History className="h-4 w-4" />
            Version History
          </CardTitle>
        </CardHeader>
        <CardContent className="flex justify-center py-4">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }
  
  // Don't show if only one version
  if (!versions || versions.length <= 1) {
    return null;
  }
  
  const currentVersion = versions.find(v => v.id === permitId);
  const currentIndex = versions.findIndex(v => v.id === permitId);
  
  const handleCompare = (version: PermitVersion) => {
    setCompareWith(version);
    setCompareDialogOpen(true);
  };
  
  const handleNavigate = (version: PermitVersion) => {
    if (version.id !== permitId) {
      navigate(`/permits/${version.id}`);
    }
  };
  
  return (
    <>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg font-display flex items-center gap-2">
            <History className="h-4 w-4" />
            Version History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {versions.map((version, index) => {
              const isCurrent = version.id === permitId;
              const versionNumber = index + 1;
              
              return (
                <div
                  key={version.id}
                  className={cn(
                    "flex items-center justify-between p-3 rounded-lg transition-colors",
                    isCurrent 
                      ? "bg-primary/10 border border-primary/30" 
                      : "bg-muted/50 hover:bg-muted cursor-pointer"
                  )}
                  onClick={() => !isCurrent && handleNavigate(version)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        "font-medium text-sm truncate",
                        isCurrent && "text-primary"
                      )}>
                        {version.permit_no}
                      </span>
                      {isCurrent && (
                        <span className="text-xs bg-primary text-primary-foreground px-1.5 py-0.5 rounded">
                          Current
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {format(new Date(version.created_at), 'PPp')}
                    </p>
                  </div>
                  
                  <div className="flex items-center gap-2 ml-2">
                    <StatusBadge 
                      status={version.status as PermitStatus} 
                      className="text-xs px-2 py-0.5"
                    />
                    
                    {!isCurrent && (
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCompare(version);
                          }}
                          title="Compare with current"
                        >
                          <ArrowLeftRight className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleNavigate(version);
                          }}
                          title="View this version"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
      
      {compareWith && (
        <PermitComparisonDialog
          open={compareDialogOpen}
          onOpenChange={setCompareDialogOpen}
          leftPermitId={compareWith.id}
          rightPermitId={permitId}
          leftLabel={compareWith.permit_no}
          rightLabel={currentPermitNo}
        />
      )}
    </>
  );
}
