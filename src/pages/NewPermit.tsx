import { PermitFormWizard } from '@/components/forms/PermitFormWizard';
import { motion } from 'framer-motion';

export default function NewPermit() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div>
        <h1 className="text-2xl md:text-3xl font-display font-bold">
          New Work Permit Request
        </h1>
        <p className="text-muted-foreground mt-1">
          Complete all required fields to submit your permit request
        </p>
      </div>

      <PermitFormWizard />
    </motion.div>
  );
}
