import { useEffect, useRef, useState } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import { useTranslation } from 'react-i18next';
import { Button } from './button';
import { Eraser, Sparkles } from 'lucide-react';
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
  /**
   * Optional data-URL to pre-load. When provided, the pad starts already
   * filled with this image (typically the user's saved signature) and
   * shows a small hint telling them it was loaded automatically. Tapping
   * the eraser clears it so they can sign fresh.
   */
  initialValue?: string | null;
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
 *   - Optional `initialValue` prop pre-loads a saved signature.
 */
export function SignaturePad({
  onSave,
  className,
  disabled,
  height = 220,
  initialValue,
}: SignaturePadProps) {
  const { t } = useTranslation();
  const sigRef = useRef<SignatureCanvas>(null);
  const [isEmpty, setIsEmpty] = useState(true);
  const [loadedFromSaved, setLoadedFromSaved] = useState(false);
  const loadedKeyRef = useRef<string | null>(null);

  // Resize the underlying canvas on mount / window resize so drawing
  // coordinates line up with the displayed element. react-signature-canvas
  // doesn't do this internally for percentage widths. After resizing we
  // re-apply the saved signature (if any) because the canvas is cleared
  // by a width/height change.
  useEffect(() => {
    const resize = () => {
      const canvas = sigRef.current?.getCanvas();
      if (!canvas) return;
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      canvas.width = canvas.offsetWidth * ratio;
      canvas.height = canvas.offsetHeight * ratio;
      canvas.getContext('2d')?.scale(ratio, ratio);
      // Reapply pre-loaded signature after the canvas was reset.
      if (initialValue && loadedKeyRef.current === initialValue) {
        sigRef.current?.fromDataURL(initialValue);
      }
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pre-load the saved signature once it arrives.
  useEffect(() => {
    if (!initialValue) return;
    if (loadedKeyRef.current === initialValue) return;
    // Defer to allow canvas size to settle.
    const id = window.setTimeout(() => {
      const pad = sigRef.current;
      if (!pad) return;
      try {
        pad.fromDataURL(initialValue);
        loadedKeyRef.current = initialValue;
        setIsEmpty(false);
        setLoadedFromSaved(true);
        onSave(initialValue);
      } catch {
        // ignore — bad data URL
      }
    }, 50);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialValue]);

  const commit = () => {
    if (sigRef.current && !sigRef.current.isEmpty()) {
      onSave(sigRef.current.toDataURL('image/png'));
      setIsEmpty(false);
      setLoadedFromSaved(false);
    }
  };

  const handleClear = () => {
    sigRef.current?.clear();
    setIsEmpty(true);
    setLoadedFromSaved(false);
    loadedKeyRef.current = null;
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
          onBegin={() => {
            setIsEmpty(false);
            setLoadedFromSaved(false);
          }}
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
      <div className="flex items-center">
        {loadedFromSaved && !isEmpty && (
          <p className="text-xs text-muted-foreground inline-flex items-center gap-1">
            <Sparkles className="w-3 h-3" />
            Loaded from your saved signature
          </p>
        )}
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
