import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { DataProvider } from "@/contexts/DataContext";
import Landing from "./pages/Landing";
import Auth from "./pages/Auth";
import { AppLayout } from "./components/layout/AppLayout";
import Dashboard from "./pages/app/Dashboard";
import Imports from "./pages/app/Imports";
import Listings from "./pages/app/Listings";
import Transactions from "./pages/app/Transactions";
import Payouts from "./pages/app/Payouts";
import Reports from "./pages/app/Reports";
import Taxes from "./pages/app/Taxes";
import Exports from "./pages/app/Exports";
import Settings from "./pages/app/Settings";
import CreateImport from "./pages/app/CreateImport";
import AutoDelivery from "./pages/app/AutoDelivery";
import Marketing from "./pages/app/Marketing";
import Admin from "./pages/app/Admin";
import ResetPassword from "./pages/ResetPassword";
import NotFound from "./pages/NotFound";
import PackagingPreview from "./pages/PackagingPreview";
import { Loader2 } from "lucide-react";

const queryClient = new QueryClient();

const RedirectWithParams = ({ to }: { to: string }) => {
  const location = useLocation();
  return <Navigate to={`${to}${location.search}`} replace />;
};

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  return <>{children}</>;
};

const AuthRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
      </div>
    );
  }

  if (user) {
    return <Navigate to="/app" replace />;
  }

  return <>{children}</>;
};

const AppContent = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route
          path="/auth"
          element={
            <AuthRoute>
              <Auth />
            </AuthRoute>
          }
        />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/packaging-preview" element={<PackagingPreview />} />
        <Route
          path="/app"
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="imports" element={<Imports />} />
          <Route path="listings" element={<Listings />} />
          <Route path="inventory" element={<Navigate to="/app/auto-delivery" replace />} />
          <Route path="import" element={<RedirectWithParams to="/app/imports" />} />
          <Route path="transactions" element={<Transactions />} />
          <Route path="payouts" element={<Payouts />} />
          <Route path="taxes" element={<Taxes />} />
          <Route path="reports" element={<Reports />} />
          <Route path="exports" element={<Exports />} />
          <Route path="create" element={<CreateImport />} />
          <Route path="auto-delivery" element={<AutoDelivery />} />
          <Route path="marketing" element={<Marketing />} />
          <Route path="digital-keys" element={<Navigate to="/app/auto-delivery" replace />} />
          <Route path="settings" element={<Settings />} />
          <Route path="admin" element={<Admin />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AuthProvider>
        <DataProvider>
          <Toaster />
          <Sonner />
          <AppContent />
        </DataProvider>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
