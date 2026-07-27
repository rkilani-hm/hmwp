import { PermitFormWizard } from '@/components/forms/PermitFormWizard';
import { motion } from 'framer-motion';

/**
 * Single entry point for all requests. The form itself asks the purpose first
 * (step 1), then adapts the fields + workflow — the user never classifies a
 * "work permit" vs "gate pass".
 */
export default function NewRequest() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div>
        <h1 className="text-2xl md:text-3xl font-display font-bold">New Request</h1>
        <p className="text-muted-foreground mt-1">
          Tell us the purpose — we'll set up the right form for you.
        </p>
      </div>

      <PermitFormWizard />
    </motion.div>
  );
}
