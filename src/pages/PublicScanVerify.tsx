import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { QrCode, Search, CheckCircle2, XCircle, Loader2, Printer, LogIn, Camera, CameraOff } from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';
import { toast } from 'sonner';
import { useNavigate, useSearchParams } from 'react-router-dom';
import alHamraLogo from '@/assets/al-hamra-logo.jpg';

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

const PublicScanVerify = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [manualPermitNo, setManualPermitNo] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [permitInfo, setPermitInfo] = useState<PermitInfo | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const scannerContainerId = 'public-qr-scanner-container';

  const extractPermitNumber = (scannedText: string): string => {
    // If it's a URL with permit param, extract the permit number
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
    
    try {
      const scanner = new Html5Qrcode(scannerContainerId);
      scannerRef.current = scanner;

      await scanner.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
        },
        (decodedText) => {
          // QR code successfully scanned - extract permit number from URL or text
          stopCamera();
          const permitNo = extractPermitNumber(decodedText);
          setManualPermitNo(permitNo);
          searchPermit(permitNo);
        },
        () => {
          // Ignore scan failures (no QR detected in frame)
        }
      );

      setIsCameraActive(true);
    } catch (err: any) {
      console.error('Camera error:', err);
      setCameraError(err?.message || 'Failed to access camera');
      setIsCameraActive(false);
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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {});
      }
    };
  }, []);

  // Auto-search if permit param is in URL (from QR code scan)
  useEffect(() => {
    const permitFromUrl = searchParams.get('permit');
    if (permitFromUrl) {
      setManualPermitNo(permitFromUrl);
      searchPermit(permitFromUrl);
    }
  }, [searchParams]);

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
    <div className="min-h-screen bg-background p-4 sm:p-6 lg:p-8">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center space-y-4 print:hidden">
          <img 
            src={alHamraLogo} 
            alt="Al Hamra Logo" 
            className="h-16 mx-auto"
          />
          <div>
            <h1 className="text-2xl font-bold text-foreground">Permit Verification</h1>
            <p className="text-muted-foreground mt-1">
              Scan a QR code or enter a permit number to verify
            </p>
          </div>
        </div>

        {/* QR Scanner Card */}
        <Card className="print:hidden">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Camera className="h-5 w-5" />
              Scan QR Code
            </CardTitle>
            <CardDescription>
              Use your camera to scan the QR code on the permit
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Scanner container */}
            <div 
              id={scannerContainerId}
              className={`w-full rounded-lg overflow-hidden ${isCameraActive ? 'min-h-[300px]' : 'hidden'}`}
            />
            
            {cameraError && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-center">
                <p className="text-red-600 text-sm">{cameraError}</p>
                <p className="text-red-500 text-xs mt-1">
                  Please ensure camera permissions are granted
                </p>
              </div>
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
        <Card className="print:hidden">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <QrCode className="h-5 w-5" />
              Manual Entry
            </CardTitle>
            <CardDescription>
              Or enter the permit number manually
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
                  Verify Permit
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Results */}
        {permitInfo && (
          <Card className="border-green-200 bg-green-50/50 print:border print:shadow-none">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-green-700">
                  <CheckCircle2 className="h-5 w-5" />
                  Permit Verified
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
              <div className="print:hidden">
                <Button
                  variant="outline"
                  className="w-full"
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

        {/* Login Link */}
        <div className="text-center print:hidden">
          <Button variant="ghost" onClick={() => navigate('/auth')}>
            <LogIn className="h-4 w-4 mr-2" />
            Staff Login
          </Button>
        </div>
      </div>
    </div>
  );
};

export default PublicScanVerify;
