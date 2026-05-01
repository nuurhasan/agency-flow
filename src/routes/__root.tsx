import { Outlet, Link, createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as React from "react";

import appCss from "../styles.css?url";
import { AuthProvider } from "@/lib/auth";
import { Toaster } from "@/components/ui/sonner";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md rounded-3xl border border-border bg-card p-10 text-center shadow-soft">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-peach text-peach-ink text-2xl">
          ✦
        </div>
        <h1 className="font-display text-5xl font-bold">404</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          That page wandered off. Let&apos;s get you back to the dashboard.
        </p>
        <Link
          to="/"
          className="mt-6 inline-flex items-center justify-center rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Gloria9 Project Management Internal" },
      {
        name: "description",
        content: "Gloria9 Project Management Internal",
      },
      { property: "og:title", content: "Gloria9 Project Management Internal" },
      {
        property: "og:description",
        content: "Gloria9 Project Management Internal",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:title", content: "Gloria9 Project Management Internal" },
      { name: "description", content: "Agency Flow is a modern, visual project management system for agencies." },
      { property: "og:description", content: "Agency Flow is a modern, visual project management system for agencies." },
      { name: "twitter:description", content: "Agency Flow is a modern, visual project management system for agencies." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/267bceba-5d89-473d-bb1b-7df18e9227b2/id-preview-82eaae2b--b8984a37-ef14-4524-80d7-e03f47628d3e.lovable.app-1777480077400.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/267bceba-5d89-473d-bb1b-7df18e9227b2/id-preview-82eaae2b--b8984a37-ef14-4524-80d7-e03f47628d3e.lovable.app-1777480077400.png" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/png", href: "/gloria9-logo.png" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const [queryClient] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Generous cache so route switches feel instant; data still refreshes in background when stale.
            staleTime: 5 * 60_000,
            gcTime: 30 * 60_000,
            refetchOnWindowFocus: false,
            refetchOnMount: false,
            retry: 1,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Outlet />
        <Toaster richColors position="top-right" />
      </AuthProvider>
    </QueryClientProvider>
  );
}
