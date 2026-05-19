/**
 * Router HTTP do Convex.
 *
 * Registra todas as rotas HTTP expostas publicamente pelo deployment.
 *
 * Rotas disponíveis:
 *   GET /health  → status do worker (200 OK | 503 stale | 500 erro)
 */

import { httpRouter } from "convex/server";
import { healthCheck } from "./health";

const http = httpRouter();

http.route({
  path: "/health",
  method: "GET",
  handler: healthCheck,
});

export default http;
