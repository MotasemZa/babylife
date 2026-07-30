import { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Link as LinkIcon,
  Receipt,
  CreditCard,
  FileText,
  Download,
  Settings,
  ChevronLeft,
  ChevronRight,
  LogOut,
  User,
  Calculator,
  Package,
  PlusCircle,
  ChevronDown,
  Shield,
  Zap,
  Megaphone,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useIsMobile } from '@/hooks/use-mobile';
import inbewIcon from '@/assets/brand/inbew-icon.png';
import { BRAND } from '@/config/brand';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Sheet,
  SheetContent,
} from "@/components/ui/sheet";

interface NavItem {
  name: string;
  path: string;
  icon: any;
  children?: NavItem[];
}

const navItems: NavItem[] = [
  { name: 'Dashboard', path: '/app', icon: LayoutDashboard },
  { name: 'Connections', path: '/app/imports', icon: LinkIcon },
  { name: 'Listings', path: '/app/listings', icon: Package },
  { name: 'Create / Import', path: '/app/create', icon: PlusCircle },
  { name: 'Auto-Delivery', path: '/app/auto-delivery', icon: Zap },
  { name: 'Marketing', path: '/app/marketing', icon: Megaphone },
  { 
    name: 'Reports', 
    path: '/app/reports', 
    icon: FileText,
    children: [
      { name: 'Overview', path: '/app/reports', icon: FileText },
      { name: 'Transactions', path: '/app/transactions', icon: Receipt },
      { name: 'Payouts', path: '/app/payouts', icon: CreditCard },
      { name: 'Taxes', path: '/app/taxes', icon: Calculator },
      { name: 'Exports', path: '/app/exports', icon: Download },
    ]
  },
  { name: 'Settings', path: '/app/settings', icon: Settings },
];

interface AppSidebarProps {
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  mobileOpen?: boolean;
  onMobileOpenChange?: (open: boolean) => void;
}

export const AppSidebar = ({ collapsed = false, onCollapsedChange, mobileOpen = false, onMobileOpenChange }: AppSidebarProps) => {
  const [isAdmin, setIsAdmin] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const isMobile = useIsMobile();

  const reportsItem = navItems.find(item => item.name === 'Reports');
  const reportsPaths = reportsItem?.children?.map(child => child.path) || [];
  const isInReportsSection = reportsPaths.includes(location.pathname);

  const [reportsOpen, setReportsOpen] = useState(false);

  useEffect(() => {
    setReportsOpen(isInReportsSection);
  }, [isInReportsSection]);

  useEffect(() => {
    if (user) {
      supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('role', 'admin')
        .single()
        .then(({ data }) => {
          setIsAdmin(!!data);
        });
    }
  }, [user]);

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  const handleNavClick = () => {
    if (isMobile) {
      onMobileOpenChange?.(false);
    }
  };

  const isActiveItem = (path: string, children?: NavItem[]) => {
    if (location.pathname === path) return true;
    if (children) {
      return children.some(child => location.pathname === child.path);
    }
    return false;
  };

  const effectiveCollapsed = isMobile ? false : collapsed;

  const renderNavItem = (item: NavItem) => {
    const hasChildren = item.children && item.children.length > 0;
    const isActive = isActiveItem(item.path, item.children);

    if (hasChildren && !effectiveCollapsed) {
      return (
        <Collapsible key={item.path} open={reportsOpen} onOpenChange={setReportsOpen}>
          <CollapsibleTrigger asChild>
            <button
              className={cn(
                'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                  : 'text-sidebar-muted hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
              )}
            >
              <item.icon className="h-5 w-5 shrink-0" />
              <span className="flex-1 text-left">{item.name}</span>
              <ChevronDown className={cn("h-4 w-4 transition-transform", reportsOpen && "rotate-180")} />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pl-4 space-y-1 mt-1">
            {item.children!.map((child) => {
              const isChildActive = location.pathname === child.path;
              return (
                <Link
                  key={child.path}
                  to={child.path}
                  onClick={handleNavClick}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    isChildActive
                      ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                      : 'text-sidebar-muted hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
                  )}
                >
                  <child.icon className="h-4 w-4 shrink-0" />
                  <span>{child.name}</span>
                </Link>
              );
            })}
          </CollapsibleContent>
        </Collapsible>
      );
    }

    if (hasChildren && effectiveCollapsed) {
      return (
        <Link
          key={item.path}
          to={item.path}
          onClick={handleNavClick}
          className={cn(
            'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
            isActive
              ? 'bg-sidebar-accent text-sidebar-accent-foreground'
              : 'text-sidebar-muted hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
          )}
        >
          <item.icon className="h-5 w-5 shrink-0" />
        </Link>
      );
    }

    return (
      <Link
        key={item.path}
        to={item.path}
        onClick={handleNavClick}
        className={cn(
          'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
          isActive
            ? 'bg-sidebar-accent text-sidebar-accent-foreground'
            : 'text-sidebar-muted hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
        )}
      >
        <item.icon className="h-5 w-5 shrink-0" />
        {!effectiveCollapsed && <span>{item.name}</span>}
      </Link>
    );
  };

  const sidebarContent = (
    <>
      {/* Logo */}
      <div className="flex h-16 items-center justify-between border-b border-sidebar-border px-4">
        {!effectiveCollapsed && (
          <Link to="/app" onClick={handleNavClick} className="flex items-center gap-2">
            <img
              src={inbewIcon}
              alt="inbew"
              className="h-8 w-8 rounded-lg border border-sidebar-border bg-sidebar-accent/30 object-contain p-1"
              loading="eager"
              decoding="async"
            />
            <div className="leading-tight">
              <span className="block font-heading text-lg font-semibold">{BRAND.appName}</span>
              <span className="block text-xs text-sidebar-muted">{BRAND.business.legalName}</span>
            </div>
          </Link>
        )}
        {effectiveCollapsed && (
          <img
            src={inbewIcon}
            alt="inbew"
            className="mx-auto h-8 w-8 rounded-lg border border-sidebar-border bg-sidebar-accent/30 object-contain p-1"
            loading="eager"
            decoding="async"
          />
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {navItems.map(renderNavItem)}
        
        {isAdmin && (
          <Link
            to="/app/admin"
            onClick={handleNavClick}
            className={cn(
              'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors mt-2 border-t border-sidebar-border pt-3',
              location.pathname === '/app/admin'
                ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                : 'text-sidebar-muted hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
            )}
          >
            <Shield className="h-5 w-5 shrink-0" />
            {!effectiveCollapsed && <span>Admin</span>}
          </Link>
        )}
      </nav>

      {/* Bottom Section */}
      <div className="border-t border-sidebar-border p-4 space-y-3">
        {user && !effectiveCollapsed && (
          <div className="flex items-center gap-2 rounded-lg bg-sidebar-accent/30 p-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-sidebar-primary text-sidebar-primary-foreground">
              <User className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium truncate">{user.email}</p>
            </div>
          </div>
        )}

        {user ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSignOut}
            className="w-full justify-start text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-foreground"
          >
            <LogOut className="h-4 w-4" />
            {!effectiveCollapsed && <span className="ml-2">Sign Out</span>}
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { navigate('/auth'); handleNavClick(); }}
            className="w-full justify-start text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-foreground"
          >
            <User className="h-4 w-4" />
            {!effectiveCollapsed && <span className="ml-2">Sign In</span>}
          </Button>
        )}
        
        {/* Collapse Button - desktop only */}
        {!isMobile && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onCollapsedChange?.(!collapsed)}
            className="w-full justify-center text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-foreground"
          >
            {collapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <>
                <ChevronLeft className="h-4 w-4" />
                <span className="ml-2">Collapse</span>
              </>
            )}
          </Button>
        )}
      </div>
    </>
  );

  // Mobile: render in a Sheet
  if (isMobile) {
    return (
      <Sheet open={mobileOpen} onOpenChange={onMobileOpenChange}>
        <SheetContent side="left" className="w-64 p-0 bg-sidebar text-sidebar-foreground [&>button]:hidden">
          <div className="flex h-full flex-col">
            {sidebarContent}
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  // Desktop: fixed aside
  return (
    <aside
      className={cn(
        'fixed left-0 top-0 z-40 flex h-screen flex-col bg-sidebar text-sidebar-foreground transition-all duration-300',
        collapsed ? 'w-16' : 'w-64'
      )}
    >
      {sidebarContent}
    </aside>
  );
};
