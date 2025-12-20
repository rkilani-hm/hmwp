import { useRef, useState } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import { Button } from './button';
import { Eraser, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SignaturePadProps {
  onSave: (signature: string) => void;
  className?: string;
  disabled?: boolean;
}

export function SignaturePad({ onSave, className, disabled }: SignaturePadProps) {
  const sigRef = useRef<SignatureCanvas>(null);
  const [isEmpty, setIsEmpty] = useState(true);

  const handleClear = () => {
    sigRef.current?.clear();
    setIsEmpty(true);
  };

  const handleSave = () => {
    if (sigRef.current && !sigRef.current.isEmpty()) {
      const dataUrl = sigRef.current.toDataURL('image/png');
      onSave(dataUrl);
    }
  };

  const handleBegin = () => {
    setIsEmpty(false);
  };

  return (
    <div className={cn('space-y-3', className)}>
      <div className="relative">
        <div className={cn(
          'border-2 border-dashed rounded-lg bg-card overflow-hidden',
          disabled ? 'opacity-50 pointer-events-none border-muted' : 'border-border hover:border-accent/50 transition-colors'
        )}>
          <SignatureCanvas
            ref={sigRef}
            canvasProps={{
              className: 'w-full h-32 cursor-crosshair',
              style: { width: '100%', height: '128px' }
            }}
            backgroundColor="transparent"
            penColor="hsl(215, 25%, 15%)"
            onBegin={handleBegin}
          />
          {isEmpty && !disabled && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <p className="text-muted-foreground text-sm">Sign here</p>
            </div>
          )}
        </div>
      </div>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleClear}
          disabled={disabled || isEmpty}
          className="flex-1"
        >
          <Eraser className="w-4 h-4 mr-2" />
          Clear
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={handleSave}
          disabled={disabled || isEmpty}
          className="flex-1 bg-accent text-accent-foreground hover:bg-accent/90"
        >
          <Check className="w-4 h-4 mr-2" />
          Confirm Signature
        </Button>
      </div>
    </div>
  );
}
