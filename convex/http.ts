/**
 * Router HTTP do Convex.
 *
 * Registra todas as rotas HTTP expostas publicamente pelo deployment.
 *
 * Rotas disponíveis:
 *   GET  /health  → status do worker (200 OK | 503 stale | 500 erro)
 *   POST /api     → gateway autenticado para internal functions (Bearer token)
 */

import { httpRouter } from "convex/server";
import { healthCheck } from "./health";
import { gateway } from "./gateway";

const http = httpRouter();

http.route({
  path: "/health",
  method: "GET",
  handler: healthCheck,
});

http.route({
  path: "/api",
  method: "POST",
  handler: gateway,
});

export default http;
