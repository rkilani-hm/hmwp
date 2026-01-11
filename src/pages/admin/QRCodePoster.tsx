import { QRCodeSVG } from 'qrcode.react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Printer, ArrowLeft, Download, QrCode } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import alHamraLogo from '@/assets/al-hamra-logo.jpg';

export default function QRCodePoster() {
  const navigate = useNavigate();
  
  // Get the base URL for the QR code
  const baseUrl = window.location.origin;
  const permitRequestUrl = `${baseUrl}/request-permit`;

  const handlePrint = () => {
    window.print();
  };

  const handleDownload = () => {
    // Create a canvas from the SVG for download
    const svg = document.querySelector('#qr-code-svg svg') as SVGSVGElement;
    if (!svg) return;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const svgData = new XMLSerializer().serializeToString(svg);
    const img = new Image();
    
    canvas.width = 400;
    canvas.height = 400;
    
    img.onload = () => {
      ctx?.drawImage(img, 0, 0, 400, 400);
      const link = document.createElement('a');
      link.download = 'al-hamra-permit-qr-code.png';
      link.href = canvas.toDataURL('image/png');
      link.click();
    };
    
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Controls - hidden when printing */}
      <div className="print:hidden p-4 border-b bg-card sticky top-0 z-10">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <Button variant="ghost" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleDownload}>
              <Download className="h-4 w-4 mr-2" />
              Download QR
            </Button>
            <Button onClick={handlePrint}>
              <Printer className="h-4 w-4 mr-2" />
              Print Poster
            </Button>
          </div>
        </div>
      </div>

      {/* Printable Poster */}
      <div className="p-4 print:p-0">
        <div className="max-w-2xl mx-auto print:max-w-none">
          <Card className="print:border-0 print:shadow-none">
            <CardContent className="p-8 print:p-12">
              {/* Poster Content */}
              <div className="flex flex-col items-center text-center space-y-8">
                {/* Logo */}
                <img 
                  src={alHamraLogo} 
                  alt="Al Hamra Logo" 
                  className="h-20 print:h-24 object-contain"
                />

                {/* Title */}
                <div className="space-y-2">
                  <h1 className="text-3xl print:text-4xl font-bold text-foreground">
                    Request a Work Permit
                  </h1>
                  <p className="text-lg print:text-xl text-muted-foreground">
                    Scan the QR code below to submit your request
                  </p>
                </div>

                {/* QR Code */}
                <div 
                  id="qr-code-svg"
                  className="p-6 bg-white rounded-2xl border-4 border-primary/20 shadow-lg print:shadow-none print:border-2"
                >
                  <QRCodeSVG 
                    value={permitRequestUrl}
                    size={280}
                    level="H"
                    includeMargin={true}
                    bgColor="#ffffff"
                    fgColor="#000000"
                  />
                </div>

                {/* Instructions */}
                <div className="space-y-4 max-w-md">
                  <div className="flex items-center justify-center gap-3 text-muted-foreground">
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-bold text-sm">
                      1
                    </div>
                    <p className="text-left">Open your phone camera</p>
                  </div>
                  <div className="flex items-center justify-center gap-3 text-muted-foreground">
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-bold text-sm">
                      2
                    </div>
                    <p className="text-left">Point at the QR code</p>
                  </div>
                  <div className="flex items-center justify-center gap-3 text-muted-foreground">
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-bold text-sm">
                      3
                    </div>
                    <p className="text-left">Complete the permit request form</p>
                  </div>
                </div>

                {/* URL fallback */}
                <div className="pt-4 border-t w-full">
                  <p className="text-sm text-muted-foreground mb-1">
                    Or visit this URL directly:
                  </p>
                  <p className="text-sm font-mono bg-muted px-4 py-2 rounded-lg break-all">
                    {permitRequestUrl}
                  </p>
                </div>

                {/* Footer */}
                <div className="pt-4 text-xs text-muted-foreground">
                  <p>For Al Hamra internal operations only</p>
                  <p className="mt-1">Contractors must have valid identification</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Print Preview Note */}
          <p className="text-center text-sm text-muted-foreground mt-4 print:hidden">
            <QrCode className="h-4 w-4 inline mr-1" />
            This poster is optimized for A4 paper size
          </p>
        </div>
      </div>

      {/* Print-specific styles */}
      <style>{`
        @media print {
          @page {
            size: A4;
            margin: 0;
          }
          body {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
      `}</style>
    </div>
  );
}
