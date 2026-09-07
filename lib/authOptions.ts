// Mirrors the other ("The Clientist") project's auth.ts exactly — same
// Prisma query, same bcrypt check, same JWT/session shape — so a login here
// is verified identically to there. Sessions do NOT carry over between the
// two apps (unrelated domains, no shared cookie), this only shares the
// underlying User table and password check.
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import type { NextAuthOptions } from "next-auth";

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.tempPassword = (user as any).tempPassword;
        token.role = (user as any).role;
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        (session.user as any).id = token.id;
        (session.user as any).tempPassword = token.tempPassword;
        (session.user as any).role = token.role;
      }
      return session;
    },
  },
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        try {
          const user = await prisma.user.findFirst({
            where: { email: { equals: (credentials.email as string).trim(), mode: "insensitive" } },
          });

          if (!user) return null;

          const isValid = await bcrypt.compare(credentials.password as string, user.password);

          if (!isValid) return null;

          return { id: user.id, email: user.email, name: user.name, tempPassword: user.tempPassword, role: user.role } as any;
        } catch (err) {
          console.error("AUTH ERROR:", err);
          return null;
        }
      },
    }),
  ],
};
