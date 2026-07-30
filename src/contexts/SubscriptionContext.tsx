import React, { createContext, useContext, ReactNode } from 'react';

interface SubscriptionContextType {
  subscription: null;
  isLoading: boolean;
  hasChecked: boolean;
  hasAccess: boolean;
  isTrialing: boolean;
  daysRemaining: number;
  refreshSubscription: () => Promise<void>;
}

const SubscriptionContext = createContext<SubscriptionContextType | undefined>(undefined);

export const SubscriptionProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  return (
    <SubscriptionContext.Provider
      value={{
        subscription: null,
        isLoading: false,
        hasChecked: true,
        hasAccess: true,
        isTrialing: false,
        daysRemaining: 0,
        refreshSubscription: async () => {},
      }}
    >
      {children}
    </SubscriptionContext.Provider>
  );
};

export const useSubscription = () => {
  const context = useContext(SubscriptionContext);
  if (!context) {
    return {
      subscription: null,
      isLoading: false,
      hasChecked: true,
      hasAccess: true,
      isTrialing: false,
      daysRemaining: 0,
      refreshSubscription: async () => {},
    };
  }
  return context;
};
