import { createBrowserRouter, Navigate, RouterProvider } from "react-router-dom";
import { AppShell } from "./components/layout/AppShell";
import { BoardPage } from "./pages/BoardPage";
import { CalendarPage } from "./pages/CalendarPage";
import { CamerasPage } from "./pages/CamerasPage";
import { HomePage } from "./pages/HomePage";
import { LaundryPage } from "./pages/LaundryPage";
import { MusicPage } from "./pages/MusicPage";
import { RecipesPage } from "./pages/RecipesPage";
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
    path: "/music",
    element: (
      <AppShell>
        <MusicPage />
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
