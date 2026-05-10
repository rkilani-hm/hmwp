import { useState } from 'react';
import { ImageIcon } from 'lucide-react';

/**
 * ScreenshotPlaceholder
 *
 * Renders either:
 *  1. A real screenshot image when `imageSrc` is supplied AND the image
 *     loads successfully, OR
 *  2. A placeholder card with an icon and the description text, which is
 *     also the fallback when an image fails to load (404, network error).
 *
 * Designed for incremental rollout: the team can capture and add
 * screenshots one at a time without breaking the manual page. Each
 * call site that doesn't yet have an `imageSrc` falls through to the
 * placeholder until a real screenshot is dropped in.
 *
 * Screenshots live under `public/manuals/` so they're served at
 * `/manuals/<filename>.png`. See `public/manuals/README.md` for the
 * naming convention.
 */
interface ScreenshotPlaceholderProps {
  title: string;
  description: string;
  step?: number;
  /**
   * Path to the screenshot image, e.g. `/manuals/permit-form-step-1.png`.
   * If omitted, the placeholder card is rendered instead.
   */
  imageSrc?: string;
  /** Optional alt text. Falls back to `description`. */
  imageAlt?: string;
}

const ScreenshotPlaceholder = ({
  title,
  description,
  step,
  imageSrc,
  imageAlt,
}: ScreenshotPlaceholderProps) => {
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = imageSrc && !imageFailed;

  return (
    <div className="my-4 border rounded-lg overflow-hidden bg-card">
      {/* Header: optional step badge + title */}
      <div className="flex items-center gap-2 px-4 py-2.5 bg-muted/30 border-b">
        {step !== undefined && (
          <span className="bg-primary text-primary-foreground text-xs font-bold px-2 py-1 rounded">
            Step {step}
          </span>
        )}
        <span className="text-sm font-medium">{title}</span>
      </div>

      {showImage ? (
        // Real screenshot. Click to open full size in new tab.
        <a
          href={imageSrc}
          target="_blank"
          rel="noopener noreferrer"
          className="block hover:opacity-95 transition-opacity"
          aria-label={`Open screenshot in new tab: ${title}`}
        >
          <img
            src={imageSrc}
            alt={imageAlt || description}
            onError={() => setImageFailed(true)}
            className="w-full h-auto block"
            loading="lazy"
          />
        </a>
      ) : (
        // Placeholder. Either no imageSrc supplied, or image failed to load.
        <div className="aspect-video bg-muted/50 flex flex-col items-center justify-center gap-2 p-4 min-h-[150px]">
          <ImageIcon className="h-12 w-12 text-muted-foreground/50" aria-hidden="true" />
          <p className="text-sm text-muted-foreground text-center">{description}</p>
        </div>
      )}

      {/* Description caption — shown below the image when an image is rendered.
          For the placeholder case the description is already inside the box. */}
      {showImage && (
        <p className="px-4 py-3 text-sm text-muted-foreground border-t bg-muted/10">
          {description}
        </p>
      )}
    </div>
  );
};

export default ScreenshotPlaceholder;
