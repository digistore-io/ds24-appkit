// Edge-Middleware für Route-Schutz. Nutzt NUR die edge-sichere auth.config
// (kein DB-Import), damit Postgres nicht in die Edge-Runtime gebündelt wird.
import NextAuth from "next-auth";
import authConfig from "@/auth.config";

export const { auth: middleware } = NextAuth(authConfig);

export const config = {
  // Öffentlich bleiben: Startseite, Login, Auth-Routen, Opt-in, IPN-Webhook.
  matcher: ["/dashboard/:path*", "/onboarding/:path*"],
};
