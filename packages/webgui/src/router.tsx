import { createBrowserRouter } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { LoginPage } from '@/pages/LoginPage';
import { RegisterPage } from '@/pages/RegisterPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { TeamsPage } from '@/pages/TeamsPage';
import { TeamDetailPage } from '@/pages/TeamDetailPage';
import { VaultsPage } from '@/pages/VaultsPage';
import { VaultDetailPage } from '@/pages/VaultDetailPage';
import { NoteDetailPage } from '@/pages/NoteDetailPage';
import { NotFoundPage } from '@/pages/NotFoundPage';

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/register',
    element: <RegisterPage />,
  },
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'teams', element: <TeamsPage /> },
      { path: 'teams/:teamId', element: <TeamDetailPage /> },
      { path: 'vaults', element: <VaultsPage /> },
      { path: 'vaults/:vaultId', element: <VaultDetailPage /> },
      { path: 'notes/:noteId', element: <NoteDetailPage /> },
    ],
  },
  {
    path: '*',
    element: <NotFoundPage />,
  },
]);
