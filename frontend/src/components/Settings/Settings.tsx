"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { SignOutButton, useAuth } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";

/** The NestJS backend this frontend calls cross-origin (ADR 0004). Re-declared locally, not imported, to avoid a circular import with Home.tsx — same pattern as Leaderboard.tsx / PosterGrid.tsx. */
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

/** `GET /me`'s wire shape (backend/src/users/profile.dto.ts). */
interface ProfileWire {
  id: string;
  friend_code: string;
}

/** One User as seen from someone else's Friend Request (backend/src/friends/user-summary.dto.ts). */
interface UserSummaryWire {
  id: string;
  friend_code: string;
  email: string;
}

/** One pending Friend Request, from the caller's point of view (backend/src/friends/friend-request.dto.ts). */
interface FriendRequestWire {
  id: string;
  user: UserSummaryWire;
  created_at: string;
}

/** `GET /friend-requests`'s wire shape. */
interface FriendRequestsListWire {
  incoming: FriendRequestWire[];
  outgoing: FriendRequestWire[];
}

interface FriendRequestEntry {
  id: string;
  email: string;
}

function toEntry(wire: FriendRequestWire): FriendRequestEntry {
  return { id: wire.id, email: wire.user.email };
}

type ProfileState = { status: "loading" } | { status: "error" } | { status: "ready"; friendCode: string };

type RequestsState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; incoming: FriendRequestEntry[]; outgoing: FriendRequestEntry[] };

interface SettingsProps {
  /** Bumped after an accept so the caller (Home) can refetch the Leaderboard immediately (#15) — same lifted-refresh-key pattern as SpotlightPalette's `onShowAdded` -> Home's `showsRefreshKey` -> PosterGrid. */
  onFriendAccepted?: () => void;
}

/** How long the "Friend Code copied" confirmation stays up. */
const COPY_TOAST_MS = 2000;

/**
 * Settings (#16, docs/design.md): a single narrow column of hairline-
 * separated rows — Friend Code (+ Copy), Regenerate, Add a friend, Pending
 * requests. Owns its own `GET /me` and `GET /friend-requests` fetches, same
 * as Leaderboard owns `GET /leaderboard` — frontend tests fake the network
 * via MSW rather than a live backend.
 *
 * No toast component exists yet elsewhere in the app (design.md's "Friend
 * Code copied" example is the first toast this app actually builds — the
 * only prior toast is in the archived throwaway prototype), so Copy's
 * confirmation is a small self-contained `role="status"` note rather than a
 * shared toast system this ticket doesn't otherwise need.
 */
export function Settings({ onFriendAccepted }: SettingsProps) {
  const { getToken } = useAuth();
  const [profileState, setProfileState] = useState<ProfileState>({ status: "loading" });
  const [requestsState, setRequestsState] = useState<RequestsState>({ status: "loading" });

  const [copyToastVisible, setCopyToastVisible] = useState(false);
  const [regenerateArmed, setRegenerateArmed] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [regenerateError, setRegenerateError] = useState<string | null>(null);

  const [addFriendValue, setAddFriendValue] = useState("");
  const [sending, setSending] = useState(false);
  const [addFriendError, setAddFriendError] = useState<string | null>(null);

  const [busyRequestId, setBusyRequestId] = useState<string | null>(null);
  const [requestActionError, setRequestActionError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const token = await getToken();
      try {
        const response = await fetch(`${API_URL}/me`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!response.ok) throw new Error(`GET /me failed: ${response.status}`);
        const body = (await response.json()) as ProfileWire;
        if (!cancelled) setProfileState({ status: "ready", friendCode: body.friend_code });
      } catch {
        if (!cancelled) setProfileState({ status: "error" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [getToken]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const token = await getToken();
      try {
        const response = await fetch(`${API_URL}/friend-requests`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!response.ok) throw new Error(`GET /friend-requests failed: ${response.status}`);
        const body = (await response.json()) as FriendRequestsListWire;
        if (!cancelled) {
          setRequestsState({
            status: "ready",
            incoming: body.incoming.map(toEntry),
            outgoing: body.outgoing.map(toEntry),
          });
        }
      } catch {
        if (!cancelled) setRequestsState({ status: "error" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [getToken]);

  useEffect(() => {
    if (!copyToastVisible) return;
    const timer = setTimeout(() => setCopyToastVisible(false), COPY_TOAST_MS);
    return () => clearTimeout(timer);
  }, [copyToastVisible]);

  async function handleCopy() {
    if (profileState.status !== "ready") return;
    await navigator.clipboard.writeText(profileState.friendCode);
    setCopyToastVisible(true);
  }

  async function handleRegenerate() {
    // First click only arms the confirmation — the consequence ("the old
    // code stops working") is real and irreversible, so this mirrors
    // ShowDetailModal's delete-show arm/confirm dance rather than acting on
    // the first click.
    if (!regenerateArmed) {
      setRegenerateArmed(true);
      return;
    }
    setRegenerating(true);
    setRegenerateError(null);
    try {
      const token = await getToken();
      const response = await fetch(`${API_URL}/me/friend-code/regenerate`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) throw new Error(`POST regenerate failed: ${response.status}`);
      const body = (await response.json()) as ProfileWire;
      setProfileState({ status: "ready", friendCode: body.friend_code });
      setRegenerateArmed(false);
    } catch {
      setRegenerateError("Couldn't regenerate the Friend Code. Try again.");
    } finally {
      setRegenerating(false);
    }
  }

  async function handleSendRequest(event: FormEvent) {
    event.preventDefault();
    const value = addFriendValue.trim();
    if (!value || sending) return;

    setSending(true);
    setAddFriendError(null);
    try {
      const token = await getToken();
      const response = await fetch(`${API_URL}/friend-requests`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        // CreateFriendRequestDto wants exactly one of code/email — "@" is
        // never a valid Friend Code character (friend-code-generator.ts), so
        // it's an unambiguous way to tell the two apart from one input.
        body: JSON.stringify(value.includes("@") ? { email: value } : { code: value }),
      });
      if (!response.ok) throw new Error(`POST /friend-requests failed: ${response.status}`);
      const wire = (await response.json()) as FriendRequestWire;

      setRequestsState((prev) => {
        if (prev.status !== "ready") return prev;
        // Resending an identical request converges on the backend's one
        // existing pending row (friend-requests.service.ts) rather than
        // erroring — dedupe here so that row doesn't show up twice.
        if (prev.outgoing.some((request) => request.id === wire.id)) return prev;
        return { ...prev, outgoing: [...prev.outgoing, toEntry(wire)] };
      });
      setAddFriendValue("");
    } catch {
      setAddFriendError("Couldn't find a match for that Friend Code or email.");
    } finally {
      setSending(false);
    }
  }

  async function handleAccept(requestId: string) {
    setBusyRequestId(requestId);
    setRequestActionError(null);
    try {
      const token = await getToken();
      const response = await fetch(`${API_URL}/friend-requests/${requestId}/accept`, {
        method: "PUT",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) throw new Error(`PUT accept failed: ${response.status}`);
      setRequestsState((prev) =>
        prev.status === "ready"
          ? { ...prev, incoming: prev.incoming.filter((request) => request.id !== requestId) }
          : prev,
      );
      onFriendAccepted?.();
    } catch {
      setRequestActionError("Couldn't accept the request. Try again.");
    } finally {
      setBusyRequestId(null);
    }
  }

  async function handleDecline(requestId: string) {
    setBusyRequestId(requestId);
    setRequestActionError(null);
    try {
      const token = await getToken();
      const response = await fetch(`${API_URL}/friend-requests/${requestId}/decline`, {
        method: "PUT",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) throw new Error(`PUT decline failed: ${response.status}`);
      setRequestsState((prev) =>
        prev.status === "ready"
          ? { ...prev, incoming: prev.incoming.filter((request) => request.id !== requestId) }
          : prev,
      );
    } catch {
      setRequestActionError("Couldn't decline the request. Try again.");
    } finally {
      setBusyRequestId(null);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-[560px] flex-col">
      <SettingsRow label="Friend Code" description="Share this so a friend can send you a Friend Request.">
        {profileState.status === "loading" && (
          <p role="status" className="text-sm text-muted-foreground">
            Loading…
          </p>
        )}
        {profileState.status === "error" && (
          <p role="alert" className="text-sm text-destructive">
            Couldn&apos;t load your Friend Code.
          </p>
        )}
        {profileState.status === "ready" && (
          <div className="flex items-center gap-2">
            {/* Extra right padding gives the tracked-out last character (plus its trailing letter-spacing) clear room instead of sitting flush against the edge. */}
            <span className="rounded-md bg-muted py-1.5 pr-4 pl-3 font-mono text-sm font-bold tracking-[0.15em]">
              {profileState.friendCode}
            </span>
            <Button size="sm" variant="secondary" onClick={handleCopy}>
              Copy
            </Button>
          </div>
        )}
      </SettingsRow>

      <SettingsRow label="Regenerate" description="The old code stops working.">
        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-2">
            {regenerateArmed && (
              <Button size="sm" variant="ghost" onClick={() => setRegenerateArmed(false)}>
                Cancel
              </Button>
            )}
            <Button
              size="sm"
              variant={regenerateArmed ? "destructive" : "secondary"}
              onClick={handleRegenerate}
              disabled={regenerating || profileState.status !== "ready"}
            >
              {regenerateArmed ? "Confirm regenerate" : "Regenerate"}
            </Button>
          </div>
          {regenerateError && (
            <p role="alert" className="text-xs text-destructive">
              {regenerateError}
            </p>
          )}
        </div>
      </SettingsRow>

      <SettingsRow label="Add a friend" description="By Friend Code or email.">
        <form onSubmit={handleSendRequest} className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={addFriendValue}
              onChange={(event) => setAddFriendValue(event.target.value)}
              placeholder="Friend Code or email"
              aria-label="Friend Code or email"
              className="h-9 rounded-md border border-border bg-input/30 px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
            <Button type="submit" size="sm" disabled={sending || addFriendValue.trim() === ""}>
              Send request
            </Button>
          </div>
          {addFriendError && (
            <p role="alert" className="text-xs text-destructive">
              {addFriendError}
            </p>
          )}
        </form>
      </SettingsRow>

      <div className="flex flex-col gap-3 py-4">
        <h2 className="text-sm font-bold">Pending requests</h2>
        {requestActionError && (
          <p role="alert" className="text-sm text-destructive">
            {requestActionError}
          </p>
        )}
        {requestsState.status === "loading" && (
          <p role="status" className="text-sm text-muted-foreground">
            Loading…
          </p>
        )}
        {requestsState.status === "error" && (
          <p role="alert" className="text-sm text-destructive">
            Couldn&apos;t load pending requests.
          </p>
        )}
        {requestsState.status === "ready" && (
          <PendingRequests
            incoming={requestsState.incoming}
            outgoing={requestsState.outgoing}
            busyRequestId={busyRequestId}
            onAccept={handleAccept}
            onDecline={handleDecline}
          />
        )}
      </div>

      <SettingsRow label="Sign out" description="You'll need to sign in again next time.">
        <SignOutButton redirectUrl="/">
          <Button size="sm" variant="secondary">
            Sign out
          </Button>
        </SignOutButton>
      </SettingsRow>

      {copyToastVisible && (
        <p
          role="status"
          className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-full bg-popover px-4 py-2 text-sm font-semibold shadow-lg"
        >
          Friend Code copied
        </p>
      )}
    </div>
  );
}

function SettingsRow({ label, description, children }: { label: string; description: string; children: ReactNode }) {
  return (
    // flex-wrap so a wide, unshrinkable value (e.g. the Friend Code chip + Copy button) drops to
    // its own line on narrow viewports instead of overflowing — html/body clip overflow-x globally.
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-b border-border py-4 last:border-b-0">
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-bold">{label}</span>
        <span className="text-sm text-muted-foreground">{description}</span>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function PendingRequests({
  incoming,
  outgoing,
  busyRequestId,
  onAccept,
  onDecline,
}: {
  incoming: FriendRequestEntry[];
  outgoing: FriendRequestEntry[];
  busyRequestId: string | null;
  onAccept: (id: string) => void;
  onDecline: (id: string) => void;
}) {
  if (incoming.length === 0 && outgoing.length === 0) {
    return <p className="text-sm text-muted-foreground">Nothing pending. Share your code to get started.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {incoming.length > 0 && (
        <div className="flex flex-col gap-1">
          <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Incoming</h3>
          <ul className="flex flex-col">
            {incoming.map((request) => (
              <li
                key={request.id}
                className="flex items-center justify-between gap-3 border-b border-border/50 py-2 last:border-b-0"
              >
                <span className="min-w-0 flex-1 truncate text-sm">{request.email}</span>
                <div className="flex shrink-0 gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => onDecline(request.id)}
                    disabled={busyRequestId === request.id}
                  >
                    Decline
                  </Button>
                  <Button size="sm" onClick={() => onAccept(request.id)} disabled={busyRequestId === request.id}>
                    Accept
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
      {outgoing.length > 0 && (
        <div className="flex flex-col gap-1">
          <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Outgoing</h3>
          <ul className="flex flex-col">
            {outgoing.map((request) => (
              <li
                key={request.id}
                className="flex items-center justify-between gap-3 border-b border-border/50 py-2 last:border-b-0"
              >
                <span className="min-w-0 flex-1 truncate text-sm">{request.email}</span>
                <span className="shrink-0 text-xs text-muted-foreground">Pending</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
