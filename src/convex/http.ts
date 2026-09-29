import { httpRouter } from "convex/server";
import { auth } from "./auth";
import { oxaPayWebhook } from "./payments";

const http = httpRouter();

auth.addHttpRoutes(http);

// OxaPay payment callbacks (merchant webhook)
http.route({
  path: "/oxapay-webhook",
  method: "POST",
  handler: oxaPayWebhook,
});

export default http;
