import { io, Socket } from "socket.io-client";
import type { AlertItem, HeatPoint, Project, RiskZones } from "../types";

type Events = {
  hello: (payload: unknown) => void;
  "risk:update": (z: { zones: RiskZones; generatedAt: string }) => void;
  "projects:update": (p: { projects: Project[]; generatedAt: string }) => void;
  "alerts:new": (a: AlertItem) => void;
  "planning:update": (p: { kind?: string; at?: string }) => void;
};

export function connectRealtime(baseUrl: string) {
  // Empty string → connect to same origin (Docker / nginx)
  const socket: Socket<Events> = io(baseUrl || undefined, {
    transports: ["websocket"],
    withCredentials: true,
  });
  return socket;
}

