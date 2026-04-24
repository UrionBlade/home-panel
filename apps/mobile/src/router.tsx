import { createBrowserRouter, Navigate, RouterProvider } from "react-router-dom";
import { AppShell } from "./components/layout/AppShell";
import { AskPage } from "./pages/AskPage";
import { BoardPage } from "./pages/BoardPage";
import { CalendarPage } from "./pages/CalendarPage";
import { CamerasPage } from "./pages/CamerasPage";
import { CasaPage } from "./pages/CasaPage";
import { HomePage } from "./pages/HomePage";
import { LaundryPage } from "./pages/LaundryPage";
import { LightsPage } from "./pages/LightsPage";
import { MusicPage } from "./pages/MusicPage";
import { RecipesPage } from "./pages/RecipesPage";
import { RoutineEditorPage } from "./pages/RoutineEditorPage";
import { RoutinesPage } from "./pages/RoutinesPage";
import { SettingsPage } from "./pages/SettingsPage";
import { ShoppingPage } from "./pages/ShoppingPage";
import { SpotifyCallbackPage } from "./pages/SpotifyCallbackPage";
import { TimerPage } from "./pages/TimerPage";
import { WeatherPage } from "./pages/WeatherPage";

const router = createBrowserRouter([
  {
    path: "/",
    element: (
      <AppShell hideClock>
        <HomePage />
      </AppShell>
    ),
  },
  {
    path: "/calendar",
    element: (
      <AppShell>
        <CalendarPage />
      </AppShell>
    ),
  },
  {
    path: "/shopping",
    element: (
      <AppShell>
        <ShoppingPage />
      </AppShell>
    ),
  },
  {
    path: "/weather",
    element: (
      <AppShell>
        <WeatherPage />
      </AppShell>
    ),
  },
  {
    path: "/waste",
    element: <Navigate to="/settings#waste" replace />,
  },
  {
    path: "/board",
    element: (
      <AppShell>
        <BoardPage />
      </AppShell>
    ),
  },
  {
    path: "/cameras",
    element: (
      <AppShell>
        <CamerasPage />
      </AppShell>
    ),
  },
  {
    path: "/timers",
    element: (
      <AppShell>
        <TimerPage />
      </AppShell>
    ),
  },
  {
    path: "/recipes",
    element: (
      <AppShell>
        <RecipesPage />
      </AppShell>
    ),
  },
  {
    path: "/laundry",
    element: (
      <AppShell>
        <LaundryPage />
      </AppShell>
    ),
  },
  {
    path: "/lights",
    element: (
      <AppShell>
        <LightsPage />
      </AppShell>
    ),
  },
  {
    path: "/music",
    element: (
      <AppShell>
        <MusicPage />
      </AppShell>
    ),
  },
  {
    path: "/casa",
    element: (
      <AppShell>
        <CasaPage />
      </AppShell>
    ),
  },
  {
    path: "/rooms",
    element: <Navigate to="/casa" replace />,
  },
  {
    path: "/ask",
    element: (
      <AppShell>
        <AskPage />
      </AppShell>
    ),
  },
  {
    path: "/routines",
    element: (
      <AppShell>
        <RoutinesPage />
      </AppShell>
    ),
  },
  {
    path: "/routines/new",
    element: (
      <AppShell>
        <RoutineEditorPage />
      </AppShell>
    ),
  },
  {
    path: "/routines/:id",
    element: (
      <AppShell>
        <RoutineEditorPage />
      </AppShell>
    ),
  },
  {
    path: "/spotify-callback",
    element: <SpotifyCallbackPage />,
  },
  {
    path: "/settings",
    element: (
      <AppShell>
        <SettingsPage />
      </AppShell>
    ),
  },
  {
    path: "*",
    element: <Navigate to="/" replace />,
  },
]);

export function AppRouter() {
  return <RouterProvider router={router} />;
}
