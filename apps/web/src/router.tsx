import { createRootRoute, createRoute, createRouter, Navigate, Outlet, useParams } from '@tanstack/react-router';
import { api } from './api/endpoints';
import { AppShell } from './layout/AppShell';
import { OverviewPage } from './features/overview/OverviewPage';
import { validateTicketSearch } from './features/tickets-list/searchParams';
import { TicketsListPage } from './features/tickets-list/TicketsListPage';
import { Placeholder } from './routes/Placeholder';

/**
 * Spec 02: every main view lives under `/projects/$projectId`, so the current project is a
 * route param rather than prop-drilled state — a direct link or refresh lands on the right
 * project, and switching projects is a navigation.
 *
 * Each route is declared explicitly rather than through a factory: TanStack Router infers its
 * type-safe path union from these literals, and a helper function erases them.
 */

const rootRoute = createRootRoute({ component: Outlet });

/** `/` → the first project's overview, so there's no empty landing state. */
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  loader: () => api.projects.list(),
  component: function Index() {
    const projects = indexRoute.useLoaderData();
    if (projects.length === 0) {
      return (
        <div className="flex h-screen items-center justify-center bg-slate-100 text-[14px] text-slate-500">
          No projects yet — seed the database with <span className="mx-1 font-mono">pnpm run db:seed</span>.
        </div>
      );
    }
    return <Navigate to="/projects/$projectId/overview" params={{ projectId: projects[0].id }} replace />;
  },
});

const projectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'projects/$projectId',
  component: Outlet,
});

const overviewRoute = createRoute({
  getParentRoute: () => projectRoute,
  path: 'overview',
  component: () => (
    <AppShell title="Overview">
      <OverviewPage />
    </AppShell>
  ),
});

const ticketsRoute = createRoute({
  getParentRoute: () => projectRoute,
  path: 'tickets',
  // Filters live in the URL (R7), validated by the same shared schema the API enforces.
  validateSearch: validateTicketSearch,
  component: () => (
    <AppShell title="Tickets">
      <TicketsListPage />
    </AppShell>
  ),
});

/** Nested under the project so the sidebar keeps its context (spec 03). */
const ticketDetailRoute = createRoute({
  getParentRoute: () => projectRoute,
  path: 'tickets/$ticketId',
  component: function TicketDetailView() {
    const { ticketId } = useParams({ from: '/projects/$projectId/tickets/$ticketId' });
    return (
      <AppShell title={<span className="font-mono text-[15px]">{ticketId.slice(0, 8)}…</span>}>
        <Placeholder view="Ticket detail" module="M11" />
      </AppShell>
    );
  },
});

const boardRoute = createRoute({
  getParentRoute: () => projectRoute,
  path: 'board',
  component: () => (
    <AppShell title="Board">
      <Placeholder view="Kanban board" module="M10" />
    </AppShell>
  ),
});

const createTicketRoute = createRoute({
  getParentRoute: () => projectRoute,
  path: 'create',
  component: () => (
    <AppShell title="New Ticket">
      <Placeholder view="Create ticket" module="M12" />
    </AppShell>
  ),
});

const peopleRoute = createRoute({
  getParentRoute: () => projectRoute,
  path: 'people',
  component: () => (
    <AppShell title="People">
      <Placeholder view="People & users" module="M13" />
    </AppShell>
  ),
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  projectRoute.addChildren([
    overviewRoute,
    ticketDetailRoute,
    ticketsRoute,
    boardRoute,
    createTicketRoute,
    peopleRoute,
  ]),
]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
