import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { QrCode, Search, CheckCircle2, XCircle, Loader2, LogIn, Camera, CameraOff, ShieldCheck, ShieldX, ShieldAlert, Calendar } from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';
import { toast } from 'sonner';
import { useNavigate, useSearchParams } from 'react-router-dom';
import alHamraLogo from '@/assets/al-hamra-logo.jpg';

interface LimitedPermitInfo {
  permit_no: string;
  status: string;
  work_date_from: string;
  work_date_to: string;
}

const PublicPermitStatus = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [manualPermitNo, setManualPermitNo] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [permitInfo, setPermitInfo] = useState<LimitedPermitInfo | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isCameraLoading, setIsCameraLoading] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const scannerContainerId = 'public-status-scanner-container';

  const extractPermitNumber = (scannedText: string): string => {
    try {
      const url = new URL(scannedText);
      const permitParam = url.searchParams.get('permit');
      if (permitParam) {
        return permitParam;
      }
    } catch {
      // Not a URL, use the text as-is
    }
    return scannedText;
  };

  const searchPermit = async (permitNo: string) => {
    const trimmed = permitNo.trim().toUpperCase();
    if (!trimmed) {
      toast.error('Please enter a permit number');
      return;
    }

    setIsSearching(true);
    setPermitInfo(null);
    setNotFound(false);

    try {
      // Only select limited fields - no sensitive data
      const { data, error } = await supabase
        .from('work_permits')
        .select('permit_no, status, work_date_from, work_date_to')
        .ilike('permit_no', trimmed)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setPermitInfo(data);
        toast.success('Permit found!');
      } else {
        setNotFound(true);
        toast.error('Permit not found');
      }
    } catch (error) {
      console.error('Error searching permit:', error);
      toast.error('Error searching for permit');
    } finally {
      setIsSearching(false);
    }
  };

  const startCamera = async () => {
    setCameraError(null);
    setIsCameraLoading(true);
    setIsCameraActive(true);
    
    await new Promise(resolve => setTimeout(resolve, 100));
    
    try {
      const scanner = new Html5Qrcode(scannerContainerId);
      scannerRef.current = scanner;

      await scanner.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1,
        },
        (decodedText) => {
          stopCamera();
          const permitNo = extractPermitNumber(decodedText);
          setManualPermitNo(permitNo);
          searchPermit(permitNo);
        },
        () => {}
      );
    } catch (err: any) {
      console.error('Camera error:', err);
      setCameraError(err?.message || 'Failed to access camera. Please ensure camera permissions are granted.');
      setIsCameraActive(false);
    } finally {
      setIsCameraLoading(false);
    }
  };

  const stopCamera = async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
        scannerRef.current.clear();
      } catch (err) {
        console.error('Error stopping camera:', err);
      }
      scannerRef.current = null;
    }
    setIsCameraActive(false);
  };

  useEffect(() => {
    return () => {
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {});
      }
    };
  }, []);

  useEffect(() => {
    const permitFromUrl = searchParams.get('permit');
    if (permitFromUrl) {
      setManualPermitNo(permitFromUrl);
      searchPermit(permitFromUrl);
    }
  }, [searchParams]);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  const getStatusInfo = (status: string) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const isApproved = status === 'approved';
    const isClosed = status === 'closed';
    const isRejected = status === 'rejected' || status === 'cancelled';
    const isPending = !isApproved && !isClosed && !isRejected;

    if (isApproved) {
      return {
        icon: ShieldCheck,
        color: 'text-success',
        bgColor: 'bg-success/10 border-success/30',
        label: 'APPROVED',
        description: 'This permit is valid and approved for work.',
      };
    }
    if (isClosed) {
      return {
        icon: ShieldCheck,
        color: 'text-muted-foreground',
        bgColor: 'bg-muted border-border',
        label: 'CLOSED',
        description: 'This permit has been completed and closed.',
      };
    }
    if (isRejected) {
      return {
        icon: ShieldX,
        color: 'text-destructive',
        bgColor: 'bg-destructive/10 border-destructive/30',
        label: status.toUpperCase(),
        description: 'This permit is not valid.',
      };
    }
    return {
      icon: ShieldAlert,
      color: 'text-warning',
      bgColor: 'bg-warning/10 border-warning/30',
      label: 'PENDING',
      description: 'This permit is still under review.',
    };
  };

  const getValidityStatus = (permit: LimitedPermitInfo) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const fromDate = new Date(permit.work_date_from);
    const toDate = new Date(permit.work_date_to);
    fromDate.setHours(0, 0, 0, 0);
    toDate.setHours(0, 0, 0, 0);

    if (today < fromDate) {
      return { label: 'Not Yet Valid', color: 'text-warning' };
    }
    if (today > toDate) {
      return { label: 'Expired', color: 'text-destructive' };
    }
    return { label: 'Currently Valid', color: 'text-success' };
  };

  return (
    <div className="min-h-screen bg-background p-4 sm:p-6 lg:p-8">
      <div className="max-w-md mx-auto space-y-6">
        {/* Header */}
        <div className="text-center space-y-4">
          <img 
            src={alHamraLogo} 
            alt="Al Hamra Logo" 
            className="h-16 mx-auto"
          />
          <div>
            <h1 className="text-2xl font-bold text-foreground">Quick Permit Check</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Verify permit status and validity
            </p>
          </div>
        </div>

        {/* QR Scanner Card */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Camera className="h-4 w-4" />
              Scan QR Code
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!isCameraActive && !isCameraLoading && !cameraError && (
              <div className="w-full aspect-square bg-muted rounded-lg flex items-center justify-center max-h-[200px]">
                <div className="text-center text-muted-foreground p-4">
                  <Camera className="h-10 w-10 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Tap to scan</p>
                </div>
              </div>
            )}
            
            {isCameraLoading && (
              <div className="w-full aspect-square bg-muted rounded-lg flex items-center justify-center max-h-[200px]">
                <div className="text-center text-muted-foreground p-4">
                  <Loader2 className="h-10 w-10 mx-auto mb-2 animate-spin" />
                  <p className="text-sm">Initializing camera...</p>
                </div>
              </div>
            )}
            
            <div 
              id={scannerContainerId}
              style={{ display: isCameraActive ? 'block' : 'none', minHeight: isCameraActive ? '200px' : '0' }}
              className="w-full rounded-lg overflow-hidden"
            />
            
            {cameraError && (
              <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-lg text-center">
                <p className="text-destructive text-sm">{cameraError}</p>
              </div>
            )}

            <Button
              onClick={isCameraActive ? stopCamera : startCamera}
              variant={isCameraActive ? 'destructive' : 'default'}
              className="w-full"
              size="sm"
            >
              {isCameraActive ? (
                <>
                  <CameraOff className="h-4 w-4 mr-2" />
                  Stop Camera
                </>
              ) : (
                <>
                  <Camera className="h-4 w-4 mr-2" />
                  Start Camera
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Manual Search */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <QrCode className="h-4 w-4" />
              Enter Permit Number
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              placeholder="e.g., WP-2025-0001"
              value={manualPermitNo}
              onChange={(e) => setManualPermitNo(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && searchPermit(manualPermitNo)}
            />
            <Button
              onClick={() => searchPermit(manualPermitNo)}
              disabled={isSearching || !manualPermitNo.trim()}
              className="w-full"
              size="sm"
            >
              {isSearching ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Checking...
                </>
              ) : (
                <>
                  <Search className="h-4 w-4 mr-2" />
                  Check Status
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Results - Limited Info */}
        {permitInfo && (() => {
          const statusInfo = getStatusInfo(permitInfo.status);
          const validityStatus = getValidityStatus(permitInfo);
          const StatusIcon = statusInfo.icon;
          
          return (
            <Card className={`border-2 ${statusInfo.bgColor}`}>
              <CardContent className="pt-6 text-center space-y-4">
                <StatusIcon className={`h-16 w-16 mx-auto ${statusInfo.color}`} />
                
                <div>
                  <Badge className={`text-lg px-4 py-1 ${
                    statusInfo.label === 'APPROVED' ? 'bg-success' :
                    statusInfo.label === 'CLOSED' ? 'bg-muted-foreground' :
                    statusInfo.label === 'PENDING' ? 'bg-warning' :
                    'bg-destructive'
                  }`}>
                    {statusInfo.label}
                  </Badge>
                </div>
                
                <div>
                  <p className="text-sm text-muted-foreground">Permit Number</p>
                  <p className="font-bold text-lg">{permitInfo.permit_no}</p>
                </div>

                <div className="flex items-center justify-center gap-2 text-sm">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span>
                    {formatDate(permitInfo.work_date_from)} - {formatDate(permitInfo.work_date_to)}
                  </span>
                </div>

                <p className={`text-sm font-medium ${validityStatus.color}`}>
                  {validityStatus.label}
                </p>

                <p className="text-sm text-muted-foreground">
                  {statusInfo.description}
                </p>
              </CardContent>
            </Card>
          );
        })()}

        {notFound && (
          <Card className="border-destructive/30 bg-destructive/10">
            <CardContent className="py-6 text-center">
              <XCircle className="h-12 w-12 text-destructive mx-auto mb-3" />
              <h3 className="text-lg font-semibold text-destructive">Not Found</h3>
              <p className="text-sm text-destructive mt-1">
                No permit found with number "{manualPermitNo}"
              </p>
            </CardContent>
          </Card>
        )}

        {/* Login Link */}
        <div className="text-center space-y-2">
          <p className="text-xs text-muted-foreground">
            Need full permit details?
          </p>
          <Button variant="ghost" size="sm" onClick={() => navigate('/auth')}>
            <LogIn className="h-4 w-4 mr-2" />
            Staff Login
          </Button>
        </div>
      </div>
    </div>
  );
};

export default PublicPermitStatus;