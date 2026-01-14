import { PlayCircle, Clock, ExternalLink } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface VideoTutorialProps {
  title: string;
  description: string;
  duration: string;
  thumbnail?: string;
  videoUrl?: string;
}

const VideoTutorial = ({ title, description, duration, thumbnail, videoUrl }: VideoTutorialProps) => {
  const handleClick = () => {
    if (videoUrl) {
      window.open(videoUrl, '_blank');
    }
  };

  return (
    <Card className="overflow-hidden hover:shadow-md transition-shadow cursor-pointer group" onClick={handleClick}>
      <div className="relative aspect-video bg-gradient-to-br from-primary/20 to-primary/5">
        {thumbnail ? (
          <img src={thumbnail} alt={title} className="w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
              <PlayCircle className="h-10 w-10 text-primary" />
            </div>
          </div>
        )}
        <Badge variant="secondary" className="absolute bottom-2 right-2 flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {duration}
        </Badge>
      </div>
      <CardContent className="p-4">
        <h4 className="font-semibold text-sm mb-1 group-hover:text-primary transition-colors flex items-center gap-1">
          {title}
          <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
        </h4>
        <p className="text-xs text-muted-foreground line-clamp-2">{description}</p>
      </CardContent>
    </Card>
  );
};

export default VideoTutorial;
