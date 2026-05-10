import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";
import PublicScanVerify from "./pages/PublicScanVerify";
import PublicPermitStatus from "./pages/PublicPermitStatus";
import PublicPermitRequest from "./pages/PublicPermitRequest";
import InstallApp from "./pages/InstallApp";
import Onboarding from "./pages/Onboarding";
import PendingApproval from "./pages/PendingApproval";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <LanguageProvider>
          <AuthProvider>
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route path="/status" element={<PublicPermitStatus />} />
            <Route
              path="/verify"
              element={
                <ProtectedRoute>
                  <PublicScanVerify />
                </ProtectedRoute>
              }
            />
            <Route path="/request-permit" element={<PublicPermitRequest />} />
            <Route path="/install" element={<InstallApp />} />
            <Route
              path="/onboarding"
              element={
                <ProtectedRoute>
                  <Onboarding />
                </ProtectedRoute>
              }
            />
            <Route
              path="/pending-approval"
              element={
                <ProtectedRoute>
                  <PendingApproval />
                </ProtectedRoute>
              }
            />
            <Route
              path="/*"
              element={
                <ProtectedRoute>
                  <Index />
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
        </LanguageProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
