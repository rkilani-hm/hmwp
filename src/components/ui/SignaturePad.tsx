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
  /**
   * Optional initial signature as a PNG data URL. When provided, the pad
   * draws this image into the canvas on mount and immediately commits it
   * via onSave — so the parent sees a non-null signature without the user
   * having to touch the pad.
   *
   * Use case: an approver has saved a signature in their settings; the
   * SecureApprovalDialog pre-loads it so a single "Confirm" tap completes
   * the approval. The user can still tap Clear and sign fresh to override.
   *
   * Loaded once on mount; subsequent changes to this prop are ignored
   * (avoids stomping on what the user is currently drawing).
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
 *   - Optional initialValue prop pre-loads a saved signature.
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

  // Resize the underlying canvas on mount / window resize so drawing
  // coordinates line up with the displayed element. react-signature-canvas
  // doesn't do this internally for percentage widths.
  //
  // ALSO: after resize, if initialValue was provided, paint the saved
  // signature into the canvas. Must happen AFTER resize because
  // resize() clears the canvas, and BEFORE the first paint so the
  // image appears immediately.
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

    // One-time paint of the saved signature, if any.
    if (initialValue) {
      const img = new Image();
      img.onload = () => {
        const canvas = sigRef.current?.getCanvas();
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        // Render scaled to fit the canvas. devicePixelRatio scaling is
        // already applied to ctx via resize() above, so we use CSS pixels
        // for the destination size.
        const cssW = canvas.offsetWidth;
        const cssH = canvas.offsetHeight;
        // Maintain aspect ratio inside the available area.
        const scale = Math.min(cssW / img.width, cssH / img.height, 1);
        const drawW = img.width * scale;
        const drawH = img.height * scale;
        const dx = (cssW - drawW) / 2;
        const dy = (cssH - drawH) / 2;
        ctx.drawImage(img, dx, dy, drawW, drawH);
        setIsEmpty(false);
        // Commit so the parent gets the signature without user interaction.
        onSave(initialValue);
      };
      img.src = initialValue;
    }

    return () => window.removeEventListener('resize', resize);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
    // mount-only; subsequent initialValue changes are ignored to avoid
    // overwriting the user's in-progress drawing.
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
