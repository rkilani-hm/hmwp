import { Video } from 'lucide-react';
import VideoTutorial from './VideoTutorial';

interface Tutorial {
  title: string;
  description: string;
  duration: string;
  thumbnail?: string;
  videoUrl?: string;
}

interface VideoTutorialsSectionProps {
  tutorials: Tutorial[];
  title?: string;
}

const VideoTutorialsSection = ({ tutorials, title = "Video Tutorials" }: VideoTutorialsSectionProps) => {
  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold flex items-center gap-2">
        <Video className="h-5 w-5 text-primary" />
        {title}
      </h2>
      <p className="text-muted-foreground text-sm">
        Watch step-by-step video guides to learn how to use the system effectively.
      </p>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {tutorials.map((tutorial, index) => (
          <VideoTutorial
            key={index}
            title={tutorial.title}
            description={tutorial.description}
            duration={tutorial.duration}
            thumbnail={tutorial.thumbnail}
            videoUrl={tutorial.videoUrl}
          />
        ))}
      </div>
    </section>
  );
};

export default VideoTutorialsSection;
