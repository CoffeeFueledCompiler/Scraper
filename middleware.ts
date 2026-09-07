import { withAuth } from "next-auth/middleware";

// `withAuth` needs `pages.signIn` passed explicitly — it does NOT read it
// from authOptions.ts, so without this it redirects to NextAuth's own
// default /api/auth/signin page instead of our custom /login.
export default withAuth({
  pages: { signIn: "/login" },
});

// Gate everything except the login page and NextAuth's own routes. This is
// what actually stops a random visitor from triggering scrapes/AI calls on a
// publicly deployed URL — the login page alone isn't enough without this.
export const config = {
  matcher: ["/((?!api/auth|login|_next/static|_next/image|favicon.ico).*)"],
};
