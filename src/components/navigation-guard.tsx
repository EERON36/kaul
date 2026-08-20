"use client";

import Link from "next/link";
import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";

type NavigationGuardState = Readonly<{
  blocked: boolean;
  confirmationMessage: string;
}>;

const NavigationGuardStateContext = createContext<NavigationGuardState>({
  blocked: false,
  confirmationMessage: "",
});
const NavigationGuardSetterContext = createContext<
  ((blocked: boolean) => void) | null
>(null);

export function NavigationGuardProvider({
  children,
  confirmationMessage,
}: Readonly<{ children: ReactNode; confirmationMessage: string }>) {
  const [blocked, setBlocked] = useState(false);
  const state = useMemo(
    () => ({ blocked, confirmationMessage }),
    [blocked, confirmationMessage],
  );

  return (
    <NavigationGuardSetterContext value={setBlocked}>
      <NavigationGuardStateContext value={state}>
        {children}
      </NavigationGuardStateContext>
    </NavigationGuardSetterContext>
  );
}

export function useNavigationGuard() {
  const setBlocked = useContext(NavigationGuardSetterContext);
  if (!setBlocked) {
    throw new Error("useNavigationGuard requires NavigationGuardProvider.");
  }
  return setBlocked;
}

export function NavigationGuardLink({
  onNavigate,
  ...props
}: ComponentProps<typeof Link>) {
  const guard = useContext(NavigationGuardStateContext);

  return (
    <Link
      {...props}
      onNavigate={(event) => {
        onNavigate?.(event);
        if (guard.blocked && !window.confirm(guard.confirmationMessage)) {
          event.preventDefault();
        }
      }}
    />
  );
}
