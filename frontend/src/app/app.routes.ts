import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';

export const routes: Routes = [
  {
    path: 'auth',
    children: [
      {
        path: 'login',
        loadComponent: () => import('./auth/login/login.component').then(m => m.LoginComponent)
      },
      {
        path: 'register',
        loadComponent: () => import('./auth/register/register.component').then(m => m.RegisterComponent)
      }
    ]
  },
  {
    path: '',
    loadComponent: () => import('./layout/layout.component').then(m => m.LayoutComponent),
    canActivate: [authGuard],
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      {
        path: 'dashboard',
        loadComponent: () => import('./dashboard/dashboard.component').then(m => m.DashboardComponent)
      },
      {
        path: 'expenses',
        loadComponent: () => import('./expenses/expense-list/expense-list.component').then(m => m.ExpenseListComponent)
      },
      {
        path: 'expenses/new',
        loadComponent: () => import('./expenses/expense-form/expense-form.component').then(m => m.ExpenseFormComponent)
      },
      {
        path: 'expenses/edit/:id',
        loadComponent: () => import('./expenses/expense-form/expense-form.component').then(m => m.ExpenseFormComponent)
      }
    ]
  },
  { path: '**', redirectTo: 'dashboard' }
];
