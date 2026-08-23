"use client";

import Link from "next/link";
import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type MutableRefObject,
  type ReactNode,
} from "react";

const HISTORY_POSITION_KEY = "__kaulNavigationPosition";

function readHistoryPosition(state: unknown) {
  if (typeof state !== "object" || state === null) return null;
  const position = Reflect.get(state, HISTORY_POSITION_KEY);
  return typeof position === "number" &&
    Number.isSafeInteger(position) &&
    position >= 0
    ? position
    : null;
}

function readBrowserHistoryPosition() {
  const navigation = Reflect.get(window, "navigation") as
    { currentEntry?: { index?: unknown } } | undefined;
  const position = navigation?.currentEntry?.index;
  return typeof position === "number" &&
    Number.isSafeInteger(position) &&
    position >= 0
    ? position
    : null;
}

function withHistoryPosition(state: unknown, position: number) {
  return {
    ...(typeof state === "object" && state !== null ? state : {}),
    [HISTORY_POSITION_KEY]: position,
  };
}

function ensureCurrentHistoryPosition() {
  const existingPosition = readHistoryPosition(window.history.state);
  if (existingPosition !== null) return existingPosition;

  const position = readBrowserHistoryPosition() ?? 0;
  window.history.replaceState(
    withHistoryPosition(window.history.state, position),
    "",
    window.location.href,
  );
  return position;
}

type NavigationGuardState = Readonly<{
  blocked: boolean;
  confirmationMessage: string;
}>;

const NavigationGuardStateContext = createContext<NavigationGuardState>({
  blocked: false,
  confirmationMessage: "",
});
const NavigationHistoryGuardContext = createContext<MutableRefObject<
  NavigationGuardState & { owner: symbol | null }
> | null>(null);
const NavigationGuardSetterContext = createContext<
  ((blocked: boolean) => void) | null
>(null);

export function NavigationGuardProvider({
  children,
  confirmationMessage,
}: Readonly<{ children: ReactNode; confirmationMessage: string }>) {
  const [blocked, setBlockedState] = useState(false);
  const state = useMemo(
    () => ({ blocked, confirmationMessage }),
    [blocked, confirmationMessage],
  );
  const historyGuardRef = useContext(NavigationHistoryGuardContext);
  const ownerRef = useRef(Symbol("navigation-guard"));
  const setBlocked = useCallback(
    (nextBlocked: boolean) => {
      if (historyGuardRef) {
        historyGuardRef.current = {
          blocked: nextBlocked,
          confirmationMessage,
          owner: ownerRef.current,
        };
      }
      setBlockedState(nextBlocked);
    },
    [confirmationMessage, historyGuardRef],
  );

  useLayoutEffect(() => {
    if (!historyGuardRef) return;
    const owner = ownerRef.current;
    const registration = { ...state, owner };
    historyGuardRef.current = registration;
    return () => {
      if (historyGuardRef.current.owner === owner) {
        historyGuardRef.current = {
          blocked: false,
          confirmationMessage: "",
          owner: null,
        };
      }
    };
  }, [historyGuardRef, state]);

  return (
    <NavigationGuardSetterContext value={setBlocked}>
      <NavigationGuardStateContext value={state}>
        {children}
      </NavigationGuardStateContext>
    </NavigationGuardSetterContext>
  );
}

export function NavigationHistoryTracker({
  children,
}: Readonly<{ children: ReactNode }>) {
  const guard = useRef({
    blocked: false,
    confirmationMessage: "",
    owner: null as symbol | null,
  });

  // Next registers its App Router popstate listener in a passive effect. The
  // layout phase keeps this guard ahead of it without using Next internals.
  useLayoutEffect(() => {
    const history = window.history;
    let currentPosition = ensureCurrentHistoryPosition();
    let restoringCurrentEntry = false;
    const originalPushState = history.pushState.bind(history);
    const originalReplaceState = history.replaceState.bind(history);

    const trackedPushState: History["pushState"] = (data, unused, url) => {
      const nextPosition = currentPosition + 1;
      originalPushState(withHistoryPosition(data, nextPosition), unused, url);
      currentPosition = nextPosition;
    };
    const trackedReplaceState: History["replaceState"] = (
      data,
      unused,
      url,
    ) => {
      originalReplaceState(
        withHistoryPosition(data, currentPosition),
        unused,
        url,
      );
    };
    const trackAndGuardTraversal = (event: PopStateEvent) => {
      const destinationPosition =
        readHistoryPosition(event.state) ?? readBrowserHistoryPosition();
      if (destinationPosition === null) return;

      if (restoringCurrentEntry) {
        restoringCurrentEntry = false;
        currentPosition = destinationPosition;
        return;
      }

      if (
        !guard.current.blocked ||
        window.confirm(guard.current.confirmationMessage)
      ) {
        currentPosition = destinationPosition;
        return;
      }

      const returnDelta = currentPosition - destinationPosition;
      if (returnDelta === 0) return;

      // popstate cannot be cancelled. Keep Next on the editor, then traverse
      // back to the source entry after this event finishes dispatching; the
      // restorative popstate is allowed above.
      event.stopImmediatePropagation();
      restoringCurrentEntry = true;
      queueMicrotask(() => window.history.go(returnDelta));
    };

    history.pushState = trackedPushState;
    history.replaceState = trackedReplaceState;
    window.addEventListener("popstate", trackAndGuardTraversal, true);

    return () => {
      window.removeEventListener("popstate", trackAndGuardTraversal, true);
      if (history.pushState === trackedPushState) {
        history.pushState = originalPushState;
      }
      if (history.replaceState === trackedReplaceState) {
        history.replaceState = originalReplaceState;
      }
    };
  }, []);

  return (
    <NavigationHistoryGuardContext value={guard}>
      {children}
    </NavigationHistoryGuardContext>
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
        if (guard.blocked && !window.confirm(guard.confirmationMessage)) {
          event.preventDefault();
          return;
        }
        onNavigate?.(event);
      }}
    />
  );
}
