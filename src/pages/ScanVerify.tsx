import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { QrCode, Search, Camera, CameraOff, CheckCircle2, XCircle, Loader2, ExternalLink, Printer } from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';
import { toast } from 'sonner';

interface PermitInfo {
  id: string;
  permit_no: string;
  status: string;
  requester_name: string;
  contractor_name: string;
  work_description: string;
  work_location: string;
  work_date_from: string;
  work_date_to: string;
  created_at: string;
}

const ScanVerify = () => {
  const navigate = useNavigate();
  const [manualPermitNo, setManualPermitNo] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [permitInfo, setPermitInfo] = useState<PermitInfo | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isCameraLoading, setIsCameraLoading] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const scannerContainerId = 'qr-scanner-container';

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
      const { data, error } = await supabase
        .from('work_permits')
        .select('id, permit_no, status, requester_name, contractor_name, work_description, work_location, work_date_from, work_date_to, created_at')
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
    setIsCameraActive(true); // Set active first so container becomes visible
    
    // Small delay to ensure the container element is rendered and visible
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
          // QR code successfully scanned
          stopCamera();
          setManualPermitNo(decodedText);
          searchPermit(decodedText);
        },
        () => {
          // Ignore scan failures (no QR detected in frame)
        }
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
      // Cleanup on unmount
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {});
      }
    };
  }, []);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'rejected':
      case 'cancelled':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'closed':
        return 'bg-gray-100 text-gray-800 border-gray-200';
      case 'draft':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      default:
        return 'bg-blue-100 text-blue-800 border-blue-200';
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Scan & Verify</h1>
        <p className="text-muted-foreground mt-1">
          Scan a QR code or enter a permit number to verify its status
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Scanner Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <QrCode className="h-5 w-5" />
              QR Code Scanner
            </CardTitle>
            <CardDescription>
              Point your camera at a permit QR code to scan
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Camera placeholder when not active */}
            {!isCameraActive && !isCameraLoading && (
              <div className="w-full aspect-square bg-muted rounded-lg flex items-center justify-center">
                <div className="text-center text-muted-foreground p-4">
                  <Camera className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>Camera is not active</p>
                </div>
              </div>
            )}
            
            {/* Loading spinner while camera initializes */}
            {isCameraLoading && (
              <div className="w-full aspect-square bg-muted rounded-lg flex items-center justify-center">
                <div className="text-center text-muted-foreground p-4">
                  <Loader2 className="h-12 w-12 mx-auto mb-2 animate-spin" />
                  <p>Initializing camera...</p>
                </div>
              </div>
            )}
            
            {/* Scanner container - must be visible when camera starts */}
            <div
              id={scannerContainerId}
              className={`w-full rounded-lg overflow-hidden ${isCameraActive ? 'min-h-[300px]' : 'hidden'}`}
            />

            {cameraError && (
              <p className="text-sm text-destructive">{cameraError}</p>
            )}

            <Button
              onClick={isCameraActive ? stopCamera : startCamera}
              variant={isCameraActive ? 'destructive' : 'default'}
              className="w-full"
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

        {/* Manual Search Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5" />
              Manual Search
            </CardTitle>
            <CardDescription>
              Enter the permit number to look it up
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="permit-no">Permit Number</Label>
              <Input
                id="permit-no"
                placeholder="e.g., WP-2025-0001"
                value={manualPermitNo}
                onChange={(e) => setManualPermitNo(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && searchPermit(manualPermitNo)}
              />
            </div>
            <Button
              onClick={() => searchPermit(manualPermitNo)}
              disabled={isSearching || !manualPermitNo.trim()}
              className="w-full"
            >
              {isSearching ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Searching...
                </>
              ) : (
                <>
                  <Search className="h-4 w-4 mr-2" />
                  Search Permit
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Results */}
      {permitInfo && (
        <Card className="border-green-200 bg-green-50/50">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-green-700">
                <CheckCircle2 className="h-5 w-5" />
                Permit Found
              </CardTitle>
              <Badge className={getStatusColor(permitInfo.status)}>
                {permitInfo.status.replace(/_/g, ' ').toUpperCase()}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-sm text-muted-foreground">Permit Number</p>
                <p className="font-semibold">{permitInfo.permit_no}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Requester</p>
                <p className="font-medium">{permitInfo.requester_name}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Contractor</p>
                <p className="font-medium">{permitInfo.contractor_name}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Work Location</p>
                <p className="font-medium">{permitInfo.work_location}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Work Period</p>
                <p className="font-medium">
                  {formatDate(permitInfo.work_date_from)} - {formatDate(permitInfo.work_date_to)}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Created On</p>
                <p className="font-medium">{formatDate(permitInfo.created_at)}</p>
              </div>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Work Description</p>
              <p className="font-medium">{permitInfo.work_description}</p>
            </div>
            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => navigate(`/permits/${permitInfo.id}`)}
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                View Full Details
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => window.print()}
              >
                <Printer className="h-4 w-4 mr-2" />
                Print Verification
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {notFound && (
        <Card className="border-red-200 bg-red-50/50">
          <CardContent className="py-8 text-center">
            <XCircle className="h-12 w-12 text-red-500 mx-auto mb-3" />
            <h3 className="text-lg font-semibold text-red-700">Permit Not Found</h3>
            <p className="text-sm text-red-600 mt-1">
              No permit was found with the number "{manualPermitNo}".
              Please check the number and try again.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default ScanVerify;
