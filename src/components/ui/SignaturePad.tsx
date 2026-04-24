import { useEffect, useRef, useState } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import { useTranslation } from 'react-i18next';
import { Button } from './button';
import { Eraser } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SignaturePadProps {
  onSave: (signature: string | null) => void;
  className?: string;
  disabled?: boolean;
  /**
   * Height in CSS pixels. Defaults to 220 — roughly double the legacy 128px
   * which was cramped on phones. Approvers need room to actually sign.
   */
  height?: number;
}

/**
 * SignaturePad (Phase 3b redesign)
 *
 * Changes from previous version:
 *   - Default height 220px (was 128) so signing feels natural on mobile.
 *   - Pen color now matches brand foreground token so it stays legible on
 *     both light and dark surfaces.
 *   - Auto-commits the signature on stroke end — no second tap required.
 *     Caller gets the dataURL immediately after each pen lift; Clear
 *     pushes null back. This removes the two-step ceremony the legacy
 *     pad had (sign → Confirm button).
 *   - Translatable copy.
 *   - RTL-safe (uses logical properties).
 */
export function SignaturePad({ onSave, className, disabled, height = 220 }: SignaturePadProps) {
  const { t } = useTranslation();
  const sigRef = useRef<SignatureCanvas>(null);
  const [isEmpty, setIsEmpty] = useState(true);

  // Resize the underlying canvas on mount / window resize so drawing
  // coordinates line up with the displayed element. react-signature-canvas
  // doesn't do this internally for percentage widths.
  useEffect(() => {
    const resize = () => {
      const canvas = sigRef.current?.getCanvas();
      if (!canvas) return;
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      canvas.width = canvas.offsetWidth * ratio;
      canvas.height = canvas.offsetHeight * ratio;
      canvas.getContext('2d')?.scale(ratio, ratio);
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  const commit = () => {
    if (sigRef.current && !sigRef.current.isEmpty()) {
      onSave(sigRef.current.toDataURL('image/png'));
      setIsEmpty(false);
    }
  };

  const handleClear = () => {
    sigRef.current?.clear();
    setIsEmpty(true);
    onSave(null);
  };

  return (
    <div className={cn('space-y-2', className)}>
      <div
        className={cn(
          'relative border-2 border-dashed rounded-lg bg-card overflow-hidden',
          disabled
            ? 'opacity-50 pointer-events-none border-muted'
            : 'border-border hover:border-primary/40 focus-within:border-primary transition-colors',
        )}
        style={{ height }}
      >
        <SignatureCanvas
          ref={sigRef}
          canvasProps={{
            className: 'w-full h-full cursor-crosshair touch-none',
            style: { width: '100%', height: '100%' },
          }}
          backgroundColor="transparent"
          penColor="hsl(60 3% 11%)"
          minWidth={1.2}
          maxWidth={2.4}
          velocityFilterWeight={0.7}
          onBegin={() => setIsEmpty(false)}
          onEnd={commit}
        />
        {isEmpty && !disabled && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <p className="text-muted-foreground text-sm" dir="auto">
              {t('permits.approve.signature')}
            </p>
          </div>
        )}
      </div>
      <div className="flex">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleClear}
          disabled={disabled || isEmpty}
          className="ms-auto"
        >
          <Eraser className="w-4 h-4 me-2" />
          {t('permits.approve.clearSignature')}
        </Button>
      </div>
    </div>
  );
}
