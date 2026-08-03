import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { eq } from "drizzle-orm";
import { getDb, hasDatabase, schema } from "@/lib/db";

function buildProviders() {
  const providers = [];

  if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) {
    providers.push(
      Google({
        clientId: process.env.AUTH_GOOGLE_ID,
        clientSecret: process.env.AUTH_GOOGLE_SECRET,
      }),
    );
  }

  // Dev / bootstrap login when Google OAuth is not configured
  if (process.env.ENABLE_DEV_LOGIN === "true" || !process.env.AUTH_GOOGLE_ID) {
    providers.push(
      Credentials({
        id: "dev-login",
        name: "Acceso demo",
        credentials: {
          email: { label: "Email", type: "email" },
          name: { label: "Nombre", type: "text" },
        },
        async authorize(credentials) {
          const email = String(
            credentials?.email ?? "demo@llevacuentas.local",
          ).toLowerCase();
          const name = String(credentials?.name ?? "Demo");
          if (!email.includes("@")) return null;

          if (!hasDatabase()) {
            return { id: "demo-user", email, name, image: null };
          }

          const db = getDb();
          const existing = await db
            .select()
            .from(schema.users)
            .where(eq(schema.users.email, email))
            .limit(1);
          if (existing[0]) {
            return {
              id: existing[0].id,
              email: existing[0].email,
              name: existing[0].name,
              image: existing[0].image,
            };
          }
          const [created] = await db
            .insert(schema.users)
            .values({ email, name })
            .returning();
          return {
            id: created.id,
            email: created.email,
            name: created.name,
            image: created.image,
          };
        },
      }),
    );
  }

  return providers;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: hasDatabase()
    ? DrizzleAdapter(getDb(), {
        usersTable: schema.users,
        accountsTable: schema.accounts,
        sessionsTable: schema.sessions,
        verificationTokensTable: schema.verificationTokens,
      })
    : undefined,
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: buildProviders(),
  callbacks: {
    async jwt({ token, user }) {
      if (user?.id) token.sub = user.id;
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
      }
      return session;
    },
  },
  trustHost: true,
  secret: process.env.AUTH_SECRET ?? "dev-secret-change-me",
});
