import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getWsUrl, LIVE_EVENTS_ENABLED } from "../api/ws";
import { SYSTEM_STATUS_QUERY_KEY } from "../hooks/useSystemStatus";
import { useAuth } from "../hooks/useAuth";

interface EventsContextValue {
  latestEvent: any;
  connected: boolean;
  socketState: "CONNECTING" | "OPEN" | "CLOSING" | "CLOSED";
  lastEventTime: Date | null;
}

const EventsContext = createContext<EventsContextValue>({
  latestEvent: null,
  connected: false,
  socketState: "CLOSED",
  lastEventTime: null,
});

export const EventsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [latestEvent, setLatestEvent] = useState<any>(null);
  const [connected, setConnected] = useState(false);
  const [socketState, setSocketState] = useState<"CONNECTING" | "OPEN" | "CLOSING" | "CLOSED">("CLOSED");
  const [lastEventTime, setLastEventTime] = useState<Date | null>(null);

  // Debounced batched invalidation
  const pendingInvalidationsRef = useRef<Set<string>>(new Set());
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout>>(null);
  const backoffDelayRef = useRef<number>(1000);

  const flushInvalidations = useCallback(() => {
    const keys = Array.from(pendingInvalidationsRef.current);
    pendingInvalidationsRef.current.clear();
    debounceTimerRef.current = null;

    if (keys.length === 0) return;

    keys.forEach((key) => {
      queryClient.invalidateQueries({ queryKey: [key] });
    });
  }, [queryClient]);

  const scheduleInvalidation = useCallback((queryKey: string) => {
    pendingInvalidationsRef.current.add(queryKey);
    if (!debounceTimerRef.current) {
      debounceTimerRef.current = setTimeout(flushInvalidations, 500);
    }
  }, [flushInvalidations]);

  useEffect(() => {
    // Only connect when user is logged in
    if (!user) {
      setConnected(false);
      setSocketState("CLOSED");
      return;
    }
    // Serverless mode (VITE_LIVE_EVENTS=off): the API is reached over HTTP polling, so the
    // platform is online even though no socket is held open.
    if (!LIVE_EVENTS_ENABLED) {
      setConnected(true);
      setSocketState("CLOSED");
      return;
    }

    let ws: WebSocket | null = null;
    let active = true;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      if (!active) return;
      setSocketState("CONNECTING");
      const url = getWsUrl("/ws/events");

      try {
        ws = new WebSocket(url);

        ws.onopen = () => {
          if (!active) return;
          setConnected(true);
          setSocketState("OPEN");
          backoffDelayRef.current = 1000; // Reset exponential back-off
        };

        ws.onmessage = (event) => {
          if (!active) return;
          try {
            const data = JSON.parse(event.data);
            setLatestEvent(data);
            setLastEventTime(new Date());

            // Target invalidations based on event payload
            const id = data.job_id || "";
            if (data.type === "complete" || data.type === "failed") {
              scheduleInvalidation("systemStatus");
              scheduleInvalidation("recentJobsForPipeline");
              scheduleInvalidation("recentJobsForProvenance");
              scheduleInvalidation("recentJobsForLab");
              if (id.startsWith("BENCH-")) {
                scheduleInvalidation("benchmarks");
              } else if (id.startsWith("JOB-")) {
                scheduleInvalidation(`jobSummary-${id}`);
              }
            } else if (data.type === "stage" && (data.stage === "DECISION" || data.stage === "AUDIT")) {
              scheduleInvalidation("systemStatus");
            }
          } catch {}
        };

        ws.onerror = () => {
          if (!active) return;
          setConnected(false);
          setSocketState("CLOSED");
        };

        ws.onclose = (ev) => {
          if (!active) return;
          setConnected(false);
          setSocketState("CLOSED");

          // If closed because login required, do not reconnect until authenticated
          if (ev.code === 4401) {
            return;
          }

          // Exponential back-off
          const delay = backoffDelayRef.current;
          backoffDelayRef.current = Math.min(16000, delay * 2);
          reconnectTimeout = setTimeout(connect, delay);
        };
      } catch {
        if (!active) return;
        setConnected(false);
        setSocketState("CLOSED");
        const delay = backoffDelayRef.current;
        backoffDelayRef.current = Math.min(16000, delay * 2);
        reconnectTimeout = setTimeout(connect, delay);
      }
    };

    connect();

    return () => {
      active = false;
      if (ws) ws.close();
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [user?.id, scheduleInvalidation]);

  return (
    <EventsContext.Provider value={{ latestEvent, connected, socketState, lastEventTime }}>
      {children}
    </EventsContext.Provider>
  );
};

export const useGlobalEventsContext = () => useContext(EventsContext);
