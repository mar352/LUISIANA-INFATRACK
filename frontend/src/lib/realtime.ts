import { io, Socket } from "socket.io-client";
import type { AlertItem, HeatPoint, Project, RiskZones, WeatherSnapshot } from "../types";

type Events = {
  hello: (payload: unknown) => void;
  "weather:update": (w: WeatherSnapshot) => void;
  "risk:update": (z: { zones: RiskZones; generatedAt: string }) => void;
  "projects:update": (p: { projects: Project[]; generatedAt: string }) => void;
  "alerts:new": (a: AlertItem) => void;
  "planning:update": (p: { kind?: string; at?: string }) => void;
};

export function connectRealtime(baseUrl: string) {
  // Empty string → connect to same origin (Docker / nginx)
  const socket: Socket<Events> = io(baseUrl || undefined, { transports: ["websocket"] });
  return socket;
}

