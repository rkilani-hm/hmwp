import { ImageIcon } from 'lucide-react';

interface ScreenshotPlaceholderProps {
  title: string;
  description: string;
  step?: number;
}

const ScreenshotPlaceholder = ({ title, description, step }: ScreenshotPlaceholderProps) => {
  return (
    <div className="my-4 border-2 border-dashed border-muted-foreground/30 rounded-lg bg-muted/30 p-4">
      <div className="flex items-center gap-2 mb-2">
        {step && (
          <span className="bg-primary text-primary-foreground text-xs font-bold px-2 py-1 rounded">
            Step {step}
          </span>
        )}
        <span className="text-sm font-medium text-muted-foreground">{title}</span>
      </div>
      <div className="aspect-video bg-muted/50 rounded-md flex flex-col items-center justify-center gap-2 min-h-[150px]">
        <ImageIcon className="h-12 w-12 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground text-center px-4">{description}</p>
      </div>
    </div>
  );
};

export default ScreenshotPlaceholder;
