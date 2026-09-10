import { createRootRoute, createRoute, createRouter, Navigate, Outlet } from '@tanstack/react-router';
import { AcceptInvitePage } from './auth/AcceptInvitePage';
import { ChangePasswordPage } from './auth/ChangePasswordPage';
import { LoginPage } from './auth/LoginPage';
import { RequireAuth } from './auth/RequireAuth';
import { SessionsPage } from './auth/SessionsPage';
import { useProjects } from './api/queries';
import { AppShell } from './layout/AppShell';
import { BoardPage } from './features/board/BoardPage';
import { validateBoardSearch } from './features/board/searchParams';
import { CreateTicketPage } from './features/create-ticket/CreateTicketPage';
import { CreateUserPage } from './features/people/CreateUserPage';
import { PeoplePage } from './features/people/PeoplePage';
import { UserDetailPage } from './features/people/UserDetailPage';
import { MembersPage } from './features/project-settings/MembersPage';
import { OverviewPage } from './features/overview/OverviewPage';
import { TicketDetailPage } from './features/ticket-detail/TicketDetailPage';
import { validateTicketSearch } from './features/tickets-list/searchParams';
import { TicketsListPage } from './features/tickets-list/TicketsListPage';

/**
 * Spec 02: every main view lives under `/projects/$projectId`, so the current project is a
 * route param rather than prop-drilled state — a direct link or refresh lands on the right
 * project, and switching projects is a navigation.
 *
 * Each route is declared explicitly rather than through a factory: TanStack Router infers its
 * type-safe path union from these literals, and a helper function erases them.
 *
 * v2 splits the tree in two. `/login` and `/invite/$token` are reachable signed out; everything
 * else hangs off a pathless layout route rendering `RequireAuth`, so a new route is authenticated
 * by default — forgetting to guard one is not a thing that can happen by omission.
 */

const rootRoute = createRootRoute({ component: Outlet });

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  // `next` is the destination the guard bounced away from, echoed back after signing in.
  // Returned conditionally rather than as `{ next: undefined }`, so the key stays optional and
  // `navigate({ to: '/login' })` doesn't have to name a search param it has nothing to say about.
  validateSearch: (search: Record<string, unknown>): { next?: string } =>
    typeof search.next === 'string' ? { next: search.next } : {},
  component: LoginPage,
});

const inviteRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/invite/$token',
  component: AcceptInvitePage,
});

/**
 * Pathless: contributes a guard and no URL segment. The leading underscore is TanStack's
 * convention for such a route, and it does surface — every child's *route id* gains an
 * `/_authed` prefix, which is what `useParams({ from: … })` names. The URLs are unchanged.
 */
const authedRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: '_authed',
  component: RequireAuth,
});

/** `/` → the first project's overview, so there's no empty landing state. */
const indexRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: '/',
  // A hook, not a route loader: loaders run before the guard's component renders, so a loader
  // here would fire an unauthenticated request on every cold load and 401 before bootstrap.
  component: function Index() {
    const { data: projects, isPending } = useProjects();

    if (isPending) {
      return <div className="flex h-screen items-center justify-center bg-slate-100 text-[13px] text-slate-500">Loading…</div>;
    }

    if (!projects || projects.length === 0) {
      return (
        <div className="flex h-screen flex-col items-center justify-center gap-1 bg-slate-100 px-6 text-center text-[14px] text-slate-500">
          <p className="font-medium text-slate-700">No projects yet</p>
          <p>You're not a member of any project. Ask an administrator to add you to one.</p>
        </div>
      );
    }

    return <Navigate to="/projects/$projectId/overview" params={{ projectId: projects[0].id }} replace />;
  },
});

const accountPasswordRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: '/account/password',
  component: () => (
    <AppShell title="Change password">
      <ChangePasswordPage />
    </AppShell>
  ),
});

const accountSessionsRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: '/account/sessions',
  component: () => (
    <AppShell title="Active sessions">
      <SessionsPage />
    </AppShell>
  ),
});

const projectRoute = createRoute({
  getParentRoute: () => authedRoute,
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
  // This page renders its own AppShell so the topbar can show the loaded ticket's key.
  component: TicketDetailPage,
});

const boardRoute = createRoute({
  getParentRoute: () => projectRoute,
  path: 'board',
  validateSearch: validateBoardSearch,
  component: () => (
    <AppShell title="Board">
      <BoardPage />
    </AppShell>
  ),
});

const createTicketRoute = createRoute({
  getParentRoute: () => projectRoute,
  path: 'create',
  component: () => (
    <AppShell title="New Ticket">
      <CreateTicketPage />
    </AppShell>
  ),
});

const peopleRoute = createRoute({
  getParentRoute: () => projectRoute,
  path: 'people',
  component: () => (
    <AppShell title="People">
      <PeoplePage />
    </AppShell>
  ),
});

const createUserRoute = createRoute({
  getParentRoute: () => projectRoute,
  path: 'people/new',
  component: () => (
    <AppShell title="Add team member">
      <CreateUserPage />
    </AppShell>
  ),
});

const userDetailRoute = createRoute({
  getParentRoute: () => projectRoute,
  path: 'people/$userId',
  component: () => (
    <AppShell title="Team member">
      <UserDetailPage />
    </AppShell>
  ),
});

/** Project settings (spec 10 §6). Visible to any member; editable by managers and admins. */
const membersRoute = createRoute({
  getParentRoute: () => projectRoute,
  path: 'settings/members',
  component: () => (
    <AppShell title="Project members">
      <MembersPage />
    </AppShell>
  ),
});

const routeTree = rootRoute.addChildren([
  loginRoute,
  inviteRoute,
  authedRoute.addChildren([
    indexRoute,
    accountPasswordRoute,
    accountSessionsRoute,
    projectRoute.addChildren([
      overviewRoute,
      ticketDetailRoute,
      ticketsRoute,
      boardRoute,
      createTicketRoute,
      peopleRoute,
      createUserRoute,
      userDetailRoute,
      membersRoute,
    ]),
  ]),
]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
